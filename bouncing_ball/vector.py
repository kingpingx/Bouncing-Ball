"""A tiny 2D vector type used by the whole simulation."""

from __future__ import annotations

import math
from typing import NamedTuple


class Vec2(NamedTuple):
    """An immutable 2D vector.

    Being a ``NamedTuple`` means a vector is hashable, cheap to build and
    unpacks like a plain ``(x, y)`` tuple, which keeps the turtle glue code
    simple while the physics stays readable.
    """

    x: float = 0.0
    y: float = 0.0

    # -- construction ----------------------------------------------------
    @classmethod
    def from_angle(cls, radians: float, length: float = 1.0) -> "Vec2":
        return cls(math.cos(radians) * length, math.sin(radians) * length)

    # -- arithmetic ------------------------------------------------------
    def __add__(self, other: "Vec2") -> "Vec2":  # type: ignore[override]
        return Vec2(self.x + other[0], self.y + other[1])

    def __sub__(self, other: "Vec2") -> "Vec2":
        return Vec2(self.x - other[0], self.y - other[1])

    def __mul__(self, scalar: float) -> "Vec2":  # type: ignore[override]
        return Vec2(self.x * scalar, self.y * scalar)

    __rmul__ = __mul__

    def __truediv__(self, scalar: float) -> "Vec2":
        return Vec2(self.x / scalar, self.y / scalar)

    def __neg__(self) -> "Vec2":
        return Vec2(-self.x, -self.y)

    # -- geometry --------------------------------------------------------
    def dot(self, other: "Vec2") -> float:
        return self.x * other[0] + self.y * other[1]

    def length(self) -> float:
        return math.hypot(self.x, self.y)

    def length_squared(self) -> float:
        return self.x * self.x + self.y * self.y

    def normalized(self) -> "Vec2":
        length = self.length()
        if length == 0.0:
            return Vec2(0.0, 0.0)
        return Vec2(self.x / length, self.y / length)

    def clamped(self, max_length: float) -> "Vec2":
        """Return this vector shortened to ``max_length`` if it is longer."""
        length = self.length()
        if length > max_length > 0.0:
            return self * (max_length / length)
        return self

    def angle(self) -> float:
        """Direction in radians, measured counter-clockwise from +x."""
        return math.atan2(self.y, self.x)

    def reflect(self, normal: "Vec2") -> "Vec2":
        """Mirror the vector about a surface with the given unit ``normal``."""
        return self - normal * (2.0 * self.dot(normal))

ZERO = Vec2(0.0, 0.0)
