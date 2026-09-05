/* Smooth 360 spin viewer — inspired by CarDekho / Object2VR logic.
 * - Infinite horizontal wrap (wrapx=1)
 * - Inertia / mass simulation (simulatemass=1)
 * - Sensitivity-based drag (sensitivity=10)
 * - Auto-rotate after idle (delay 3s)
 * Uses a single <img> fed from preloaded cache + rAF lerp for buttery motion.
 */
class SpinViewer {
  constructor(rootEl, opts) {
    this.root = rootEl;
    this.img = rootEl.querySelector('.spin-frame');
    this.loaderBar = rootEl.querySelector('.loader-fill');
    this.loaderWrap = rootEl.querySelector('.spin-loader');
    this.pct = rootEl.querySelector('.spin-pct');
    this.hint = rootEl.querySelector('.spin-hint');
    this.count = rootEl.querySelector('.spin-count');

    this.frames = [];
    this.destroyed = false;
    this.started = false;
    this.abort = new AbortController();
    this.sourceFrames = opts.frames;
    this.frameStep = Math.max(1, Number(opts.frameStep) || 1);
    this.N = Math.ceil(this.sourceFrames / this.frameStep);
    this.folder = opts.folder;
    this.pattern = opts.pattern || 'frame-{nn}.jpg';
    this.pixelsPerFrame = 18;
    this.damping = 0.9;
    this.lerp = 0.3;
    this.autoSpeed = 0.06;
    this.autoDelay = opts.autoRotateDelay ?? 3000;

    this.target = 0;
    this.current = 0;
    this.velocity = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastT = 0;
    this.lastInteract = performance.now();
    this.autoPlay = opts.autoRotate !== false;
    this.loaded = 0;
    this.shown = -1;

    this.frameUrl = (i) => {
      const sourceIndex = Math.min(this.sourceFrames - 1, i * this.frameStep);
      return `${this.folder}/${this.pattern.replace('{nn}', String(sourceIndex).padStart(2, '0'))}`;
    };

    this.bind();
    this.preload().then(() => {
      if (this.destroyed) return;
      this.loaderWrap?.classList.add('done');
      if (!this.started) this.start();
    });
  }

  bind() {
    const stage = this.root.querySelector('.spin-stage');
    const listener = { signal: this.abort.signal };

    // Unified pointer drag (mouse + touch)
    stage.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastT = performance.now();
      this.velocity = 0;
      this.lastInteract = performance.now();
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('grabbing');
      this.hideHint();
    }, listener);
    stage.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const sample = e.getCoalescedEvents?.().at(-1) || e;
      const now = performance.now();
      const dx = sample.clientX - this.lastX;
      const dt = Math.max(1, now - this.lastT);
      // revx=1 : drag right -> spin forward (matches CarDekho)
      const d = dx / this.pixelsPerFrame;
      this.target += d;
      this.velocity = 0.7 * (d / dt * 16) + 0.3 * this.velocity; // per-frame velocity
      this.lastX = sample.clientX;
      this.lastT = now;
      this.lastInteract = now;
    }, listener);
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      stage.classList.remove('grabbing');
      this.lastInteract = performance.now();
      // velocity carries into inertia loop
    };
    stage.addEventListener('pointerup', end, listener);
    stage.addEventListener('pointercancel', end, listener);

    // Buttons
    this.root.querySelector('[data-spin="prev"]')?.addEventListener('click', () => { this.target -= 1; this.kick(); }, listener);
    this.root.querySelector('[data-spin="next"]')?.addEventListener('click', () => { this.target += 1; this.kick(); }, listener);
    this.root.querySelector('[data-spin="play"]')?.addEventListener('click', (e) => {
      this.setAutoPlay(!this.autoPlay);
      this.kick();
    }, listener);
    this.root.querySelector('[data-spin="fs"]')?.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen?.();
    }, listener);

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { this.target -= 1; this.kick(); }
      if (e.key === 'ArrowRight') { this.target += 1; this.kick(); }
    }, listener);

    // Prevent image drag ghost
    this.img.addEventListener('dragstart', (e) => e.preventDefault(), listener);
  }

  kick() { this.lastInteract = performance.now(); this.hideHint(); }
  hideHint() { this.hint?.classList.add('hide'); }

  setAutoPlay(playing) {
    this.autoPlay = Boolean(playing);
    const button = this.root.querySelector('[data-spin="play"]');
    if (button) {
      button.textContent = this.autoPlay ? 'Pause spin' : 'Auto spin';
      button.setAttribute('aria-pressed', String(this.autoPlay));
    }
  }

  focusSourceFrame(sourceIndex) {
    const source = ((Number(sourceIndex) % this.sourceFrames) + this.sourceFrames) % this.sourceFrames;
    const destination = Math.round(source / this.frameStep) % this.N;
    let delta = (destination - this.current) % this.N;
    if (delta > this.N / 2) delta -= this.N;
    if (delta < -this.N / 2) delta += this.N;
    this.velocity = 0;
    this.target = this.current + delta;
    this.setAutoPlay(false);
    this.kick();
    return destination;
  }

  preload() {
    const jobs = [];
    for (let i = 0; i < this.N; i++) {
      jobs.push(new Promise((res) => {
        const im = new Image();
        im.decoding = 'async';
        im.fetchPriority = i === 0 ? 'high' : 'auto';
        im.onload = () => { this.loaded++; this.progress(); res(); };
        im.onerror = () => { this.loaded++; this.progress(); res(); };
        im.src = this.frameUrl(i);
        this.frames[i] = im;
      }));
    }
    // Progressive: show first frame ASAP
    this.frames[0]?.decode?.().catch(() => {});
    return Promise.all(jobs);
  }

  progress() {
    const p = Math.round((this.loaded / this.N) * 100);
    if (this.loaderBar) this.loaderBar.style.width = p + '%';
    if (this.pct) this.pct.textContent = p + '%';
    // Show frame 0 as soon as it's ready for perceived speed
    if (this.shown === -1 && this.frames[0]?.complete) {
      this.draw(0);
      if (!this.started && !this.destroyed) this.start();
    }
  }

  start() {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.draw(0);
    this.shown = 0;
    this.raf = requestAnimationFrame(() => this.loop());
  }

  destroy() {
    this.destroyed = true;
    this.abort.abort();
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  draw(i) {
    const f = ((Math.round(i) % this.N) + this.N) % this.N;
    if (f === this.shown) return;
    if (!this.frames[f]?.complete || !this.frames[f]?.naturalWidth) return;
    this.shown = f;
    // Instant swap from preloaded cache = no flicker
    this.img.src = this.frames[f].src;
    if (this.count) this.count.textContent = `${f + 1} / ${this.N}`;
  }

  loop() {
    if (this.destroyed) return;
    const now = performance.now();

    // Inertia after release (mass simulation)
    if (!this.dragging && Math.abs(this.velocity) > 0.001) {
      this.target += this.velocity;
      this.velocity *= this.damping;
      this.lastInteract = now; // inertia counts as activity
    }

    // Auto-rotate after idle (like Object2VR automove, delay 3s)
    if (this.autoPlay && !this.dragging && now - this.lastInteract > this.autoDelay) {
      this.target += this.autoSpeed;
    }

    // Shortest-path lerp with wrap handling: keep current near target
    // Normalize delta to [-N/2, N/2] so it never spins the long way
    let delta = (this.target - this.current) % this.N;
    if (delta > this.N / 2) delta -= this.N;
    if (delta < -this.N / 2) delta += this.N;
    this.current += delta * this.lerp;

    // Snap when very close to save work
    if (Math.abs(delta) < 0.001) this.current = this.target - Math.round((this.target - this.current) / this.N) * this.N;

    this.draw(this.current);
    this.raf = requestAnimationFrame(() => this.loop());
  }
}

window.SpinViewer = SpinViewer;
