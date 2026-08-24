/**
 * Bouncing Ball - canvas renderer and UI.
 *
 * All the maths lives in physics.js (the current vector engine) and legacy.js
 * (the original slope-and-angle one); this file only draws what the chosen
 * World says and forwards input back to it. Both engines expose the same
 * surface, so the renderer never has to know which one is running.
 *
 * Loaded as a classic script (not a module) on purpose, so opening index.html
 * straight off the disk works without a server.
 */
(function () {
  'use strict';

  const { World, clamp } = window.BouncingBallPhysics;
  const { LegacyWorld } = window.BouncingBallLegacy;

  /**
   * The two physics cores, swappable at runtime. Same renderer, same controls,
   * same arena - only the maths underneath changes, which is the whole point
   * of being able to flip between them.
   */
  const ENGINES = {
    vector: {
      World,
      note: 'Reflects the velocity vector about the surface normal: v - 2(v·n)n. ' +
        'Mass, gravity and ball-to-ball impulse all build on that.',
    },
    slope: {
      World: LegacyWorld,
      note: 'The approach this project started with: a heading in degrees, reflected ' +
        'as 2w - h. No mass, no gravity, no ball-to-ball response, so balls pass ' +
        'straight through each other.',
    },
  };
  const DEFAULT_ENGINE = 'vector';

  const COLORS = {
    background: '#0d1117',
    grid: 'rgba(255, 255, 255, 0.028)',
  };
  /** Physics runs at this fixed rate regardless of the display refresh rate. */
  const FIXED_STEP = 1 / 120;
  const MAX_STEPS_PER_FRAME = 5;

  // ---------------------------------------------------------------- helpers
  const $ = (selector) => document.querySelector(selector);

  function readSettingsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const number = (key) => {
      const raw = params.get(key);
      if (raw === null) return undefined;
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    };
    const flag = (key) => {
      const raw = params.get(key);
      return raw === null ? undefined : raw !== '0' && raw !== 'false';
    };
    const settings = {
      ballCount: number('balls'),
      restitution: number('restitution'),
      seed: number('seed'),
      gravityStrength: number('gravityStrength'),
      ballCollisions: flag('collisions'),
    };
    Object.keys(settings).forEach((key) => {
      if (settings[key] === undefined) delete settings[key];
    });
    return {
      settings,
      engine: ENGINES[params.get('engine')] ? params.get('engine') : DEFAULT_ENGINE,
      gravityOn: flag('gravity') === true,
      trailsOn: flag('trails') !== false,
    };
  }

  /** Cheap "#rrggbb" -> "rgba(r, g, b, a)". */
  function withAlpha(hex, alpha) {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ------------------------------------------------------------------- app
  class App {
    constructor(canvas) {
      const url = readSettingsFromUrl();
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.baseSettings = url.settings;
      // What the *user* asked for, kept apart from what the running engine can
      // deliver. Switching to the old engine drops gravity, bounciness and
      // ball-to-ball collisions; switching back restores these rather than
      // whatever the old engine pinned them to.
      this.preferred = {
        restitution: url.settings.restitution === undefined ? 1 : url.settings.restitution,
        ballCollisions: url.settings.ballCollisions !== false,
        gravity: url.gravityOn,
      };
      this.engine = null;
      this.world = null;
      this.paused = false;
      this.trails = url.trailsOn;
      this.glow = true;
      this.ripples = [];
      this.grabbed = null;
      this.pointer = { x: 0, y: 0, previous: { x: 0, y: 0 } };
      this.fps = 60;
      this.accumulator = 0;
      this.lastFrame = performance.now();

      // Builds the world and pushes the whole model into the controls.
      this.setEngine(url.engine);

      this.resize();
      this.bindUi();
      this.bindInput();
      requestAnimationFrame(this.frame.bind(this));
    }

    measure() {
      const rect = this.canvas.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }

    resize() {
      const { width, height } = this.measure();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.world.resize(width, height);
    }

    // -------------------------------------------------------------- input
    bindInput() {
      window.addEventListener('resize', () => this.resize());

      const positionOf = (event) => {
        const rect = this.canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      };

      this.canvas.addEventListener('pointerdown', (event) => {
        const point = positionOf(event);
        this.pointer = { x: point.x, y: point.y, previous: point };
        const ball = this.ballAt(point.x, point.y);
        if (ball) {
          this.grabbed = ball;
          this.canvas.setPointerCapture(event.pointerId);
          this.canvas.classList.add('grabbing');
        } else {
          this.world.push(point.x, point.y);
          this.addRipple(point.x, point.y, '#ffffff', 90);
        }
      });

      this.canvas.addEventListener('pointermove', (event) => {
        const point = positionOf(event);
        this.pointer.previous = { x: this.pointer.x, y: this.pointer.y };
        this.pointer.x = point.x;
        this.pointer.y = point.y;
        if (this.grabbed) {
          this.grabbed.x = clamp(point.x, this.grabbed.radius, this.world.width - this.grabbed.radius);
          this.grabbed.y = clamp(point.y, this.grabbed.radius, this.world.height - this.grabbed.radius);
        } else {
          this.canvas.classList.toggle('hovering', Boolean(this.ballAt(point.x, point.y)));
        }
      });

      const release = () => {
        if (!this.grabbed) return;
        // Fling it: the velocity is however fast the pointer was moving.
        const throwScale = 22;
        this.grabbed.vx = (this.pointer.x - this.pointer.previous.x) * throwScale;
        this.grabbed.vy = (this.pointer.y - this.pointer.previous.y) * throwScale;
        this.grabbed = null;
        this.canvas.classList.remove('grabbing');
      };
      this.canvas.addEventListener('pointerup', release);
      this.canvas.addEventListener('pointercancel', release);

      window.addEventListener('keydown', (event) => {
        if (event.target.matches('input, select, textarea')) return;
        const handled = this.handleKey(event.key);
        if (handled) event.preventDefault();
      });
    }

    handleKey(key) {
      switch (key) {
        case ' ': this.setPaused(!this.paused); return true;
        case 'g': case 'G': this.setGravity(!this.world.gravityEnabled); return true;
        case 't': case 'T': this.setTrails(!this.trails); return true;
        case 'c': case 'C': this.setCollisions(!this.world.settings.ballCollisions); return true;
        case 'b': case 'B': this.setGlow(!this.glow); return true;
        case 'e': case 'E':
          this.setEngine(this.engine === 'slope' ? 'vector' : 'slope');
          return true;
        case 'r': case 'R': this.reset(); return true;
        case '+': case '=': this.setBallCount(this.world.balls.length + 1); return true;
        case '-': case '_': this.setBallCount(this.world.balls.length - 1); return true;
        case 'ArrowUp': this.world.scaleSpeed(1.25); return true;
        case 'ArrowDown': this.world.scaleSpeed(0.8); return true;
        default: return false;
      }
    }

    ballAt(x, y) {
      // Search backwards so the ball drawn on top is the one you grab.
      for (let i = this.world.balls.length - 1; i >= 0; i -= 1) {
        const ball = this.world.balls[i];
        if (Math.hypot(ball.x - x, ball.y - y) <= ball.radius) return ball;
      }
      return null;
    }

    // ----------------------------------------------------------- commands
    setPaused(value) {
      this.paused = value;
      $('#pause').textContent = value ? 'Resume' : 'Pause';
      $('#pause').setAttribute('aria-pressed', String(value));
    }

    /**
     * Swap the physics core. The arena, the ball count and the bounciness
     * carry over so the two engines can be compared like for like; anything
     * the incoming engine cannot represent is dropped and its control greyed
     * out.
     */
    setEngine(name) {
      const key = ENGINES[name] ? name : DEFAULT_ENGINE;
      if (this.engine === key) return;

      const previous = this.world;
      const size = this.measure();
      const Engine = ENGINES[key].World;
      this.engine = key;
      this.world = new Engine(size.width, size.height, Object.assign(
        {},
        this.baseSettings,
        {
          restitution: this.preferred.restitution,
          ballCollisions: this.preferred.ballCollisions,
        },
        previous ? { ballCount: previous.balls.length } : {}
      ));
      this.setGravity(this.preferred.gravity);

      // Nothing on screen belongs to the old world any more.
      this.ripples.length = 0;
      this.grabbed = null;
      this.canvas.classList.remove('grabbing', 'hovering');

      $('#engineNote').textContent = ENGINES[key].note;
      $('#statHeadingItem').hidden = key !== 'slope';
      this.syncUi();
    }

    /** Grey out every control the current engine has no answer for. */
    applyCapabilities() {
      const caps = this.world.capabilities;
      const gated = [
        ['#gravity', caps.gravity],
        ['#collisions', caps.ballCollisions],
        ['#restitution', caps.restitution],
      ];
      for (const [selector, supported] of gated) {
        const input = $(selector);
        const row = input.closest('.row');
        input.disabled = !supported;
        row.classList.toggle('unsupported', !supported);
        row.title = supported ? '' : 'The original approach had no notion of this.';
      }
    }

    setGravity(value) {
      this.preferred.gravity = value;
      this.world.setGravity(value && this.world.capabilities.gravity);
      $('#gravity').checked = this.world.gravityEnabled;
    }

    setTrails(value) {
      this.trails = value;
      if (!value) this.world.clearTrails();
      $('#trails').checked = value;
    }

    setCollisions(value) {
      this.preferred.ballCollisions = value;
      this.world.settings.ballCollisions = value && this.world.capabilities.ballCollisions;
      $('#collisions').checked = this.world.settings.ballCollisions;
    }

    setGlow(value) {
      this.glow = value;
      $('#glow').checked = value;
    }

    setBallCount(count) {
      const value = clamp(Math.round(count), 1, 60);
      this.world.setBallCount(value);
      $('#count').value = String(value);
      $('#countValue').textContent = String(value);
    }

    setRestitution(value) {
      this.preferred.restitution = value;
      if (this.world.capabilities.restitution) this.world.settings.restitution = value;
      $('#restitutionValue').textContent = this.world.settings.restitution.toFixed(2);
    }

    reset() {
      this.world.reset();
      this.ripples.length = 0;
    }

    bindUi() {
      $('#pause').addEventListener('click', () => this.setPaused(!this.paused));
      $('#reset').addEventListener('click', () => this.reset());
      $('#engine').addEventListener('change', (e) => this.setEngine(e.target.value));
      $('#gravity').addEventListener('change', (e) => this.setGravity(e.target.checked));
      $('#trails').addEventListener('change', (e) => this.setTrails(e.target.checked));
      $('#collisions').addEventListener('change', (e) => this.setCollisions(e.target.checked));
      $('#glow').addEventListener('change', (e) => this.setGlow(e.target.checked));
      $('#count').addEventListener('input', (e) => this.setBallCount(Number(e.target.value)));
      $('#restitution').addEventListener('input', (e) =>
        this.setRestitution(Number(e.target.value))
      );
      $('#panelToggle').addEventListener('click', () => {
        const panel = $('#panel');
        const collapsed = panel.classList.toggle('collapsed');
        $('#panelToggle').textContent = collapsed ? '+' : '-';
        $('#panelToggle').setAttribute('aria-expanded', String(!collapsed));
      });
    }

    /** Push the current model state into every control - at startup, and
     *  again whenever the engine swaps under them. */
    syncUi() {
      this.applyCapabilities();
      $('#engine').value = this.engine;
      $('#gravity').checked = this.world.gravityEnabled;
      $('#trails').checked = this.trails;
      $('#collisions').checked = this.world.settings.ballCollisions;
      $('#glow').checked = this.glow;
      $('#count').value = String(this.world.balls.length);
      $('#countValue').textContent = String(this.world.balls.length);
      $('#restitution').value = String(this.world.settings.restitution);
      $('#restitutionValue').textContent = this.world.settings.restitution.toFixed(2);
    }

    // -------------------------------------------------------------- frame
    frame(now) {
      const delta = Math.min((now - this.lastFrame) / 1000, 0.25);
      this.lastFrame = now;
      // Clamp the sample: a delta of ~0 (headless capture, a resumed tab)
      // would otherwise spike the readout into the thousands.
      const sample = Math.min(1 / Math.max(delta, 1e-3), 240);
      this.fps = this.fps * 0.92 + sample * 0.08;

      if (!this.paused) {
        // Fixed-step accumulator: the simulation behaves the same on a 60 Hz
        // laptop and a 144 Hz monitor.
        this.accumulator = Math.min(this.accumulator + delta, FIXED_STEP * MAX_STEPS_PER_FRAME);
        while (this.accumulator >= FIXED_STEP) {
          const collisions = this.world.step(FIXED_STEP);
          this.accumulator -= FIXED_STEP;
          for (const hit of collisions) {
            if (hit.speed > 90) this.addRipple(hit.x, hit.y, hit.ball.color, hit.speed / 6);
          }
        }
        if (this.grabbed) {
          this.grabbed.vx = 0;
          this.grabbed.vy = 0;
        }
      }

      this.draw(delta);
      this.updateStats();
      requestAnimationFrame(this.frame.bind(this));
    }

    addRipple(x, y, color, size) {
      if (this.ripples.length > 60) this.ripples.shift();
      this.ripples.push({ x, y, color, radius: 4, max: clamp(size, 20, 120), life: 1 });
    }

    // --------------------------------------------------------------- draw
    draw(delta) {
      const ctx = this.ctx;
      const { width, height } = this.world;

      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, width, height);
      this.drawGrid(width, height);
      if (this.trails) this.drawTrails();
      this.drawRipples(delta);
      this.drawBalls();
    }

    drawGrid(width, height) {
      const ctx = this.ctx;
      const spacing = 48;
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = spacing; x < width; x += spacing) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = spacing; y < height; y += spacing) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    drawTrails() {
      const ctx = this.ctx;
      for (const ball of this.world.balls) {
        const trail = ball.trail;
        const points = trail.length / 2;
        for (let i = 0; i < points; i += 1) {
          // Newest points are last, so they are the biggest and brightest.
          const t = (i + 1) / points;
          ctx.beginPath();
          ctx.arc(trail[i * 2], trail[i * 2 + 1], ball.radius * 0.72 * t, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(ball.color, 0.1 * t * t);
          ctx.fill();
        }
      }
    }

    drawRipples(delta) {
      const ctx = this.ctx;
      for (let i = this.ripples.length - 1; i >= 0; i -= 1) {
        const ripple = this.ripples[i];
        ripple.life -= delta * 2.4;
        if (ripple.life <= 0) {
          this.ripples.splice(i, 1);
          continue;
        }
        ripple.radius += (ripple.max - ripple.radius) * Math.min(delta * 9, 1);
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(ripple.color, 0.34 * ripple.life);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    drawBalls() {
      const ctx = this.ctx;
      for (const ball of this.world.balls) {
        if (this.glow) {
          ctx.shadowColor = withAlpha(ball.color, 0.85);
          ctx.shadowBlur = ball.sinceImpact < 6 ? 34 : 18;
        }

        // A light source up and to the left gives the disc some volume.
        const gradient = ctx.createRadialGradient(
          ball.x - ball.radius * 0.35,
          ball.y - ball.radius * 0.35,
          ball.radius * 0.1,
          ball.x,
          ball.y,
          ball.radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.28, ball.color);
        gradient.addColorStop(1, withAlpha(ball.color, 0.82));

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (ball === this.grabbed) {
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, ball.radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    updateStats() {
      const world = this.world;
      $('#statBalls').textContent = String(world.balls.length);
      $('#statBounces').textContent = world.bounceCount.toLocaleString();
      $('#statFps').textContent = String(Math.round(this.fps));
      $('#statEnergy').textContent = (world.totalKineticEnergy / 1e6).toFixed(2);

      // The old engine's defining state variable, shown only when it is live.
      if (this.engine === 'slope') {
        const lead = world.balls[0];
        $('#statHeading').textContent = lead ? String(Math.round(lead.heading)) : '0';
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    // eslint-disable-next-line no-new
    new App(document.getElementById('stage'));
  });
})();
