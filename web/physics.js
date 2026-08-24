/**
 * Bouncing Ball - physics core.
 *
 * A direct port of the Python `bouncing_ball.world` module: same integrator,
 * same wall reflection, same impulse-based ball-to-ball response. It touches
 * no DOM API, so it runs unchanged in the browser and under Node (see
 * `physics.test.js`).
 *
 * A bounce is a reflection of the velocity vector about the surface normal:
 *
 *     v_out = v - 2 * (v . n) * n
 *
 * For an axis-aligned wall the normal is (+/-1, 0) or (0, +/-1), so that
 * collapses to "flip one component".
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api; // Node, for the tests
  } else {
    root.BouncingBallPhysics = api; // browser, via <script src>
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Balls slower than this rest on the floor instead of jittering forever. */
  const REST_SPEED = 8;
  /** Separate overlaps by a hair more than the overlap to dodge float error. */
  const SEPARATION_SLACK = 1.01;
  /** Longest slice of time a single step will simulate (tab-switch guard). */
  const MAX_STEP = 0.05;

  const PALETTE = [
    '#ff5c8a', '#ffd166', '#06d6a0', '#4cc9f0', '#b892ff', '#ff8b3d',
  ];

  const DEFAULTS = {
    ballCount: 7,
    minRadius: 12,
    maxRadius: 34,
    minSpeed: 160,
    maxSpeed: 340,
    gravity: 0,
    gravityStrength: 900,
    restitution: 1,
    airDrag: 0,
    maxSpeedCap: 1600,
    ballCollisions: true,
    substeps: 2,
    trailLength: 16,
  };

  /**
   * A small seedable generator, so a `?seed=` in the URL replays exactly the
   * same run. Math.random cannot be seeded, hence the hand-rolled mulberry32.
   */
  function makeRandom(seed) {
    if (seed === null || seed === undefined) return Math.random;
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Ball {
    constructor(x, y, vx, vy, radius, color) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.radius = radius;
      this.color = color;
      this.id = Ball.nextId++;
      /** Recent positions, newest last, used to draw the comet trail. */
      this.trail = [];
      /** Frames since the last impact; the renderer flashes on a fresh hit. */
      this.sinceImpact = 999;
    }

    /** Mass follows the disc area, so a big ball shoves a small one aside. */
    get mass() {
      return Math.PI * this.radius * this.radius;
    }

    get inverseMass() {
      return 1 / this.mass;
    }

    get speed() {
      return Math.hypot(this.vx, this.vy);
    }

    get kineticEnergy() {
      return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy);
    }
  }
  Ball.nextId = 1;

  class World {
    /**
     * @param {number} width  arena width in pixels
     * @param {number} height arena height in pixels
     * @param {object} options overrides for DEFAULTS
     */
    constructor(width, height, options) {
      this.settings = Object.assign({}, DEFAULTS, options || {});
      this.random = makeRandom(this.settings.seed);
      this.balls = [];
      this.width = width;
      this.height = height;
      this.elapsed = 0;
      this.bounceCount = 0;
      this.lastCollisions = [];
      this.populate(this.settings.ballCount);
    }

    /** Canvas coordinates: origin top-left, +y down. */
    get left() { return 0; }
    get top() { return 0; }
    get right() { return this.width; }
    get bottom() { return this.height; }

    resize(width, height) {
      this.width = Math.max(width, 80);
      this.height = Math.max(height, 80);
      // Pull anything now outside the smaller arena back in.
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

    /** Add one ball, trying not to drop it on top of an existing one. */
    spawnBall(attempts) {
      const s = this.settings;
      const tries = attempts || 60;
      let fallback = null;
      for (let i = 0; i < tries; i += 1) {
        const radius = lerp(s.minRadius, s.maxRadius, this.random());
        const angle = this.random() * Math.PI * 2;
        const speed = lerp(s.minSpeed, s.maxSpeed, this.random());
        const candidate = new Ball(
          lerp(radius, this.width - radius, this.random()),
          lerp(radius, this.height - radius, this.random()),
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          radius,
          PALETTE[Math.floor(this.random() * PALETTE.length) % PALETTE.length]
        );
        if (!this.overlapsAny(candidate)) {
          this.balls.push(candidate);
          return candidate;
        }
        fallback = fallback || candidate;
      }
      this.balls.push(fallback);
      return fallback;
    }

    removeBall() {
      return this.balls.length > 1 ? this.balls.pop() : null;
    }

    setBallCount(count) {
      while (this.balls.length > count && this.removeBall()) { /* shrink */ }
      while (this.balls.length < count) this.spawnBall();
    }

    overlapsAny(candidate) {
      return this.balls.some((other) => {
        const distance = Math.hypot(candidate.x - other.x, candidate.y - other.y);
        return distance < candidate.radius + other.radius;
      });
    }

    /** Advance the simulation by `dt` seconds. */
    step(dt) {
      const slice = Math.min(dt, MAX_STEP);
      const subDt = slice / this.settings.substeps;
      this.lastCollisions = [];
      for (let i = 0; i < this.settings.substeps; i += 1) {
        this.integrate(subDt);
        this.resolveWalls();
        if (this.settings.ballCollisions) this.resolveBallPairs();
      }
      this.elapsed += slice;
      this.recordTrails();
      return this.lastCollisions;
    }

    integrate(dt) {
      const s = this.settings;
      const damping = Math.max(0, 1 - s.airDrag * dt);
      for (const ball of this.balls) {
        let vx = ball.vx * damping;
        let vy = (ball.vy + s.gravity * dt) * damping; // +y is down on canvas
        const speed = Math.hypot(vx, vy);
        if (speed > s.maxSpeedCap) {
          const scale = s.maxSpeedCap / speed;
          vx *= scale;
          vy *= scale;
        }
        ball.vx = vx;
        ball.vy = vy;
        ball.x += vx * dt;
        ball.y += vy * dt;
        ball.sinceImpact += 1;
      }
    }

    /**
     * Keep every ball inside the arena. Position is corrected *before* the
     * velocity flips: clamping first is what stops a ball ever ending a frame
     * outside the box, which is how the naive "flip the sign" check gets balls
     * stuck vibrating in a wall.
     */
    resolveWalls() {
      const restitution = this.settings.restitution;
      for (const ball of this.balls) {
        let nx = 0;
        let ny = 0;

        if (ball.x - ball.radius < this.left) {
          ball.x = this.left + ball.radius;
          if (ball.vx < 0) ball.vx = -ball.vx * restitution;
          nx = 1;
        } else if (ball.x + ball.radius > this.right) {
          ball.x = this.right - ball.radius;
          if (ball.vx > 0) ball.vx = -ball.vx * restitution;
          nx = -1;
        }

        if (ball.y - ball.radius < this.top) {
          ball.y = this.top + ball.radius;
          if (ball.vy < 0) ball.vy = -ball.vy * restitution;
          ny = 1;
        } else if (ball.y + ball.radius > this.bottom) {
          ball.y = this.bottom - ball.radius;
          if (ball.vy > 0) ball.vy = -ball.vy * restitution;
          ny = -1;
          // Settle instead of dribbling forever under gravity.
          if (this.settings.gravity > 0 && Math.abs(ball.vy) < REST_SPEED) {
            ball.vy = 0;
          }
        }

        if (nx !== 0 || ny !== 0) {
          this.bounceCount += 1;
          ball.sinceImpact = 0;
          this.lastCollisions.push({
            ball,
            x: ball.x,
            y: ball.y,
            speed: nx !== 0 ? Math.abs(ball.vx) : Math.abs(ball.vy),
            wall: true,
          });
        }
      }
    }

    resolveBallPairs() {
      const balls = this.balls;
      for (let i = 0; i < balls.length; i += 1) {
        for (let j = i + 1; j < balls.length; j += 1) {
          this.resolvePair(balls[i], balls[j]);
        }
      }
    }

    resolvePair(a, b) {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      const contact = a.radius + b.radius;
      if (distance >= contact) return;

      let nx;
      let ny;
      if (distance === 0) {
        // Perfectly concentric: nudge apart along a random axis.
        const angle = this.random() * Math.PI * 2;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
        distance = 1e-6;
      } else {
        nx = dx / distance;
        ny = dy / distance;
      }

      // 1. Separate the overlap, split by inverse mass so the lighter ball
      //    moves further.
      const overlap = (contact - distance) * SEPARATION_SLACK;
      const invA = a.inverseMass;
      const invB = b.inverseMass;
      const invTotal = invA + invB;
      a.x -= nx * (overlap * invA / invTotal);
      a.y -= ny * (overlap * invA / invTotal);
      b.x += nx * (overlap * invB / invTotal);
      b.y += ny * (overlap * invB / invTotal);

      // 2. Impulse, but only if the two are actually closing in. Without this
      //    guard, separating balls get pulled back together and stick.
      const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (approach >= 0) return;

      const impulse = -(1 + this.settings.restitution) * approach / invTotal;
      a.vx -= nx * impulse * invA;
      a.vy -= ny * impulse * invA;
      b.vx += nx * impulse * invB;
      b.vy += ny * impulse * invB;

      a.sinceImpact = 0;
      b.sinceImpact = 0;
      this.bounceCount += 1;
      this.lastCollisions.push({
        ball: a,
        other: b,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        speed: Math.abs(approach),
        wall: false,
      });
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

    /** Shove every ball away from a point - the click / touch interaction. */
    push(x, y, strength) {
      const power = strength === undefined ? 60000 : strength;
      for (const ball of this.balls) {
        const dx = ball.x - x;
        const dy = ball.y - y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const force = power / (distance + 60);
        ball.vx += (dx / distance) * force;
        ball.vy += (dy / distance) * force;
      }
    }

    scaleSpeed(factor) {
      for (const ball of this.balls) {
        ball.vx *= factor;
        ball.vy *= factor;
      }
    }

    setGravity(enabled) {
      this.settings.gravity = enabled ? this.settings.gravityStrength : 0;
    }

    get gravityEnabled() {
      return this.settings.gravity > 0;
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

  function clamp(value, low, high) {
    return Math.min(Math.max(value, low), high);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  return { Ball, World, PALETTE, DEFAULTS, makeRandom, clamp, lerp };
});
