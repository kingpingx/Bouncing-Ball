#!/usr/bin/env python3
"""The original slope-and-angle approach, with its bugs fixed.

This is deliberately kept close to the first version of this project: one ball,
turtle graphics, and *angles* rather than vectors. No imports from
``bouncing_ball`` - it stands alone so you can read it side by side with the
original (``git show HEAD:main.py``).

Every change from the original is marked ``FIX n`` and explained in
``docs/physics.md``. The whole bounce is now four lines, down from an
``angling()`` function plus a sixteen-branch ``direction()`` tree.

Run it with::

    python legacy/original_fixed.py
"""

import random
import turtle

RADIUS = 30          # FIX 5: shapesize(3) draws a 60 px ball. The original
                     # compared the ball's *centre* to the wall, so half the
                     # ball hung off the screen on every bounce.
SPEED = 260.0        # FIX 6: pixels per second, not pixels per loop iteration,
                     # so the ball moves at the same rate on any machine.
FRAME_MS = 16

screen = turtle.Screen()
screen.setup(870, 670)
screen.bgcolor("#0d1117")
screen.title("Bouncing Ball - the original approach, fixed")
screen.tracer(0)     # FIX 7a: draw once per frame instead of once per command.

# FIX 4: the arena is the *window*, halved. The original used screen.canvwidth,
# which is the full canvas width (400 by default), as though it were a
# half-extent - so its walls sat at twice the intended distance and matched
# neither the canvas nor the window. setup() resizes the window, not the canvas.
LEFT = -screen.window_width() / 2 + RADIUS
RIGHT = screen.window_width() / 2 - RADIUS
BOTTOM = -screen.window_height() / 2 + RADIUS
TOP = screen.window_height() / 2 - RADIUS

ball = turtle.Turtle(shape="circle")
ball.shapesize(RADIUS / 10)
ball.color("#ff5c8a")
ball.penup()
ball.speed(0)
ball.setheading(random.uniform(0, 360))


def step():
    """One frame: move, then bounce off any wall the ball has reached."""
    ball.forward(SPEED * FRAME_MS / 1000)
    x, y = ball.position()

    if x < LEFT or x > RIGHT:
        # FIX 3: clamp to the wall *first*. The original tested a two-pixel
        # window (canvwidth - 1 < x < canvwidth + 1) against one-pixel steps,
        # so the ball could sit inside the window for two iterations and turn
        # twice - which is what the stray `t.forward(2)` was papering over.
        # Clamping means the ball can never end a frame outside the arena.
        ball.setx(min(max(x, LEFT), RIGHT))

        # FIX 1: a heading, not a slope. (y2 - y1) / (x2 - x1) is undefined
        # when the ball travels straight up or down, and a vertical wall has no
        # slope at all - hence the original's m2 = 999999999 stand-in.
        # FIX 2: setheading() is absolute. The original turned by a *relative*
        # amount with left()/right(), and because angling() called abs() on the
        # tangent, the turn direction was lost and had to be rebuilt by hand -
        # that is the entire sixteen-branch quadrant tree. Reflecting a heading
        # off a wall at angle w is just h_out = 2w - h. A vertical wall is
        # w = 90, so 2w - h = 180 - h.
        ball.setheading(180 - ball.heading())

    if y < BOTTOM or y > TOP:
        ball.sety(min(max(y, BOTTOM), TOP))
        ball.setheading(-ball.heading())        # horizontal wall: w = 0

    # In a corner both branches run, composing to h -> -(180 - h) = h - 180:
    # a clean 180 degree reversal, which is exactly right. No special case
    # needed, unlike the four corner branches the original opened with.

    # FIX 8: no `angle = 1` fallback (it silently returned a 90 degree turn for
    # any case the branches missed) and no print() on every frame.

    screen.update()
    screen.ontimer(step, FRAME_MS)   # FIX 7b: not `while 1:`. A bare loop
                                     # starves tkinter, so the original's
                                     # window could not be closed or paused.


step()
turtle.mainloop()
