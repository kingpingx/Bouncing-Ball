/**
 * Bouncing Ball - the *original* approach, ported to JavaScript.
 *
 * A direct port of `legacy/original_fixed.py`: the slope-and-angle version
 * this project started with, with its bugs fixed. It exists so the demo can
 * run the old physics and the new physics side by side, on the same canvas,
 * with the same renderer.
 *
 * The difference from `physics.js` is the *representation*, not the maths.
 * Here a ball's motion is a scalar `speed` plus a `heading` in degrees - the
 * turtle-graphics state model - and a bounce is a reflection of that heading
 * about the wall's own angle `w`:
 *
 *     h_out = 2w - h
 *
 * A vertical wall is w = 90, so the reflection is `180 - h`. A horizontal wall
 * is w = 0, so it is `-h`. In a corner both fire and compose to `h - 180`, a
 * clean reversal, which is why there is no corner special case here (the very
 * first version opened with four of them).
 *
 * What this engine deliberately does *not* have, because the original did not:
 * gravity, restitution, and any ball-to-ball response. Balls pass straight
 * through each other. That absence is the point of the comparison - see
 * `docs/physics.md`.
 *
 * Touches no DOM API, so it runs unchanged in the browser and under Node
 * (see `legacy.test.js`).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./physics.js')); // Node, for the tests
  } else {
    root.BouncingBallLegacy = factory(root.BouncingBallPhysics); // browser
  }
})(typeof self !== 'undefined' ? self : this, function (physics) {
  'use strict';

  const { makeRandom, clamp, lerp, PALETTE } = physics;

  const DEG = Math.PI / 180;
  /** Longest slice of time a single step will simulate (tab-switch guard). */
  const MAX_STEP = 0.05;

  const DEFAULTS = {
    /** The original drew exactly one ball. */
    ballCount: 1,
    /** `shapesize(3)` in the original: a 60 px ball, so a 30 px radius. */
    radius: 30,
    /** `SPEED = 260.0`, in pixels per second rather than per loop iteration. */
    speed: 260,
    maxSpeedCap: 1600,
    trailLength: 16,
    // Accepted so the two engines take the same options object, but unused:
    // the original approach had no notion of any of them.
    gravity: 0,
    restitution: 1,
    ballCollisions: false,
  };

  /** Fold any angle back into [0, 360), the way `setheading()` does. */
  function normalizeHeading(degrees) {
    const wrapped = degrees % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
  }

  class LegacyBall {
    constructor(x, y, heading, speed, radius, color) {
      this.x = x;
      this.y = y;
      /** Degrees, counter-clockwise from east. The whole state model. */
      this.heading = normalizeHeading(heading);
      this.speed = speed;
      this.radius = radius;
      this.color = color;
      this.id = LegacyBall.nextId++;
      this.trail = [];
      this.sinceImpact = 999;
    }

    /**
     * Velocity components, derived on demand.
     *
     * The canvas has +y pointing *down* while turtle headings grow
     * counter-clockwise, so the y component carries a minus sign. Applying
     * that one flip consistently is what lets the reflection formulas above
     * stay in their original turtle form.
     *
     * These are accessors rather than stored fields so the renderer and the
     * drag-to-fling handler can treat a legacy ball exactly like a vector one.
     */
    get vx() {
      return Math.cos(this.heading * DEG) * this.speed;
    }

    get vy() {
      return -Math.sin(this.heading * DEG) * this.speed;
    }

    set vx(value) {
      this.setVelocity(value, this.vy);
    }

    set vy(value) {
      this.setVelocity(this.vx, value);
    }

    /**
     * Go the other way: a vector back into a heading and a speed. Every
     * interaction that thinks in vectors - a fling, a shockwave - has to pay
     * this conversion, which is exactly the awkwardness the rewrite removed.
     */
    setVelocity(vx, vy) {
      const speed = Math.hypot(vx, vy);
      // A ball is stopped by writing vx and vy one after the other, and the
      // trig round trip in between leaves a residue on the order of 1e-14.
      // Snap that to a real standstill, and keep the last heading rather than
      // reading a direction out of the noise.
      if (speed <= 1e-9) {
        this.speed = 0;
        return;
      }
      this.speed = speed;
      this.heading = normalizeHeading(Math.atan2(-vy, vx) / DEG);
    }

    /** Mass and energy are for the HUD readout; this engine never uses them. */
    get mass() {
      return Math.PI * this.radius * this.radius;
    }

    get kineticEnergy() {
      return 0.5 * this.mass * this.speed * this.speed;
    }
  }
  LegacyBall.nextId = 1;

  class LegacyWorld {
    /**
     * @param {number} width  arena width in pixels
     * @param {number} height arena height in pixels
     * @param {object} options overrides for DEFAULTS
     */
    constructor(width, height, options) {
      this.settings = Object.assign({}, DEFAULTS, options || {});
      // Take the shared options object, then pin the three things this engine
      // cannot do back to what it actually does, so the HUD never advertises a
      // setting that is quietly being ignored.
      this.settings.gravity = 0;
      this.settings.restitution = 1;
      this.settings.ballCollisions = false;
      this.random = makeRandom(this.settings.seed);
      this.balls = [];
      this.width = width;
      this.height = height;
      this.elapsed = 0;
      this.bounceCount = 0;
      this.lastCollisions = [];
      this.populate(this.settings.ballCount);
    }

    /** Which controls this engine can honour. The UI greys out the rest. */
    get capabilities() {
      return { gravity: false, restitution: false, ballCollisions: false };
    }

    get left() { return 0; }
    get top() { return 0; }
    get right() { return this.width; }
    get bottom() { return this.height; }

    resize(width, height) {
      this.width = Math.max(width, 80);
      this.height = Math.max(height, 80);
      for (const ball of this.balls) {
        ball.radius = Math.min(ball.radius, Math.min(this.width, this.height) / 2 - 1);
        ball.x = clamp(ball.x, ball.radius, this.width - ball.radius);
        ball.y = clamp(ball.y, ball.radius, this.height - ball.radius);
        ball.trail.length = 0;
      }
    }

    populate(count) {
      this.balls.length = 0;
      for (let i = 0; i < count; i += 1) this.spawnBall();
    }

    /**
     * One ball, at a random spot, on a random heading - `setheading(uniform(0,
     * 360))` in the original. Every ball is the same size and the same speed,
     * because the original had a single `RADIUS` and a single `SPEED`.
     */
    spawnBall() {
      const s = this.settings;
      const radius = Math.min(s.radius, Math.min(this.width, this.height) / 2 - 1);
      const ball = new LegacyBall(
        lerp(radius, this.width - radius, this.random()),
        lerp(radius, this.height - radius, this.random()),
        this.random() * 360,
        s.speed,
        radius,
        PALETTE[Math.floor(this.random() * PALETTE.length) % PALETTE.length]
      );
      this.balls.push(ball);
      return ball;
    }

    removeBall() {
      return this.balls.length > 1 ? this.balls.pop() : null;
    }

    setBallCount(count) {
      while (this.balls.length > count && this.removeBall()) { /* shrink */ }
      while (this.balls.length < count) this.spawnBall();
    }

    /** Advance the simulation by `dt` seconds. */
    step(dt) {
      const slice = Math.min(dt, MAX_STEP);
      this.lastCollisions = [];
      for (const ball of this.balls) this.advance(ball, slice);
      this.elapsed += slice;
      this.recordTrails();
      return this.lastCollisions;
    }

    /**
     * One frame for one ball: `forward()`, then bounce off any wall reached.
     * This is `step()` from `legacy/original_fixed.py`, line for line.
     */
    advance(ball, dt) {
      ball.x += Math.cos(ball.heading * DEG) * ball.speed * dt;
      ball.y -= Math.sin(ball.heading * DEG) * ball.speed * dt;
      ball.sinceImpact += 1;

      const left = ball.radius;
      const right = this.width - ball.radius;
      const top = ball.radius;
      const bottom = this.height - ball.radius;
      let hit = false;

      if (ball.x < left || ball.x > right) {
        // Clamp to the wall *first*. Turning without clamping is how the very
        // first version could sit inside the wall for two frames and turn
        // twice - the bug its stray `forward(2)` was papering over.
        ball.x = clamp(ball.x, left, right);
        ball.heading = normalizeHeading(180 - ball.heading); // vertical, w = 90
        hit = true;
      }

      if (ball.y < top || ball.y > bottom) {
        ball.y = clamp(ball.y, top, bottom);
        ball.heading = normalizeHeading(-ball.heading);      // horizontal, w = 0
        hit = true;
      }

      // In a corner both branches ran and composed to h -> h - 180, a clean
      // reversal. No corner case needed.
      if (hit) {
        this.bounceCount += 1;
        ball.sinceImpact = 0;
        this.lastCollisions.push({
          ball,
          x: ball.x,
          y: ball.y,
          speed: ball.speed,
          wall: true,
        });
      }
    }

    recordTrails() {
      const limit = this.settings.trailLength;
      for (const ball of this.balls) {
        ball.trail.push(ball.x, ball.y);
        while (ball.trail.length > limit * 2) ball.trail.splice(0, 2);
      }
    }

    clearTrails() {
      for (const ball of this.balls) ball.trail.length = 0;
    }

    /**
     * The click shockwave. There is no velocity vector to add an impulse to,
     * so each ball is converted to one, pushed, and converted back - the exact
     * round trip the vector engine never has to make.
     */
    push(x, y, strength) {
      const power = strength === undefined ? 60000 : strength;
      for (const ball of this.balls) {
        const dx = ball.x - x;
        const dy = ball.y - y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const force = power / (distance + 60);
        ball.setVelocity(
          ball.vx + (dx / distance) * force,
          ball.vy + (dy / distance) * force
        );
        this.capSpeed(ball);
      }
    }

    /** Speed is a scalar here, so scaling it needs no vector maths at all. */
    scaleSpeed(factor) {
      for (const ball of this.balls) {
        ball.speed *= factor;
        this.capSpeed(ball);
      }
    }

    capSpeed(ball) {
      ball.speed = Math.min(ball.speed, this.settings.maxSpeedCap);
    }

    /** Accepted and ignored: the original approach had no gravity. */
    setGravity() {
      this.settings.gravity = 0;
    }

    get gravityEnabled() {
      return false;
    }

    get totalKineticEnergy() {
      return this.balls.reduce((sum, ball) => sum + ball.kineticEnergy, 0);
    }

    get totalMomentum() {
      return this.balls.reduce(
        (sum, ball) => ({
          x: sum.x + ball.vx * ball.mass,
          y: sum.y + ball.vy * ball.mass,
        }),
        { x: 0, y: 0 }
      );
    }

    /** True if any ball has left the arena - this should never happen. */
    anyBallEscaped() {
      return this.balls.some(
        (ball) =>
          ball.x < ball.radius - 0.5 ||
          ball.x > this.width - ball.radius + 0.5 ||
          ball.y < ball.radius - 0.5 ||
          ball.y > this.height - ball.radius + 0.5
      );
    }

    reset() {
      this.elapsed = 0;
      this.bounceCount = 0;
      this.populate(this.settings.ballCount);
    }
  }

  return { LegacyBall, LegacyWorld, DEFAULTS, normalizeHeading };
});
