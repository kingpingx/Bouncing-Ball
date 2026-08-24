#!/usr/bin/env python3
"""Entry point: ``python main.py [options]``.

The simulation itself lives in the ``bouncing_ball`` package; this file only
hands the command line over to it. Run ``python main.py --help`` for options.
"""

import sys

from bouncing_ball.cli import main

if __name__ == "__main__":
    sys.exit(main())
