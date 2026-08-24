"""The rectangular arena the balls live in."""

from __future__ import annotations

from dataclasses import dataclass

from .vector import Vec2


@dataclass(frozen=True)
class Bounds:
    """An axis-aligned rectangle centred on the origin by default.

    Turtle's coordinate system puts (0, 0) in the middle of the window and
    lets +y point up, so the arena is expressed the same way.
    """

    left: float
    bottom: float
    right: float
    top: float

    @classmethod
    def centered(cls, width: float, height: float) -> "Bounds":
        return cls(-width / 2.0, -height / 2.0, width / 2.0, height / 2.0)

    @property
    def width(self) -> float:
        return self.right - self.left

    @property
    def height(self) -> float:
        return self.top - self.bottom

    @property
    def center(self) -> Vec2:
        return Vec2((self.left + self.right) / 2.0, (self.bottom + self.top) / 2.0)

    def contains(self, point: Vec2, margin: float = 0.0) -> bool:
        return (
            self.left + margin <= point.x <= self.right - margin
            and self.bottom + margin <= point.y <= self.top - margin
        )
