"""Bouncing Ball - a small, readable 2D collision simulation.

The package splits cleanly in two:

* the physics (:mod:`vector`, :mod:`bounds`, :mod:`ball`, :mod:`world`) which
  is pure Python with no GUI dependency, and
* the renderer (:mod:`turtle_app`) which only reads the physics state.

That split is what makes the same model runnable under turtle, under the
browser port in ``web/``, or under a test runner with no display at all.
"""

from .ball import Ball
from .bounds import Bounds
from .config import Config
from .vector import Vec2
from .world import Collision, World

__version__ = "2.0.0"
__all__ = ["Ball", "Bounds", "Config", "Vec2", "Collision", "World", "__version__"]
