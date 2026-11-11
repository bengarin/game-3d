// Keyboard + mouse state. Uses physical key codes, so WASD also works as ZQSD on AZERTY keyboards.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared every frame
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.dragging = false;
    this.ignoreUntil = 0;

    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.pressed.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      // without pointer lock (denied / unsupported) fall back to drag-to-look
      if (performance.now() < this.ignoreUntil) return;
      const clamp = (v) => Math.max(-120, Math.min(120, v || 0));
      if (this.locked || this.dragging) { this.dx += clamp(e.movementX); this.dy += clamp(e.movementY); }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.ignoreUntil = performance.now() + 200; // browsers may fire one huge delta when the lock engages
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* drag-to-look fallback stays active */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  axis() {
    return {
      f: (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0),
      s: (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0),
    };
  }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
