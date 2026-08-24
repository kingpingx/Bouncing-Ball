"""Tunable simulation settings, all in one place."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

# Pleasant, high-contrast palette for a dark background.
PALETTE: Sequence[str] = (
    "#ff5c8a",  # rose
    "#ffd166",  # amber
    "#06d6a0",  # mint
    "#4cc9f0",  # sky
    "#b892ff",  # lilac
    "#ff8b3d",  # tangerine
)

BACKGROUND = "#0d1117"
HUD_COLOR = "#8b949e"
TRAIL_ALPHA_STEPS = 24  # how many segments a trail keeps before it is trimmed


@dataclass
class Config:
    """Everything you may want to change without reading the physics code."""

    # -- window ----------------------------------------------------------
    width: int = 900
    height: int = 640
    title: str = "Bouncing Ball - vector reflection demo"

    # -- population ------------------------------------------------------
    ball_count: int = 5
    min_radius: float = 12.0
    max_radius: float = 34.0
    min_speed: float = 160.0
    max_speed: float = 340.0

    # -- physics ---------------------------------------------------------
    gravity: float = 0.0            # px/s^2, positive pulls balls down
    gravity_strength: float = 900.0  # value applied when gravity is toggled on
    restitution: float = 1.0         # 1.0 = perfectly elastic bounce
    air_drag: float = 0.0            # per-second velocity damping (0 = none)
    max_speed_cap: float = 1400.0    # keeps fast balls from tunnelling walls
    ball_collisions: bool = True

    # -- integration -----------------------------------------------------
    fps: int = 60
    substeps: int = 2  # physics iterations per rendered frame

    # -- presentation ----------------------------------------------------
    trails: bool = True
    show_hud: bool = True
    seed: int | None = None
    palette: Sequence[str] = field(default=PALETTE)

    @property
    def frame_time(self) -> float:
        """Seconds of simulated time per rendered frame."""
        return 1.0 / float(self.fps)

    def validate(self) -> None:
        """Raise ``ValueError`` on settings the simulation cannot honour."""
        if self.width < 200 or self.height < 200:
            raise ValueError("window must be at least 200x200 pixels")
        if self.ball_count < 1:
            raise ValueError("ball_count must be at least 1")
        if not 0.0 < self.min_radius <= self.max_radius:
            raise ValueError("radii must satisfy 0 < min_radius <= max_radius")
        if self.max_radius * 2 >= min(self.width, self.height):
            raise ValueError("max_radius is too large for the window")
        if not 0.0 <= self.restitution <= 1.0:
            raise ValueError("restitution must be between 0 and 1")
        if self.fps < 1:
            raise ValueError("fps must be positive")
        if self.substeps < 1:
            raise ValueError("substeps must be at least 1")
