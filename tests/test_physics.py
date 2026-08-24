"""Headless tests for the simulation. No window is ever opened.

Run them with::

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import math
import unittest

from bouncing_ball.ball import Ball
from bouncing_ball.bounds import Bounds
from bouncing_ball.config import Config
from bouncing_ball.vector import Vec2
from bouncing_ball.world import World


def make_world(**overrides) -> World:
    settings = dict(seed=1234, ball_count=6, width=800, height=600)
    settings.update(overrides)
    return World.random(Config(**settings))


class Vec2Tests(unittest.TestCase):
    def test_length_and_normalise(self):
        self.assertAlmostEqual(Vec2(3, 4).length(), 5.0)
        self.assertAlmostEqual(Vec2(3, 4).normalized().length(), 1.0)

    def test_normalising_zero_is_safe(self):
        self.assertEqual(Vec2(0, 0).normalized(), Vec2(0, 0))

    def test_reflection_flips_only_the_normal_component(self):
        reflected = Vec2(3, -4).reflect(Vec2(0, 1))
        self.assertAlmostEqual(reflected.x, 3.0)
        self.assertAlmostEqual(reflected.y, 4.0)

    def test_reflection_preserves_speed(self):
        normal = Vec2(1, 2).normalized()
        velocity = Vec2(-7, 3)
        self.assertAlmostEqual(velocity.reflect(normal).length(), velocity.length())

    def test_clamped_shortens_only_long_vectors(self):
        self.assertAlmostEqual(Vec2(30, 40).clamped(5).length(), 5.0)
        self.assertEqual(Vec2(1, 1).clamped(100), Vec2(1, 1))

    def test_from_angle_round_trips(self):
        # angle() reports in (-pi, pi], so compare modulo a full turn.
        for degrees in (0, 45, 137, 250, 359):
            radians = math.radians(degrees)
            recovered = Vec2.from_angle(radians, 3).angle()
            self.assertAlmostEqual((recovered - radians) % (2 * math.pi), 0.0, 6)
            self.assertAlmostEqual(Vec2.from_angle(radians, 3).length(), 3.0)


class BoundsTests(unittest.TestCase):
    def test_centered_dimensions(self):
        bounds = Bounds.centered(800, 600)
        self.assertEqual((bounds.left, bounds.right), (-400, 400))
        self.assertEqual((bounds.width, bounds.height), (800, 600))
        self.assertEqual(bounds.center, Vec2(0, 0))

    def test_contains_respects_margin(self):
        bounds = Bounds.centered(100, 100)
        self.assertTrue(bounds.contains(Vec2(40, 40)))
        self.assertFalse(bounds.contains(Vec2(40, 40), margin=20))


class BallTests(unittest.TestCase):
    def test_mass_follows_area(self):
        small, big = Ball(Vec2(0, 0), Vec2(0, 0), 10), Ball(Vec2(0, 0), Vec2(0, 0), 20)
        self.assertAlmostEqual(big.mass / small.mass, 4.0)

    def test_ids_are_unique(self):
        a, b = Ball(Vec2(0, 0), Vec2(0, 0)), Ball(Vec2(0, 0), Vec2(0, 0))
        self.assertNotEqual(a.id, b.id)


class ContainmentTests(unittest.TestCase):
    """The bug the original version could not shake: balls escaping."""

    def test_balls_never_leave_the_arena(self):
        world = make_world(ball_count=12)
        for _ in range(3000):
            world.step(1 / 60)
            self.assertFalse(world.any_ball_escaped())

    def test_extreme_speed_does_not_tunnel(self):
        world = make_world(ball_count=4, min_speed=1200, max_speed=1400, substeps=4)
        for _ in range(1500):
            world.step(1 / 60)
        self.assertFalse(world.any_ball_escaped())

    def test_a_ball_started_outside_is_pulled_back_in(self):
        world = make_world(ball_count=1)
        ball = world.balls[0]
        ball.position = Vec2(10_000, -10_000)
        world.step(1 / 60)
        self.assertFalse(world.any_ball_escaped())


class WallBounceTests(unittest.TestCase):
    def _single_ball_world(self, **overrides) -> World:
        world = make_world(ball_count=1, **overrides)
        world.balls[0].radius = 20.0
        return world

    def test_elastic_wall_bounce_reverses_and_keeps_speed(self):
        world = self._single_ball_world()
        ball = world.balls[0]
        # Start slightly past the right wall so the bounce is unambiguous.
        ball.position = Vec2(world.bounds.right - ball.radius + 5, 0)
        ball.velocity = Vec2(300, 120)
        world.step(1 / 60)
        self.assertLess(ball.velocity.x, 0)  # reflected back inwards
        self.assertAlmostEqual(ball.velocity.x, -300.0, 6)
        self.assertAlmostEqual(ball.velocity.y, 120.0, 6)  # tangent untouched
        self.assertAlmostEqual(ball.velocity.length(), math.hypot(300, 120), 6)

    def test_restitution_below_one_loses_energy(self):
        world = self._single_ball_world(restitution=0.5)
        ball = world.balls[0]
        ball.position = Vec2(world.bounds.right - ball.radius + 5, 0)
        ball.velocity = Vec2(400, 0)
        world.step(1 / 60)
        self.assertAlmostEqual(ball.velocity.x, -200.0, 6)

    def test_energy_is_conserved_over_a_long_elastic_run(self):
        world = make_world(ball_count=8, restitution=1.0)
        before = world.total_kinetic_energy
        for _ in range(2000):
            world.step(1 / 60)
        self.assertAlmostEqual(world.total_kinetic_energy / before, 1.0, places=6)

    def test_damped_run_loses_energy(self):
        world = make_world(ball_count=8, restitution=0.7)
        before = world.total_kinetic_energy
        for _ in range(2000):
            world.step(1 / 60)
        self.assertLess(world.total_kinetic_energy, before)


class BallCollisionTests(unittest.TestCase):
    def _head_on(self, radius_a=20.0, radius_b=20.0) -> World:
        """Two balls already touching, closing on each other head on.

        They start just inside contact range so the impact happens on the very
        first step; the arena is far larger than the balls so no wall is ever
        involved.
        """
        world = make_world(ball_count=1, width=2000, height=2000)
        gap = (radius_a + radius_b) * 0.98
        world.balls = [
            Ball(Vec2(-gap / 2, 0), Vec2(200, 0), radius_a, "#ffffff"),
            Ball(Vec2(gap / 2, 0), Vec2(-200, 0), radius_b, "#ffffff"),
        ]
        return world

    def test_equal_masses_swap_velocity(self):
        world = self._head_on()
        a, b = world.balls
        world.step(1 / 60)
        self.assertLess(a.velocity.x, 0)
        self.assertGreater(b.velocity.x, 0)
        self.assertAlmostEqual(abs(a.velocity.x), 200.0, 4)
        self.assertAlmostEqual(abs(b.velocity.x), 200.0, 4)

    def test_momentum_is_conserved(self):
        world = self._head_on(radius_a=15.0, radius_b=35.0)
        before = world.total_momentum
        for _ in range(30):
            world.step(1 / 60)
        after = world.total_momentum
        self.assertAlmostEqual(after.x, before.x, 4)
        self.assertAlmostEqual(after.y, before.y, 4)

    def test_heavier_ball_is_deflected_less(self):
        world = self._head_on(radius_a=10.0, radius_b=40.0)
        light, heavy = world.balls
        world.step(1 / 60)
        self.assertGreater(abs(light.velocity.x), abs(heavy.velocity.x))

    def test_balls_do_not_end_a_step_overlapping(self):
        world = make_world(ball_count=14, width=600, height=500)
        for _ in range(1500):
            world.step(1 / 60)
        for i, a in enumerate(world.balls):
            for b in world.balls[i + 1 :]:
                gap = (a.position - b.position).length()
                self.assertGreaterEqual(gap, (a.radius + b.radius) - 0.5)

    def test_concentric_balls_are_pushed_apart(self):
        world = make_world(ball_count=1, width=2000, height=2000)
        world.balls = [
            Ball(Vec2(0, 0), Vec2(0, 0), 20, "#ffffff"),
            Ball(Vec2(0, 0), Vec2(0, 0), 20, "#ffffff"),
        ]
        world.step(1 / 60)
        gap = (world.balls[0].position - world.balls[1].position).length()
        self.assertGreater(gap, 0.0)

    def test_collisions_can_be_switched_off(self):
        world = self._head_on()
        world.config.ball_collisions = False
        a, b = world.balls
        for _ in range(10):
            world.step(1 / 60)
        self.assertGreater(a.velocity.x, 0)  # passed straight through
        self.assertLess(b.velocity.x, 0)


class GravityTests(unittest.TestCase):
    def test_gravity_pulls_down(self):
        world = make_world(ball_count=1)
        world.set_gravity(True)
        ball = world.balls[0]
        ball.position = Vec2(0, 0)
        ball.velocity = Vec2(0, 0)
        world.step(0.1)
        self.assertLess(ball.velocity.y, 0)
        self.assertLess(ball.position.y, 0)

    def test_balls_come_to_rest_on_the_floor(self):
        world = make_world(ball_count=3, restitution=0.6)
        world.set_gravity(True)
        for _ in range(4000):
            world.step(1 / 60)
        for ball in world.balls:
            self.assertAlmostEqual(ball.position.y, world.bounds.bottom + ball.radius, 1)

    def test_toggling_gravity_round_trips(self):
        world = make_world()
        self.assertFalse(world.gravity_enabled)
        world.set_gravity(True)
        self.assertTrue(world.gravity_enabled)
        world.set_gravity(False)
        self.assertFalse(world.gravity_enabled)


class WorldManagementTests(unittest.TestCase):
    def test_seed_makes_runs_reproducible(self):
        a, b = make_world(seed=99), make_world(seed=99)
        for _ in range(200):
            a.step(1 / 60)
            b.step(1 / 60)
        for ball_a, ball_b in zip(a.balls, b.balls):
            self.assertEqual(ball_a.position, ball_b.position)

    def test_spawned_balls_start_inside_and_apart(self):
        world = make_world(ball_count=10)
        self.assertFalse(world.any_ball_escaped())

    def test_add_and_remove_balls(self):
        world = make_world(ball_count=3)
        world.spawn_ball()
        self.assertEqual(len(world.balls), 4)
        world.remove_ball()
        self.assertEqual(len(world.balls), 3)

    def test_the_last_ball_cannot_be_removed(self):
        world = make_world(ball_count=1)
        self.assertIsNone(world.remove_ball())
        self.assertEqual(len(world.balls), 1)

    def test_reset_restores_the_configured_count(self):
        world = make_world(ball_count=4)
        world.spawn_ball()
        world.step(1 / 60)
        world.reset()
        self.assertEqual(len(world.balls), 4)
        self.assertEqual(world.bounce_count, 0)
        self.assertEqual(world.elapsed, 0.0)

    def test_speed_scaling_respects_the_cap(self):
        world = make_world(ball_count=2)
        for _ in range(50):
            world.scale_speed(2.0)
        for ball in world.balls:
            self.assertLessEqual(ball.speed, world.config.max_speed_cap + 1e-6)

    def test_collisions_are_reported(self):
        world = make_world(ball_count=1)
        ball = world.balls[0]
        ball.position = Vec2(world.bounds.right - ball.radius - 1, 0)
        ball.velocity = Vec2(600, 0)
        collisions = world.step(1 / 60)
        self.assertTrue(collisions)
        self.assertTrue(collisions[0].is_wall)


class ConfigTests(unittest.TestCase):
    def test_frame_time_matches_fps(self):
        self.assertAlmostEqual(Config(fps=50).frame_time, 0.02)

    def test_invalid_settings_are_rejected(self):
        for bad in (
            dict(width=10),
            dict(ball_count=0),
            dict(min_radius=40, max_radius=10),
            dict(max_radius=500),
            dict(restitution=2.0),
            dict(fps=0),
            dict(substeps=0),
        ):
            with self.subTest(**bad):
                with self.assertRaises(ValueError):
                    Config(**bad).validate()


if __name__ == "__main__":
    unittest.main()
