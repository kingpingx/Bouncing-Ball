# The physics, from zero

Two parts:

- **[Part A — Reflection from zero](#part-a--reflection-from-zero)** builds
  `v_out = v - 2(v·n)n` from nothing. It assumes you know what coordinates are and
  nothing else — no vectors, no dot products.
- **[Part B — The first approach, and how to fix it](#part-b--the-first-approach-and-how-to-fix-it)**
  looks at the slope-and-angle method this project started with, why it was fragile, and the
  eight changes that make it work. The result is runnable in both languages —
  [`legacy/original_fixed.py`](../legacy/original_fixed.py) and
  [`web/legacy.js`](../web/legacy.js), the latter switchable live in the browser demo, so you
  can watch the two approaches on the same canvas.

---

# Part A — Reflection from zero

## 1. What problem are we solving?

Imagine a ball moving like this:

```
          → → →
        ball
          ↘
           ↘
            ↘
──────────────────── floor
```

When it hits the floor, we want:

```
Before:  → + ↓
After:   → + ↑
```

So if it was moving:

- **right** → it should keep moving right
- **down** → it should start moving up

Mathematically, we need to change:

```
(5, -3)  →  (5, 3)
```

The question is: **how can one formula work for any wall, floor, ceiling, or angled surface?**

That formula is:

```
v_out = v - 2 (v · n) n
```

Let's understand every single piece.

## 2. First: what is a vector?

A vector represents **direction and amount**.

In 2D, `(5, -3)` means:

- `5` in the x direction → right
- `-3` in the y direction → down

Visually:

```
          y
          ↑
          |
          |
----------+----------→ x
           \
            \
             \ (5, -3)
              ↘
```

You can think of this as the ball's velocity:

```
v = (5, -3)
```

So the ball moves right with speed 5 and down with speed 3.

## 3. What happens when the ball hits a floor?

Consider a horizontal floor:

```
       ball
         ↘
          ↘  v = (5, -3)
           ↘
────────────────── floor
```

After bouncing:

```
         ↗
        ↗  v = (5, 3)
       ball
────────────────── floor
```

Notice:

- Horizontal movement stays the same: `5 → 5`
- Vertical movement reverses: `-3 → 3`

Therefore `(5, -3) → (5, 3)`.

For a floor this seems easy. You could just say *"change the y value's sign"*.

But what if the surface is angled?

```
              /
             /
      ↘     /
       ↘   /
        ↘ /
```

Now you cannot simply reverse x or y. We need a way to describe **the surface's direction**.

## 4. What is a normal?

A normal is simply a vector pointing **straight out of a surface**.

For a floor:

```
         ↑
         │ n = (0, 1)
         │
─────────┼───────── floor
```

The floor runs horizontally (`→ → → → →`) and the normal goes perpendicular to it (`↑`), so:

```
n = (0, 1)
```

because x movement is `0` and y movement is `1`, upward.

For a ceiling:

```
──────────── ceiling
      │
      ↓
      n            n = (0, -1)
```

For a vertical wall:

```
wall │      n →
     │──────────    n = (1, 0)
```

The important concept: **the normal tells us the direction in which a collision should bounce.**

## 5. Velocity has two parts

Suppose the ball moves `v = (5, -3)` toward the floor. We can split its movement into two
independent movements.

**Part 1 — along the floor:**

```
→ → → → →   (5, 0)
──────────── floor
```

**Part 2 — into the floor:**

```
      ↓
      ↓     (0, -3)
──────────── floor
```

Together: `(5, 0) + (0, -3) = (5, -3)`. So:

```
v = (5, 0) + (0, -3)
```

This is extremely important. The velocity consists of:

```
velocity = (parallel to surface) + (perpendicular to surface)

v = v∥ + v⊥
```

When the ball bounces:

- the **parallel** part stays the same: `v∥ = (5, 0)`
- the **perpendicular** part reverses: `v⊥ = (0, -3)` becomes `-v⊥ = (0, 3)`

Therefore:

```
v_out = (5, 0) + (0, 3)
v_out = (5, 3)
```

**That is the whole physics of reflection.** Now we need to understand how the formula
automatically finds the perpendicular part.

## 6. How do we find the perpendicular part?

Suppose `v = (5, -3)` and the floor's normal is `n = (0, 1)`. We want to answer:

> How much of velocity `v` is moving in the normal's direction?

The **dot product** answers exactly this.

## 7. What is a dot product?

For two vectors `a = (aₓ, a_y)` and `b = (bₓ, b_y)`:

```
a · b = aₓbₓ + a_y b_y
```

For example:

```
(5, -3) · (0, 1)
  = (5 × 0) + (-3 × 1)
  = 0 - 3
  = -3
```

So `v · n = -3`. But what does `-3` actually *mean*?

## 8. Understanding the dot product intuitively

Our normal is `n = (0, 1)`. This means: **"look only in the upward direction."**

Our velocity is `v = (5, -3)`:

```
→ → → → →      (rightward part)
   ↓ ↓ ↓       (downward part)
```

The normal is asking: *how much are you moving upward?*

Answer: `-3`. Negative, because the ball is moving **down**, the opposite direction.

So `v · n = -3` means: *the ball has 3 units of movement opposite to the normal.*

## 9. Why multiply by the normal again?

We have `v · n = -3`. But this is just a **number**. We need a **vector**.

The number says *"there are -3 units along the normal direction"*. The normal gives us the
direction, `n = (0, 1)`. So multiply them:

```
(v · n) n
  = (-3)(0, 1)
  = (0, -3)
```

And look what we got — `(0, -3)` is exactly the part of the velocity going into the floor:

```
(v · n) n = v⊥
```

This expression **extracts the perpendicular component**.

## 10. Now comes the mysterious 2

We started with `v = (5, -3)`. The perpendicular component is `v⊥ = (0, -3)`. We want to
change it to `(0, 3)`. How?

**Subtract it once:**

```
v - v⊥ = (5, -3) - (0, -3) = (5, 0)
```

What happened?

```
Before:              After subtracting once:
→ → → → →            → → → → →
   ↓ ↓ ↓
```

We completely removed the downward component. The ball would now **slide along the floor**:

```
v - v⊥ = v∥
```

**But we don't want it to stop moving vertically — we want it to move upward.**

The original perpendicular component was `(0, -3)`. We removed it once. To *reverse* it, we
need to go another equal distance in the opposite direction. So subtract it again:

```
v - v⊥ - v⊥ = v - 2 v⊥
```

Since `v⊥ = (v · n) n`:

```
v_out = v - 2 (v · n) n
```

## 11. Let's calculate the entire example slowly

Given `v = (5, -3)` and floor normal `n = (0, 1)`.

**Step 1 — the dot product:**

```
v · n = (5, -3) · (0, 1)
      = 5(0) + (-3)(1)
      = -3
```

**Step 2 — the perpendicular component:**

```
(v · n) n = (-3)(0, 1)
          = (0, -3)          ← the downward part
```

**Step 3 — multiply it by 2:**

```
2 (v · n) n = 2(0, -3)
            = (0, -6)
```

**Step 4 — subtract it from the original velocity:**

```
v_out = v - 2 (v · n) n
      = (5, -3) - (0, -6)
```

Remember vector subtraction is `(a, b) - (c, d) = (a - c, b - d)`:

```
      = (5 - 0, -3 - (-6))
      = (5, -3 + 6)
      = (5, 3)
```

The ball now moves right 5, up 3. Exactly as expected.

### The complete intuition

```
Original velocity, v          Find the part going       Remove that part once
                              into the surface,         → → → → →
        ↘                     (v · n) n
       ↘                              ↓                 the ball now slides
      ↘                               ↓                 along the surface


Remove that same component again
        ↑
        ↑
→ → → → →

the downward movement has become upward movement
```

So: `original - 2 × (component into surface)`, which is:

```
v_out = v - 2 (v · n) n
```

## 12. Remember this one sentence

> The dot product tells us **how much** velocity lies in the normal direction; multiplying by
> the normal turns that amount back into a **vector**; subtracting it **twice** reverses only
> that component.

## 13. Angled walls — the payoff

Everything above used `n = (0, 1)`, and for that case the formula collapses to "flip the y
value". So why bother?

Because **nothing in the derivation assumed the wall was flat.** Point `n` anywhere and the
same formula works:

```
        n
         ↖         wall at 45°
          \  /
           \/
           /\
          /  ↘ v
```

A wall tilted 45° has `n = (-0.707, 0.707)`. Run the same three steps and you get the correct
bounce — no new code, no new case. A slanted paddle, a moving bumper, a curved surface (whose
normal changes with the contact point): all the same line.

That is why this project uses the vector form even though its walls are axis-aligned. In
[`bouncing_ball/world.py`](../bouncing_ball/world.py) the wall code really is just
`vx = -vx * restitution` — but the moment you add a slanted wall, the formula is already there.

## 14. Ball against ball — the same idea

When two balls collide there is no wall. So what is `n`?

**The line joining their centres.**

```
     ( A )────n───→( B )
```

Everything else follows: the motion *along* `n` is the squeeze between them, and the motion
across `n` just slides past, untouched. That is why balls glance off each other at an angle
instead of always bouncing straight back.

One difference: with a wall, the wall doesn't move. Here both balls do, so instead of simply
flipping the perpendicular part, they **trade** it — weighted by mass:

```
j = -(1 + e) (v_rel · n) / (1/m₁ + 1/m₂)

v₁ = v₁ - (j/m₁) n
v₂ = v₂ + (j/m₂) n
```

- `v_rel = v₂ - v₁` is how fast they are closing.
- `e` is bounciness: `1` keeps all the speed, `0.5` keeps half, `0` and they stick.
- `j` is sized so whatever one ball loses the other gains — momentum in, momentum out.

Two consequences worth knowing:

- **Equal masses, head-on** → they swap velocities exactly. One stops dead, the other takes
  off. (This is asserted in `tests/test_physics.py::test_equal_masses_swap_velocity`.)
- **Heavy versus light** → the heavy ball barely notices; the light one goes flying. Mass here
  comes from the disc area, `m = πr²`, so a big ball genuinely shoves a small one aside.

## 15. The same formula in both languages

This project implements the maths twice — Python for the turtle version, JavaScript for the
browser — and the point of showing them together is that **the formula does not change**. Only
the syntax does.

### The wall bounce

<table>
<tr><th>Python — <code>bouncing_ball/world.py</code></th><th>JavaScript — <code>web/physics.js</code></th></tr>
<tr><td>

```python
if x - ball.radius < bounds.left:
    x = bounds.left + ball.radius
    if vx < 0.0:
        vx = -vx * restitution
    normal_x = 1.0
```

</td><td>

```js
if (ball.x - ball.radius < this.left) {
  ball.x = this.left + ball.radius;
  if (ball.vx < 0) ball.vx = -ball.vx * restitution;
  nx = 1;
}
```

</td></tr>
</table>

Both are `v_out = v - 2(v·n)n` with `n = (1, 0)`, collapsed to "negate `vx`" — plus the clamp
that keeps the ball inside, and `restitution` (`e`) to bleed off energy on a soft bounce.

### The ball-to-ball impulse

<table>
<tr><th>Python</th><th>JavaScript</th></tr>
<tr><td>

```python
approach = relative_velocity.dot(normal)
if approach >= 0.0:
    return None

impulse = (-(1.0 + restitution) * approach
           / inv_total)
a.velocity = a.velocity - normal * (impulse * inv_a)
b.velocity = b.velocity + normal * (impulse * inv_b)
```

</td><td>

```js
const approach = (b.vx - a.vx) * nx
               + (b.vy - a.vy) * ny;
if (approach >= 0) return;

const impulse = -(1 + restitution) * approach
              / invTotal;
a.vx -= nx * impulse * invA;
a.vy -= ny * impulse * invA;
b.vx += nx * impulse * invB;
b.vy += ny * impulse * invB;
```

</td></tr>
</table>

The Python side has a `Vec2` type, so `v · n` is `.dot()` and scaling is `*`. The JavaScript
side keeps `x`/`y` as plain numbers on the ball — faster for canvas, and it makes the dot
product visible as what it literally is: `aₓbₓ + a_yb_y`, exactly as in section 7.

### The one real difference: which way is up

Turtle puts the origin in the middle of the window with **+y pointing up**. Canvas puts it in
the top-left corner with **+y pointing down**. So the two files disagree about the sign of
"up", and only about that:

|  | Python (turtle) | JavaScript (canvas) |
|---|---|---|
| Gravity | `Vec2(0.0, -config.gravity)` | `ball.vy + gravity * dt` |
| Floor is at | `bounds.bottom`, the *smallest* y | `this.bottom`, the *largest* y |
| Floor's normal | `(0, 1)` | `(0, -1)` |

The reflection formula never notices. Feed it whichever `n` is correct for your coordinate
system and it returns the right answer — which is the whole argument for writing the bounce as
a normal rather than as "flip the y value".

### Trying it yourself

`web/physics.js` deliberately touches no DOM API, so it runs under Node as well as in the
browser:

```bash
node -e "
const {World} = require('./web/physics.js');
const w = new World(800, 600, {seed: 1, ballCount: 6});
const before = w.totalKineticEnergy;
for (let i = 0; i < 2000; i++) w.step(1/60);
console.log('energy ratio:', w.totalKineticEnergy / before);
console.log('escaped:', w.anyBallEscaped());
"
```

which prints:

```
energy ratio: 1.0000000000000018
escaped: false
```

Over 2000 frames of perfectly elastic bouncing, the energy is unchanged to within
floating-point noise — that trailing `18` is about one part in a quadrillion — and not one ball
has left the box. The Python side asserts the same two facts in `tests/test_physics.py`.

---

# Part B — The first approach, and how to fix it

The first version of this project computed each bounce from the **slope of the ball's path and
the angle between two lines**:

```
tan θ = (m₂ - m₁) / (1 - m₁ m₂)        turn = 2θ
```

where `m₁` is the slope of the ball's path and `m₂` the slope of the wall — `0` for a
horizontal wall, and `999999999` standing in for a vertical one's infinite slope.

You can still read it: `git show HEAD:main.py`.

## The maths was correct

This is worth saying plainly, because it is the interesting part. Run the formula on its own
and every generic case comes out right:

| incoming | wall | turn | expected |
|---|---|---|---|
| 30° | horizontal | 60° | 60° |
| 30° | vertical | 120° | 120° |
| 45° | vertical | 90° | 90° |
| 60° | horizontal | 120° | 120° |

The formula was never the bug. What failed was the **representation**: slopes, which are
undefined for vertical lines, and *relative turns*, which throw away the direction.

## What actually went wrong

**1. Slope is undefined for vertical travel.**

```python
m1 = (y2 - y1) / (x2 - x1)     # ZeroDivisionError when x2 == x1
```

A ball moving exactly straight up or down crashes the program.

**2. Infinite slope had to be faked.** `m2 = 999999999` works numerically, but a vertical wall
being a magic number rather than a case the maths handles is a warning sign.

**3. `abs()` destroyed the direction.** The formula tells you *how much* to turn, not *which
way*. A ball going up-right and one going down-right both return `60.00`. That discarded bit
is exactly why `direction()` needed **sixteen branches** — four quadrants × four walls — to
reconstruct by hand what the formula had thrown away.

**4. The branch tree had holes, and they failed silently.** Two real ones:

- In the wall-1 block, the arms are `y_2 >= 0 and y_2 >= y_1`, `0 <= y_2 <= y_1`,
  `y_2 < 0 and y_2 < y_1`, `0 > y_2 > y_1`. A ball with `y_2 == y_1` and `y_2 < 0` matches
  **none** of them. No turn happens; the ball carries on into the wall.
- In `angling()`, the outer tests are `x2 > 0 and y2 > 0` and friends — all strict. A ball
  hitting the right wall at exactly `y2 == 0` matches nothing, so `angle` keeps its
  initialiser `1` and the function returns `2·atan(1)` = **90°**. A missed detection doesn't
  raise; it quietly turns the ball 90°.

**5. The arena constants were wrong.** The walls were placed at `±canvwidth` and `±canvheight`.
But in CPython's `turtle.py`, `canvwidth` is the **full** canvas width — the drawing region is
`±canvwidth/2` — and `_CFG["canvwidth"]` is `400`. `setup(870, 670)` resizes the *window*, not
the canvas. So the walls sat at double the intended distance and matched neither the canvas
(`±200`) nor the window (`±435`). It looked fine only because `±400` happens to land just
inside an 870-wide window.

**6. Detection used a two-pixel window against one-pixel steps.**
`canvwidth - 1 < x2 < canvwidth + 1`, with the ball advancing `forward(1)` per iteration. The
ball could sit inside that window for two iterations and turn twice — which is what the stray
`t.forward(2)` after each turn was papering over.

## The fixes

Each of these is a real improvement on its own, in rough order of payoff:

| # | Change | What it kills |
|---|---|---|
| 1 | Headings / `atan2` instead of slopes | the `ZeroDivisionError` on vertical travel; the `999999999` stand-in |
| 2 | `setheading()` (absolute) instead of `left()`/`right()` (relative) | sign loss → the sixteen-branch tree; accumulating error |
| 3 | Clamp the position to the wall *before* reflecting | the ±1 px window, double-turns, sticking, the `forward(2)` hack |
| 4 | `window_width()/2`, not `canvwidth` | walls at double the intended distance |
| 5 | Subtract the ball's radius | half the ball hanging off-screen |
| 6 | px/second × elapsed time | speed depending on how fast the machine loops |
| 7 | `ontimer` + `tracer(0)`/`update()` instead of `while 1:` | an unclosable window; a redraw per turtle command |
| 8 | Delete the `angle = 1` fallback and the per-frame `print()` | silent wrong answers; frame time |

Fixes 1 and 2 together are the big one. They reduce `angling()` **and** `direction()` — about
190 lines — to this:

```python
if x < LEFT or x > RIGHT:
    ball.setx(min(max(x, LEFT), RIGHT))       # clamp first
    ball.setheading(180 - ball.heading())     # vertical wall

if y < BOTTOM or y > TOP:
    ball.sety(min(max(y, BOTTOM), TOP))
    ball.setheading(-ball.heading())          # horizontal wall
```

Corners need no special case at all: in a corner both branches run, composing to
`h → -(180 - h) = h - 180`, a clean 180° reversal. The original opened with four separate
corner branches to get the same result.

The complete fixed program is [`legacy/original_fixed.py`](../legacy/original_fixed.py) —
about 50 lines, one ball, still angle-based, no vectors anywhere. Run it with:

```bash
python legacy/original_fixed.py
```

## Running the old approach next to the new one

It is ported to JavaScript as [`web/legacy.js`](../web/legacy.js), so the browser demo can run
it too: choose **Slope & angle (v1)** from the Engine dropdown, press <kbd>E</kbd>, or open
`web/index.html?engine=slope`. Same canvas, same renderer, same arena, same ball count — the
only thing that changes is which core is stepping the balls, which is what makes the two
comparable at all.

The port keeps the *representation*, not just the answer. A ball's motion is stored the way
turtle stores it, as a scalar `speed` and a `heading` in degrees; `vx` and `vy` exist only as
accessors that convert on demand. Watch the **heading** readout that appears in the HUD — that
one number is the engine's entire state of motion.

Converting on demand is also where the cost of the old model becomes visible in code. Scaling
the speed is a single multiply, because here speed genuinely *is* a number:

```js
scaleSpeed(factor) {
  for (const ball of this.balls) ball.speed *= factor;
}
```

But the click shockwave has no velocity vector to add an impulse to, so it has to build one,
push it, and take it apart again — the round trip the vector engine never makes:

```js
ball.setVelocity(
  ball.vx + (dx / distance) * force,   // heading + speed -> vector
  ball.vy + (dy / distance) * force
);                                     // -> and back to heading + speed
```

The port is also missing what the original was missing: no gravity, no restitution, no
ball-to-ball response. The demo greys those controls out when you switch to it rather than
accepting settings it would silently ignore, and its balls pass straight through each other.
[`web/legacy.test.js`](../web/legacy.test.js) asserts all three absences alongside the
reflection cases, so the comparison stays honest as the code moves.

## The punchline

Reflecting a heading `h` off a wall lying at angle `w` is:

```
h_out = 2w - h
```

A vertical wall is `w = 90°`, giving `180 - h`. A horizontal wall is `w = 0°`, giving `-h`.

**This is `v - 2(v·n)n` written in angles.** Checked against vector reflection across five wall
angles and six headings: identical every time, including the cases that crashed or silently
misbehaved in the original — straight-up travel, dead-on horizontal incidence, corners.

So the original instinct — *think about angles between lines* — was right. Angles are a
perfectly good way to express reflection. What made it fragile was choosing **slopes** to
represent those angles (undefined for vertical lines, sign-blind under `abs()`) and applying
the result as a **relative turn** rather than an absolute heading.

## Where the angle form runs out

It handles any wall, at any tilt. What it does not reach is Part A section 14: ball against
ball with unequal masses. There you need the velocity split into normal and tangential
components and recombined with a mass-weighted impulse. You *can* do that with trigonometry —
rotate into the collision frame, solve the 1D problem, rotate back — but it is three
coordinate changes and a fistful of `sin`/`cos` calls to express what `v - 2(v·n)n` and one
impulse line already say.

That is the whole argument for vectors here. Not that the angle version was wrong — it wasn't —
but that the vector version says the same thing once, and keeps saying it as the problem
grows.
