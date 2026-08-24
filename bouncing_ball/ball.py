"""The moving body the simulation is named after."""

from __future__ import annotations

import itertools
import math
import random
from dataclasses import dataclass, field
from typing import Deque, Sequence
from collections import deque

from .bounds import Bounds
from .vector import Vec2

_ids = itertools.count(1)


@dataclass
class Ball:
    """A circular body with position, velocity and a mass derived from area.

    Mass follows the disc area so a big ball shoves a small one aside instead
    of both behaving like identical billiard balls.
    """

    position: Vec2
    velocity: Vec2
    radius: float = 20.0
    color: str = "#ff5c8a"
    id: int = field(default_factory=lambda: next(_ids))
    trail: Deque[Vec2] = field(default_factory=lambda: deque(maxlen=24))

    @property
    def mass(self) -> float:
        return math.pi * self.radius * self.radius

    @property
    def inverse_mass(self) -> float:
        return 1.0 / self.mass

    @property
    def speed(self) -> float:
        return self.velocity.length()

    @property
    def kinetic_energy(self) -> float:
        return 0.5 * self.mass * self.velocity.length_squared()

    def remember_position(self) -> None:
        self.trail.append(self.position)

    def clear_trail(self) -> None:
        self.trail.clear()

    @classmethod
    def random(
        cls,
        bounds: Bounds,
        palette: Sequence[str],
        min_radius: float,
        max_radius: float,
        min_speed: float,
        max_speed: float,
        rng: random.Random | None = None,
    ) -> "Ball":
        """Create a ball at a random spot inside ``bounds``, moving randomly."""
        rng = rng or random
        radius = rng.uniform(min_radius, max_radius)
        position = Vec2(
            rng.uniform(bounds.left + radius, bounds.right - radius),
            rng.uniform(bounds.bottom + radius, bounds.top - radius),
        )
        velocity = Vec2.from_angle(
            rng.uniform(0.0, 2.0 * math.pi), rng.uniform(min_speed, max_speed)
        )
        return cls(
            position=position,
            velocity=velocity,
            radius=radius,
            color=rng.choice(list(palette)),
        )
