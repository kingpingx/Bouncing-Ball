"""Command line front end: turns arguments into a :class:`Config` and runs."""

from __future__ import annotations

import argparse
import sys
from typing import Sequence

from .config import Config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bouncing-ball",
        description="Balls bouncing around a window, using vector reflection.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        epilog=(
            "Keys while running: space pause, g gravity, t trails, "
            "c ball collisions, +/- balls, up/down speed, r reset, q quit. "
            "Click anywhere to shove the balls away from the pointer."
        ),
    )
    defaults = Config()

    window = parser.add_argument_group("window")
    window.add_argument("--width", type=int, default=defaults.width)
    window.add_argument("--height", type=int, default=defaults.height)
    window.add_argument("--fps", type=int, default=defaults.fps)

    balls = parser.add_argument_group("balls")
    balls.add_argument(
        "-n", "--balls", type=int, default=defaults.ball_count,
        help="how many balls to start with",
    )
    balls.add_argument("--min-radius", type=float, default=defaults.min_radius)
    balls.add_argument("--max-radius", type=float, default=defaults.max_radius)
    balls.add_argument("--min-speed", type=float, default=defaults.min_speed)
    balls.add_argument("--max-speed", type=float, default=defaults.max_speed)

    physics = parser.add_argument_group("physics")
    physics.add_argument(
        "--gravity", action="store_true", help="start with gravity switched on"
    )
    physics.add_argument(
        "--gravity-strength", type=float, default=defaults.gravity_strength,
        help="downward acceleration in px/s^2 when gravity is on",
    )
    physics.add_argument(
        "--restitution", type=float, default=defaults.restitution,
        help="bounciness: 1.0 keeps all energy, 0.8 loses 20%% per bounce",
    )
    physics.add_argument(
        "--air-drag", type=float, default=defaults.air_drag,
        help="velocity damping per second (0 disables it)",
    )
    physics.add_argument(
        "--substeps", type=int, default=defaults.substeps,
        help="physics iterations per frame; raise for very fast balls",
    )
    physics.add_argument(
        "--no-ball-collisions", action="store_true",
        help="let balls pass through each other",
    )

    look = parser.add_argument_group("presentation")
    look.add_argument("--no-trails", action="store_true")
    look.add_argument("--no-hud", action="store_true")
    look.add_argument(
        "--seed", type=int, default=None, help="fix the random seed for a repeatable run"
    )
    return parser


def config_from_args(argv: Sequence[str] | None = None) -> Config:
    args = build_parser().parse_args(argv)
    config = Config(
        width=args.width,
        height=args.height,
        fps=args.fps,
        ball_count=args.balls,
        min_radius=args.min_radius,
        max_radius=args.max_radius,
        min_speed=args.min_speed,
        max_speed=args.max_speed,
        gravity_strength=args.gravity_strength,
        gravity=args.gravity_strength if args.gravity else 0.0,
        restitution=args.restitution,
        air_drag=args.air_drag,
        substeps=args.substeps,
        ball_collisions=not args.no_ball_collisions,
        trails=not args.no_trails,
        show_hud=not args.no_hud,
        seed=args.seed,
    )
    config.validate()
    return config


def main(argv: Sequence[str] | None = None) -> int:
    try:
        config = config_from_args(argv)
    except ValueError as error:
        print(f"bouncing-ball: {error}", file=sys.stderr)
        return 2

    try:
        from .turtle_app import run
    except ImportError as error:  # pragma: no cover - depends on the install
        print(
            "bouncing-ball: could not import turtle graphics "
            f"({error}).\nOn Linux install tkinter, e.g. "
            "'sudo apt install python3-tk'.",
            file=sys.stderr,
        )
        return 1

    run(config)
    return 0
