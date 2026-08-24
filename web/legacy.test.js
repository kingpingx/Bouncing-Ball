/**
 * Headless tests for the original slope-and-angle engine. No DOM, no canvas.
 *
 *   node web/legacy.test.js
 *
 * These check two separate things: that the old engine is *correct* (it keeps
 * the ball in the box and reflects it properly), and that it is *faithful* -
 * constant speed, no gravity, no ball-to-ball response, exactly like the
 * version this project started with.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LegacyBall, LegacyWorld, normalizeHeading } = require('./legacy.js');

const makeWorld = (options) =>
  new LegacyWorld(800, 600, Object.assign({ seed: 1234, ballCount: 1 }, options));

/** A world with one ball placed and aimed exactly where the test wants it. */
function aimed(x, y, heading, options) {
  const world = makeWorld(options);
  const ball = world.balls[0];
  ball.x = x;
  ball.y = y;
  ball.heading = normalizeHeading(heading);
  return { world, ball };
}

test('a heading is folded into [0, 360)', () => {
  assert.equal(normalizeHeading(0), 0);
  assert.equal(normalizeHeading(-90), 270);
  assert.equal(normalizeHeading(450), 90);
  assert.equal(normalizeHeading(-450), 270);
});

test('heading and speed round-trip through the velocity accessors', () => {
  const ball = new LegacyBall(0, 0, 30, 200, 10, '#fff');
  // Heading 30 deg, and canvas +y points down, so vy is negative: up-right.
  assert.ok(Math.abs(ball.vx - 200 * Math.cos(Math.PI / 6)) < 1e-9);
  assert.ok(ball.vy < 0);

  ball.setVelocity(0, -100); // straight up
  assert.ok(Math.abs(ball.heading - 90) < 1e-9);
  assert.ok(Math.abs(ball.speed - 100) < 1e-9);
});

test('zeroing both components is a true standstill, not float residue', () => {
  // This is what the renderer does every frame while a ball is being dragged.
  const ball = new LegacyBall(0, 0, 217, 200, 10, '#fff');
  ball.vx = 0;
  ball.vy = 0;
  assert.equal(ball.speed, 0);
  assert.ok(Number.isFinite(ball.heading), 'still pointing somewhere definite');
});

test('a held-then-flung ball ends up on the flung heading', () => {
  // The full drag sequence: pinned at zero for a while, then two writes.
  const ball = new LegacyBall(0, 0, 217, 200, 10, '#fff');
  for (let i = 0; i < 5; i += 1) {
    ball.vx = 0;
    ball.vy = 0;
  }
  ball.vx = -30;
  ball.vy = -40; // up and to the left
  assert.ok(Math.abs(ball.speed - 50) < 1e-9);
  assert.ok(Math.abs(ball.heading - 126.869897) < 1e-5);
});

test('travelling straight up is fine - the case the slope version could not do', () => {
  // (y2 - y1) / (x2 - x1) is a division by zero here. A heading is not.
  const { world, ball } = aimed(400, 300, 90);
  for (let i = 0; i < 600; i += 1) {
    world.step(1 / 60);
    assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y), `frame ${i}`);
  }
  assert.equal(world.anyBallEscaped(), false);
  assert.ok(world.bounceCount > 0, 'bounced off the top and bottom');
});

test('a vertical wall reflects the heading as 180 - h', () => {
  const { world, ball } = aimed(800 - 30 - 1, 300, 20);
  world.step(1 / 60);
  assert.ok(Math.abs(ball.heading - 160) < 1e-9);
});

test('a horizontal wall reflects the heading as -h', () => {
  const { world, ball } = aimed(400, 30 + 1, 70);
  world.step(1 / 60);
  assert.ok(Math.abs(ball.heading - 290) < 1e-9); // -70 folded into range
});

test('a corner composes both reflections into a clean reversal', () => {
  const { world, ball } = aimed(800 - 30 - 1, 30 + 1, 40);
  world.step(1 / 60);
  // 40 -> 180 - 40 = 140 -> -140 -> 220, which is 40 - 180. A U-turn.
  assert.ok(Math.abs(ball.heading - 220) < 1e-9);
});

test('balls never leave the arena', () => {
  const world = makeWorld({ ballCount: 8 });
  for (let i = 0; i < 3000; i += 1) {
    world.step(1 / 60);
    assert.equal(world.anyBallEscaped(), false, `escaped on frame ${i}`);
  }
});

test('a ball started outside is pulled back in', () => {
  const { world, ball } = aimed(99999, -99999, 45);
  world.step(1 / 60);
  assert.equal(world.anyBallEscaped(), false);
  assert.ok(ball.x <= world.width && ball.y >= 0);
});

test('speed is constant across a bounce - this engine has no restitution', () => {
  const world = makeWorld({ ballCount: 4, restitution: 0.5 });
  const before = world.balls.map((ball) => ball.speed);
  for (let i = 0; i < 1200; i += 1) world.step(1 / 60);
  assert.ok(world.bounceCount > 0, 'something actually bounced');
  world.balls.forEach((ball, i) => {
    assert.ok(Math.abs(ball.speed - before[i]) < 1e-9, 'speed unchanged');
  });
  // The option was accepted but pinned, so the UI cannot misreport it.
  assert.equal(world.settings.restitution, 1);
});

test('gravity is accepted and ignored', () => {
  const world = makeWorld({ gravity: 900 });
  world.setGravity(true);
  assert.equal(world.gravityEnabled, false);
  const { ball } = aimed(400, 300, 0);
  const speed = ball.speed;
  for (let i = 0; i < 120; i += 1) world.step(1 / 60);
  assert.ok(Math.abs(ball.speed - speed) < 1e-9, 'nothing pulled it downwards');
});

test('balls pass straight through each other', () => {
  const world = makeWorld({ ballCount: 2, ballCollisions: true });
  const [a, b] = world.balls;
  Object.assign(a, { x: 300, y: 300, heading: 0, speed: 200 });
  Object.assign(b, { x: 360, y: 300, heading: 180, speed: 200 });
  for (let i = 0; i < 30; i += 1) world.step(1 / 60);
  // Head on and overlapping, yet each kept its original heading.
  assert.equal(a.heading, 0);
  assert.equal(b.heading, 180);
  assert.equal(world.settings.ballCollisions, false);
});

test('the arena reports itself as unable to do the things it cannot do', () => {
  const caps = makeWorld().capabilities;
  assert.deepEqual(caps, { gravity: false, restitution: false, ballCollisions: false });
});

test('every ball is the original size and speed', () => {
  const world = makeWorld({ ballCount: 5 });
  for (const ball of world.balls) {
    assert.equal(ball.radius, 30);  // shapesize(3)
    assert.equal(ball.speed, 260);  // SPEED
  }
});

test('adding and removing balls stops at one', () => {
  const world = makeWorld({ ballCount: 3 });
  world.setBallCount(9);
  assert.equal(world.balls.length, 9);
  world.setBallCount(1);
  assert.equal(world.balls.length, 1);
  assert.equal(world.removeBall(), null);
});

test('resizing keeps every ball inside the new arena', () => {
  const world = makeWorld({ ballCount: 6 });
  for (let i = 0; i < 100; i += 1) world.step(1 / 60);
  world.resize(300, 220);
  assert.equal(world.anyBallEscaped(), false);
  for (let i = 0; i < 600; i += 1) world.step(1 / 60);
  assert.equal(world.anyBallEscaped(), false);
});

test('a push accelerates balls away from the point', () => {
  const world = new LegacyWorld(1000, 1000, { seed: 4, ballCount: 1 });
  const ball = world.balls[0];
  Object.assign(ball, { x: 600, y: 500, heading: 90, speed: 0 });
  world.push(500, 500);
  assert.ok(ball.vx > 0, 'pushed to the right, away from the click');
});

test('speed scaling respects the cap', () => {
  const world = makeWorld({ ballCount: 2 });
  for (let i = 0; i < 50; i += 1) world.scaleSpeed(2);
  for (const ball of world.balls) {
    assert.ok(ball.speed <= world.settings.maxSpeedCap + 1e-6);
  }
});

test('a seeded world replays identically', () => {
  const run = () => {
    const world = new LegacyWorld(800, 600, { seed: 99, ballCount: 3 });
    for (let i = 0; i < 400; i += 1) world.step(1 / 60);
    return world.balls.map((ball) => [ball.x, ball.y, ball.heading]);
  };
  assert.deepEqual(run(), run());
});

test('reset restores the configured count and clears counters', () => {
  const world = makeWorld({ ballCount: 4 });
  for (let i = 0; i < 100; i += 1) world.step(1 / 60);
  world.reset();
  assert.equal(world.balls.length, 4);
  assert.equal(world.bounceCount, 0);
  assert.equal(world.elapsed, 0);
});
