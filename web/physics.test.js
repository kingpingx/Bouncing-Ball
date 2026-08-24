/**
 * Headless tests for the browser physics core. No DOM, no canvas.
 *
 *   node web/physics.test.js
 *
 * Uses only Node built-ins so there is nothing to install.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Ball, World } = require('./physics.js');

const makeWorld = (options) =>
  new World(800, 600, Object.assign({ seed: 1234, ballCount: 6 }, options));

/** Two balls already touching, closing head on, far from any wall. */
function headOn(radiusA = 20, radiusB = 20) {
  const world = new World(2000, 2000, { seed: 7, ballCount: 1 });
  const gap = (radiusA + radiusB) * 0.98;
  world.balls = [
    new Ball(1000 - gap / 2, 1000, 200, 0, radiusA, '#fff'),
    new Ball(1000 + gap / 2, 1000, -200, 0, radiusB, '#fff'),
  ];
  return world;
}

test('mass follows the disc area', () => {
  const small = new Ball(0, 0, 0, 0, 10, '#fff');
  const big = new Ball(0, 0, 0, 0, 20, '#fff');
  assert.equal(Math.round(big.mass / small.mass), 4);
});

test('balls never leave the arena', () => {
  const world = makeWorld({ ballCount: 12 });
  for (let i = 0; i < 3000; i += 1) {
    world.step(1 / 60);
    assert.equal(world.anyBallEscaped(), false, `escaped on frame ${i}`);
  }
});

test('extreme speed does not tunnel through walls', () => {
  const world = makeWorld({ ballCount: 4, minSpeed: 1200, maxSpeed: 1500, substeps: 4 });
  for (let i = 0; i < 1500; i += 1) world.step(1 / 60);
  assert.equal(world.anyBallEscaped(), false);
});

test('a ball started outside is pulled back in', () => {
  const world = makeWorld({ ballCount: 1 });
  Object.assign(world.balls[0], { x: 99999, y: -99999 });
  world.step(1 / 60);
  assert.equal(world.anyBallEscaped(), false);
});

test('an elastic wall bounce reverses the normal component and keeps speed', () => {
  const world = makeWorld({ ballCount: 1 });
  const ball = world.balls[0];
  Object.assign(ball, { radius: 20, x: world.width - 15, y: 300, vx: 300, vy: 120 });
  world.step(1 / 60);
  assert.ok(ball.vx < 0, 'reflected back inwards');
  assert.ok(Math.abs(ball.vx + 300) < 1e-6);
  assert.ok(Math.abs(ball.vy - 120) < 1e-6, 'tangential component untouched');
});

test('restitution below one loses energy on a bounce', () => {
  const world = makeWorld({ ballCount: 1, restitution: 0.5 });
  const ball = world.balls[0];
  Object.assign(ball, { radius: 20, x: world.width - 15, y: 300, vx: 400, vy: 0 });
  world.step(1 / 60);
  assert.ok(Math.abs(ball.vx + 200) < 1e-6, `expected -200, got ${ball.vx}`);
});

test('a fully elastic run conserves energy over 2000 frames', () => {
  const world = makeWorld({ ballCount: 8, restitution: 1 });
  const before = world.totalKineticEnergy;
  for (let i = 0; i < 2000; i += 1) world.step(1 / 60);
  assert.ok(
    Math.abs(world.totalKineticEnergy / before - 1) < 1e-9,
    `energy drifted to ${world.totalKineticEnergy / before}`
  );
});

test('a damped run loses energy', () => {
  const world = makeWorld({ ballCount: 8, restitution: 0.7 });
  const before = world.totalKineticEnergy;
  for (let i = 0; i < 2000; i += 1) world.step(1 / 60);
  assert.ok(world.totalKineticEnergy < before);
});

test('equal masses swap velocity in a head-on hit', () => {
  const world = headOn();
  const [a, b] = world.balls;
  world.step(1 / 60);
  assert.ok(a.vx < 0 && b.vx > 0);
  assert.ok(Math.abs(Math.abs(a.vx) - 200) < 1e-4);
  assert.ok(Math.abs(Math.abs(b.vx) - 200) < 1e-4);
});

test('momentum is conserved between unequal masses', () => {
  const world = headOn(15, 35);
  const before = world.totalMomentum;
  for (let i = 0; i < 30; i += 1) world.step(1 / 60);
  const after = world.totalMomentum;
  assert.ok(Math.abs(after.x - before.x) < 1e-6);
  assert.ok(Math.abs(after.y - before.y) < 1e-6);
});

test('the heavier ball is deflected less', () => {
  const world = headOn(10, 40);
  const [light, heavy] = world.balls;
  world.step(1 / 60);
  assert.ok(Math.abs(light.vx) > Math.abs(heavy.vx));
});

test('balls never end a step overlapping', () => {
  const world = new World(600, 500, { seed: 5, ballCount: 14 });
  for (let frame = 0; frame < 1500; frame += 1) {
    world.step(1 / 60);
    for (let i = 0; i < world.balls.length; i += 1) {
      for (let j = i + 1; j < world.balls.length; j += 1) {
        const a = world.balls[i];
        const b = world.balls[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        assert.ok(gap >= a.radius + b.radius - 0.5, `overlap on frame ${frame}`);
      }
    }
  }
});

test('concentric balls are pushed apart', () => {
  const world = new World(2000, 2000, { seed: 2, ballCount: 1 });
  world.balls = [
    new Ball(1000, 1000, 0, 0, 20, '#fff'),
    new Ball(1000, 1000, 0, 0, 20, '#fff'),
  ];
  world.step(1 / 60);
  const gap = Math.hypot(
    world.balls[0].x - world.balls[1].x,
    world.balls[0].y - world.balls[1].y
  );
  assert.ok(gap > 0);
});

test('ball collisions can be switched off', () => {
  const world = headOn();
  world.settings.ballCollisions = false;
  const [a, b] = world.balls;
  for (let i = 0; i < 10; i += 1) world.step(1 / 60);
  assert.ok(a.vx > 0 && b.vx < 0, 'passed straight through');
});

test('gravity pulls down and balls come to rest', () => {
  const world = makeWorld({ ballCount: 3, restitution: 0.6 });
  world.setGravity(true);
  assert.equal(world.gravityEnabled, true);
  for (let i = 0; i < 4000; i += 1) world.step(1 / 60);
  for (const ball of world.balls) {
    assert.ok(
      Math.abs(ball.y - (world.height - ball.radius)) < 0.5,
      `ball ${ball.id} settled at ${ball.y}`
    );
  }
});

test('the seed makes runs reproducible', () => {
  const a = makeWorld({ seed: 99 });
  const b = makeWorld({ seed: 99 });
  for (let i = 0; i < 200; i += 1) {
    a.step(1 / 60);
    b.step(1 / 60);
  }
  a.balls.forEach((ball, index) => {
    assert.equal(ball.x, b.balls[index].x);
    assert.equal(ball.y, b.balls[index].y);
  });
});

test('ball count can be raised and lowered, never below one', () => {
  const world = makeWorld({ ballCount: 3 });
  world.setBallCount(9);
  assert.equal(world.balls.length, 9);
  world.setBallCount(1);
  assert.equal(world.balls.length, 1);
  assert.equal(world.removeBall(), null);
  assert.equal(world.balls.length, 1);
});

test('resizing keeps every ball inside the new arena', () => {
  const world = makeWorld({ ballCount: 10 });
  for (let i = 0; i < 100; i += 1) world.step(1 / 60);
  world.resize(300, 220);
  assert.equal(world.anyBallEscaped(), false);
  for (let i = 0; i < 600; i += 1) world.step(1 / 60);
  assert.equal(world.anyBallEscaped(), false);
});

test('a push accelerates balls away from the point', () => {
  const world = new World(1000, 1000, { seed: 4, ballCount: 1 });
  const ball = world.balls[0];
  Object.assign(ball, { x: 600, y: 500, vx: 0, vy: 0 });
  world.push(500, 500);
  assert.ok(ball.vx > 0, 'pushed to the right, away from the click');
});

test('speed scaling respects the cap', () => {
  const world = makeWorld({ ballCount: 2 });
  for (let i = 0; i < 50; i += 1) world.scaleSpeed(2);
  world.step(1 / 60);
  for (const ball of world.balls) {
    assert.ok(ball.speed <= world.settings.maxSpeedCap + 1e-6);
  }
});

test('reset restores the configured count and clears counters', () => {
  const world = makeWorld({ ballCount: 4 });
  world.spawnBall();
  for (let i = 0; i < 100; i += 1) world.step(1 / 60);
  world.reset();
  assert.equal(world.balls.length, 4);
  assert.equal(world.bounceCount, 0);
  assert.equal(world.elapsed, 0);
});
