"""Turtle-graphics front end for the simulation.

The renderer knows nothing about physics and the physics knows nothing about
turtle - :class:`~bouncing_ball.world.World` is the only thing they share.

Rendering notes
---------------
* ``tracer(0)`` switches off turtle auto-refresh; we call ``update()`` once per
  frame instead. Without this, turtle redraws after every single motion command
  and the animation crawls.
* Trails are drawn with ``stamp()`` / ``clearstamp()`` rather than pen lines,
  which keeps the cost at one stamp per ball per frame no matter how long the
  trail is.
* The loop is driven by ``screen.ontimer`` so keyboard events still get
  serviced - a bare ``while True`` starves tkinter and freezes the window.
"""

from __future__ import annotations

import time
import turtle
from typing import Dict, Tuple

from .ball import Ball
from .config import BACKGROUND, HUD_COLOR, Config
from .world import World

# A turtle "circle" shape is 20 px across at stretch 1.0.
_TURTLE_SHAPE_RADIUS = 10.0
# Trail tuning.
_TRAIL_STAMP_EVERY = 2      # frames between ghost stamps
_TRAIL_LENGTH = 12          # ghost stamps kept per ball
_TRAIL_SCALE = 0.55         # ghost size relative to the ball
_TRAIL_MIX = 0.72           # how far the ghost colour fades into the background
# Never simulate more than this much time in one frame, so a stall (dragging
# the window, a laptop waking up) does not teleport balls through walls.
_MAX_FRAME_DELTA = 0.05

HELP_LINES = (
    "space pause    g gravity    t trails    c ball collisions",
    "+ / - balls    up / down speed    r reset    h hud    q quit",
)


def _hex_to_rgb(color: str) -> Tuple[int, int, int]:
    color = color.lstrip("#")
    return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)


def _mix(color: str, other: str, amount: float) -> str:
    """Blend ``color`` towards ``other`` by ``amount`` (0..1)."""
    r1, g1, b1 = _hex_to_rgb(color)
    r2, g2, b2 = _hex_to_rgb(other)
    blend = lambda a, b: int(round(a + (b - a) * amount))  # noqa: E731
    return "#{:02x}{:02x}{:02x}".format(
        blend(r1, r2), blend(g1, g2), blend(b1, b2)
    )


class BallRenderer:
    """The two turtles that draw one ball: the body and its ghost trail."""

    def __init__(self, ball: Ball) -> None:
        self.ball = ball
        stretch = ball.radius / _TURTLE_SHAPE_RADIUS

        self.body = turtle.Turtle(shape="circle", visible=False)
        self.body.penup()
        self.body.speed(0)
        self.body.color(_mix(ball.color, "#ffffff", 0.25), ball.color)
        self.body.shapesize(stretch, stretch, 1)

        self.ghost = turtle.Turtle(shape="circle", visible=False)
        self.ghost.penup()
        self.ghost.speed(0)
        faded = _mix(ball.color, BACKGROUND, _TRAIL_MIX)
        self.ghost.color(faded, faded)
        self.ghost.shapesize(stretch * _TRAIL_SCALE, stretch * _TRAIL_SCALE, 0)

        self.stamps: list[int] = []
        self._frame = 0

    def draw(self, trails_enabled: bool) -> None:
        position = self.ball.position
        if trails_enabled:
            self._frame += 1
            if self._frame % _TRAIL_STAMP_EVERY == 0:
                self.ghost.goto(position.x, position.y)
                self.stamps.append(self.ghost.stamp())
                while len(self.stamps) > _TRAIL_LENGTH:
                    self.ghost.clearstamp(self.stamps.pop(0))
        elif self.stamps:
            self.clear_trail()

        self.body.goto(position.x, position.y)
        if not self.body.isvisible():
            self.body.showturtle()

    def clear_trail(self) -> None:
        for stamp in self.stamps:
            self.ghost.clearstamp(stamp)
        self.stamps.clear()

    def dispose(self) -> None:
        self.clear_trail()
        self.body.hideturtle()
        self.ghost.hideturtle()


class BouncingBallApp:
    """Owns the window, the render turtles and the frame loop."""

    def __init__(self, config: Config) -> None:
        config.validate()
        self.config = config
        self.world = World.random(config)
        self.paused = False
        self.show_hud = config.show_hud
        self.trails = config.trails
        self.renderers: Dict[int, BallRenderer] = {}
        self._last_time = time.perf_counter()
        self._hud_timer = 0.0
        self._fps = float(config.fps)
        self._running = True

        self.screen = self._make_screen()
        self.hud = self._make_hud_turtle()
        self._bind_keys()

    # -- setup -----------------------------------------------------------
    def _make_screen(self) -> "turtle.TurtleScreen":
        screen = turtle.Screen()
        screen.setup(self.config.width, self.config.height)
        screen.title(self.config.title)
        screen.bgcolor(BACKGROUND)
        screen.tracer(0, 0)
        # Keep the world matching the drawable area exactly, so a bounce lands
        # on the visible edge rather than somewhere off-screen.
        screen.setworldcoordinates(
            -self.config.width / 2,
            -self.config.height / 2,
            self.config.width / 2,
            self.config.height / 2,
        )
        return screen

    def _make_hud_turtle(self) -> turtle.Turtle:
        hud = turtle.Turtle(visible=False)
        hud.penup()
        hud.speed(0)
        hud.color(HUD_COLOR)
        return hud

    def _bind_keys(self) -> None:
        screen = self.screen
        bindings = {
            "space": self.toggle_pause,
            "g": self.toggle_gravity,
            "t": self.toggle_trails,
            "c": self.toggle_ball_collisions,
            "r": self.reset,
            "h": self.toggle_hud,
            "q": self.quit,
            "Escape": self.quit,
            "Up": lambda: self.world.scale_speed(1.25),
            "Down": lambda: self.world.scale_speed(0.8),
        }
        for key, handler in bindings.items():
            screen.onkey(handler, key)
        # Several keyboards report "+" and "-" differently; bind them all.
        for key in ("plus", "equal", "KP_Add"):
            screen.onkey(self.add_ball, key)
        for key in ("minus", "underscore", "KP_Subtract"):
            screen.onkey(self.remove_ball, key)
        screen.onclick(self.nudge)
        screen.listen()

    # -- commands --------------------------------------------------------
    def toggle_pause(self) -> None:
        self.paused = not self.paused

    def toggle_gravity(self) -> None:
        self.world.set_gravity(not self.world.gravity_enabled)

    def toggle_trails(self) -> None:
        self.trails = not self.trails
        if not self.trails:
            for renderer in self.renderers.values():
                renderer.clear_trail()

    def toggle_ball_collisions(self) -> None:
        self.config.ball_collisions = not self.config.ball_collisions

    def toggle_hud(self) -> None:
        self.show_hud = not self.show_hud
        if not self.show_hud:
            self.hud.clear()

    def add_ball(self) -> None:
        self.world.spawn_ball()

    def remove_ball(self) -> None:
        removed = self.world.remove_ball()
        if removed is not None:
            renderer = self.renderers.pop(removed.id, None)
            if renderer is not None:
                renderer.dispose()

    def reset(self) -> None:
        for renderer in self.renderers.values():
            renderer.dispose()
        self.renderers.clear()
        self.world.reset()

    def nudge(self, x: float, y: float) -> None:
        """Shove every ball away from where the user clicked."""
        from .vector import Vec2

        click = Vec2(x, y)
        for ball in self.world.balls:
            offset = ball.position - click
            distance = max(offset.length(), 1.0)
            push = offset.normalized() * (60000.0 / (distance + 60.0))
            ball.velocity = (ball.velocity + push).clamped(self.config.max_speed_cap)

    def quit(self) -> None:
        self._running = False
        try:
            self.screen.bye()
        except turtle.Terminator:  # pragma: no cover - window already gone
            pass

    # -- frame loop ------------------------------------------------------
    def run(self) -> None:
        """Start the animation and block until the window closes."""
        self._last_time = time.perf_counter()
        self._schedule()
        try:
            turtle.mainloop()
        except turtle.Terminator:  # pragma: no cover - user closed the window
            pass

    def _schedule(self, work_seconds: float = 0.0) -> None:
        """Queue the next frame, subtracting the time this frame already took.

        Sleeping a full frame *after* doing the work would cap the animation at
        roughly ``fps / 2``; budgeting for the work keeps the real rate close
        to the configured one.
        """
        remaining = self.config.frame_time - work_seconds
        self.screen.ontimer(self._tick, max(1, int(round(remaining * 1000))))

    def _tick(self) -> None:
        if not self._running:
            return
        now = time.perf_counter()
        delta = min(now - self._last_time, _MAX_FRAME_DELTA)
        self._last_time = now
        if delta > 0.0:
            self._fps = self._fps * 0.9 + (1.0 / delta) * 0.1

        try:
            if not self.paused:
                self.world.step(delta)
            self._draw(delta)
        except turtle.Terminator:  # pragma: no cover - window closed mid-frame
            return
        self._schedule(time.perf_counter() - now)

    def _draw(self, delta: float) -> None:
        live_ids = set()
        for ball in self.world.balls:
            live_ids.add(ball.id)
            renderer = self.renderers.get(ball.id)
            if renderer is None:
                renderer = BallRenderer(ball)
                self.renderers[ball.id] = renderer
            renderer.draw(self.trails and not self.paused)

        for ball_id in list(self.renderers):
            if ball_id not in live_ids:
                self.renderers.pop(ball_id).dispose()

        self._hud_timer += delta
        if self.show_hud and self._hud_timer >= 0.2:
            self._hud_timer = 0.0
            self._draw_hud()

        self.screen.update()

    def _draw_hud(self) -> None:
        world, config = self.world, self.config
        left = -config.width / 2 + 16
        top = config.height / 2 - 28

        status = "PAUSED" if self.paused else "running"
        line1 = (
            f"{status}   balls {len(world.balls)}   bounces {world.bounce_count}   "
            f"fps {self._fps:4.0f}"
        )
        line2 = (
            f"gravity {'on' if world.gravity_enabled else 'off'}   "
            f"collisions {'on' if config.ball_collisions else 'off'}   "
            f"trails {'on' if self.trails else 'off'}   "
            f"energy {world.total_kinetic_energy / 1e6:6.2f} MJ"
        )

        self.hud.clear()
        for index, text in enumerate((line1, line2, *HELP_LINES)):
            self.hud.goto(left, top - index * 18)
            self.hud.write(text, font=("Consolas", 10, "normal"))


def run(config: Config) -> None:
    """Convenience entry point: build the app and run it."""
    BouncingBallApp(config).run()
