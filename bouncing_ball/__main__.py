"""Allow ``python -m bouncing_ball``."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
