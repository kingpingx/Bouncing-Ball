"""The simulation itself: integration, wall bounces and ball-to-ball impacts.

This module is deliberately free of any turtle / tkinter import so the physics
can be unit-tested headlessly and reused by another renderer.

The maths in one paragraph
--------------------------
A bounce is a *reflection* of the velocity vector about the surface normal::

    v_out = v - 2 * (v . n) * n

For an axis-aligned wall the normal is one of (+/-1, 0) or (0, +/-1), so the
formula collapses to "flip one component". Ball-to-ball impacts use the same
idea along the line joining the two centres, scaled by an impulse that keeps
momentum conserved for unequal masses.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import List

from .ball import Ball
from .bounds import Bounds
from .config import Config
from .vector import Vec2

# Balls slower than this are treated as resting so gravity does not make them
# jitter forever on the floor.
_REST_SPEED = 8.0
# Push overlapping bodies apart by slightly more than the overlap; without the
# slack, floating point error lets them re-collide on the very next frame.
_SEPARATION_SLACK = 1.01


@dataclass
class Collision:
    """A bounce that happened during a step, for renderers or sound effects."""

    ball: Ball
    normal: Vec2
    speed: float
    other: Ball | None = None

    @property
    def is_wall(self) -> bool:
        return self.other is None


@dataclass
class World:
    """Holds the balls and advances them through time."""

    bounds: Bounds
    config: Config
    balls: List[Ball] = field(default_factory=list)
    rng: random.Random = field(default_factory=random.Random)
    elapsed: float = 0.0
    bounce_count: int = 0

    # -- construction ----------------------------------------------------
    @classmethod
    def random(cls, config: Config) -> "World":
        """Build a world full of randomly placed, non-overlapping balls."""
        config.validate()
        rng = random.Random(config.seed)
        world = cls(
            bounds=Bounds.centered(config.width, config.height),
            config=config,
            rng=rng,
        )
        for _ in range(config.ball_count):
            world.spawn_ball()
        return world

    def spawn_ball(self, attempts: int = 60) -> Ball:
        """Add one ball, trying not to drop it on top of an existing one."""
        config = self.config
        fallback: Ball | None = None
        for _ in range(attempts):
            candidate = Ball.random(
                self.bounds,
                config.palette,
                config.min_radius,
                config.max_radius,
                config.min_speed,
                config.max_speed,
                self.rng,
            )
            if not self._overlaps_any(candidate):
                self.balls.append(candidate)
                return candidate
            fallback = fallback or candidate
        assert fallback is not None
        self.balls.append(fallback)
        return fallback

    def remove_ball(self) -> Ball | None:
        """Remove the most recently added ball, if more than one is left."""
        if len(self.balls) <= 1:
            return None
        return self.balls.pop()

    def _overlaps_any(self, candidate: Ball) -> bool:
        for other in self.balls:
            gap = (candidate.position - other.position).length()
            if gap < candidate.radius + other.radius:
                return True
        return False

    # -- integration -----------------------------------------------------
    def step(self, dt: float) -> List[Collision]:
        """Advance the simulation by ``dt`` seconds, in configured substeps."""
        collisions: List[Collision] = []
        sub_dt = dt / self.config.substeps
        for _ in range(self.config.substeps):
            collisions.extend(self._substep(sub_dt))
        self.elapsed += dt
        for ball in self.balls:
            ball.remember_position()
        return collisions

    def _substep(self, dt: float) -> List[Collision]:
        self._integrate(dt)
        collisions = self._resolve_walls()
        if self.config.ball_collisions:
            collisions.extend(self._resolve_ball_pairs())
        self.bounce_count += len(collisions)
        return collisions

    def _integrate(self, dt: float) -> None:
        config = self.config
        gravity = Vec2(0.0, -config.gravity)
        damping = max(0.0, 1.0 - config.air_drag * dt)
        for ball in self.balls:
            velocity = (ball.velocity + gravity * dt) * damping
            ball.velocity = velocity.clamped(config.max_speed_cap)
            ball.position = ball.position + ball.velocity * dt

    # -- wall response ---------------------------------------------------
    def _resolve_walls(self) -> List[Collision]:
        """Keep every ball inside the arena, reflecting whatever escapes.

        Position is corrected *before* the velocity is flipped. Clamping first
        is what makes the bounce robust: a ball can never end a frame outside
        the arena, so it can never get stuck oscillating against a wall the way
        a pure "flip the sign" check does.
        """
        collisions: List[Collision] = []
        bounds = self.bounds
        restitution = self.config.restitution
        for ball in self.balls:
            x, y = ball.position
            vx, vy = ball.velocity
            normal_x = normal_y = 0.0

            if x - ball.radius < bounds.left:
                x = bounds.left + ball.radius
                if vx < 0.0:
                    vx = -vx * restitution
                normal_x = 1.0
            elif x + ball.radius > bounds.right:
                x = bounds.right - ball.radius
                if vx > 0.0:
                    vx = -vx * restitution
                normal_x = -1.0

            if y - ball.radius < bounds.bottom:
                y = bounds.bottom + ball.radius
                if vy < 0.0:
                    vy = -vy * restitution
                normal_y = 1.0
            elif y + ball.radius > bounds.top:
                y = bounds.top - ball.radius
                if vy > 0.0:
                    vy = -vy * restitution
                normal_y = -1.0

            if normal_x or normal_y:
                impact = abs(vx) if normal_x else abs(vy)
                ball.position = Vec2(x, y)
                ball.velocity = self._settle(Vec2(vx, vy), normal_y)
                collisions.append(
                    Collision(ball, Vec2(normal_x, normal_y).normalized(), impact)
                )
        return collisions

    def _settle(self, velocity: Vec2, floor_normal: float) -> Vec2:
        """Stop a ball dribbling forever on the floor under gravity."""
        if (
            self.config.gravity > 0.0
            and floor_normal > 0.0
            and abs(velocity.y) < _REST_SPEED
        ):
            return Vec2(velocity.x, 0.0)
        return velocity

    # -- ball-to-ball response -------------------------------------------
    def _resolve_ball_pairs(self) -> List[Collision]:
        collisions: List[Collision] = []
        balls = self.balls
        for i in range(len(balls)):
            for j in range(i + 1, len(balls)):
                collision = self._resolve_pair(balls[i], balls[j])
                if collision is not None:
                    collisions.append(collision)
        return collisions

    def _resolve_pair(self, a: Ball, b: Ball) -> Collision | None:
        delta = b.position - a.position
        distance = delta.length()
        contact_distance = a.radius + b.radius
        if distance >= contact_distance:
            return None

        if distance == 0.0:
            # Perfectly concentric: nudge them apart along a random axis.
            normal = Vec2.from_angle(self.rng.uniform(0.0, 2.0 * math.pi))
            distance = 1e-6
        else:
            normal = delta / distance

        # 1. Separate the overlap, split by inverse mass so the lighter ball
        #    moves further.
        overlap = (contact_distance - distance) * _SEPARATION_SLACK
        inv_a, inv_b = a.inverse_mass, b.inverse_mass
        inv_total = inv_a + inv_b
        a.position = a.position - normal * (overlap * inv_a / inv_total)
        b.position = b.position + normal * (overlap * inv_b / inv_total)

        # 2. Apply the impulse only if the two are actually closing in. Without
        #    this guard, balls that are already separating get pulled back
        #    together and stick.
        relative_velocity = b.velocity - a.velocity
        approach = relative_velocity.dot(normal)
        if approach >= 0.0:
            return None

        impulse = -(1.0 + self.config.restitution) * approach / inv_total
        a.velocity = a.velocity - normal * (impulse * inv_a)
        b.velocity = b.velocity + normal * (impulse * inv_b)
        return Collision(a, normal, abs(approach), other=b)

    # -- inspection ------------------------------------------------------
    @property
    def total_kinetic_energy(self) -> float:
        return sum(ball.kinetic_energy for ball in self.balls)

    @property
    def total_momentum(self) -> Vec2:
        total = Vec2(0.0, 0.0)
        for ball in self.balls:
            total = total + ball.velocity * ball.mass
        return total

    def any_ball_escaped(self) -> bool:
        """True if a ball has left the arena - this should never happen."""
        return any(
            not self.bounds.contains(ball.position, margin=ball.radius - 0.5)
            for ball in self.balls
        )

    # -- controls --------------------------------------------------------
    def reset(self) -> None:
        self.balls.clear()
        self.elapsed = 0.0
        self.bounce_count = 0
        for _ in range(self.config.ball_count):
            self.spawn_ball()

    def set_gravity(self, enabled: bool) -> None:
        self.config.gravity = self.config.gravity_strength if enabled else 0.0

    @property
    def gravity_enabled(self) -> bool:
        return self.config.gravity > 0.0

    def scale_speed(self, factor: float) -> None:
        for ball in self.balls:
            ball.velocity = (ball.velocity * factor).clamped(self.config.max_speed_cap)
