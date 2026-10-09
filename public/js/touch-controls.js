// public/js/touch-controls.js - walking stick and USE button, so the room can be explored on a touch screen.
// Looking around is a drag on the picture itself (see bindEvents in engine3d.js).
// Shown on phones and tablets right away, and on a laptop with a touch screen after the first touch.
// ?touch=1 forces it on, ?touch=0 keeps it off.

const RADIUS = 52;      // how far the knob can travel from the middle of the stick, in pixels
const DEAD_ZONE = 0.14; // tiny movements near the middle do not count, so the player does not creep

export class TouchControls {
  constructor(engine, host) {
    this.engine = engine;
    this.host = host;
    this.pointer = null;
    this.visible = false;
    this.nearShown = false;

    const forced = new URLSearchParams(location.search).get('touch');
    if (forced === '0') return;

    this.root = document.createElement('div');
    this.root.id = 'touch-ui';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div id="touch-stick" aria-label="Walk"><div id="touch-knob"></div></div>
      <button id="touch-use" type="button" hidden>USE</button>`;
    host.appendChild(this.root);
    this.stick = this.root.querySelector('#touch-stick');
    this.knob = this.root.querySelector('#touch-knob');
    this.useBtn = this.root.querySelector('#touch-use');

    this.bindStick();
    this.useBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); engine.triggerInteraction(); });
    engine.onNear = (item) => this.showUse(!!item);

    // the stick belongs to the first-person view; the top view works by tapping the floor
    window.addEventListener('workroom:viewmode', () => this.sync());
    // never leave the player walking when the page goes into the background
    window.addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); });

    if (forced === '1' || window.matchMedia?.('(pointer: coarse)').matches) this.show();
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.show(); }, { passive: true });
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.engine.touchMode = true;
    document.body.classList.add('touch');
    this.sync();
  }

  sync() {
    if (!this.root) return;
    this.root.hidden = !this.visible || this.engine.viewMode === 'top';
    if (this.root.hidden) this.release();
  }

  showUse(on) {
    if (!this.useBtn || on === this.nearShown) return;
    this.nearShown = on;
    this.useBtn.hidden = !on;
  }

  bindStick() {
    const s = this.stick;
    s.addEventListener('pointerdown', (e) => {
      if (this.pointer !== null) return;
      e.preventDefault();
      this.pointer = e.pointerId;
      s.setPointerCapture?.(e.pointerId);
      this.drag(e);
    });
    s.addEventListener('pointermove', (e) => { if (e.pointerId === this.pointer) this.drag(e); });
    const end = (e) => { if (e.pointerId === this.pointer) this.release(); };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('lostpointercapture', end);
  }

  // Finger position -> knob position and walking direction
  drag(e) {
    const rect = this.stick.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const x = dx / RADIUS, y = -dy / RADIUS;
    const strength = Math.hypot(x, y);
    this.engine.analog.x = strength < DEAD_ZONE ? 0 : x;
    this.engine.analog.y = strength < DEAD_ZONE ? 0 : y;
  }

  release() {
    this.pointer = null;
    this.engine.analog.x = 0;
    this.engine.analog.y = 0;
    if (this.knob) this.knob.style.transform = '';
  }
}
