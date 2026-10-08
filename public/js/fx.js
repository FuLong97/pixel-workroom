// public/js/fx.js - Lighting, textured floor/ceiling, glow and vignette for the raycaster

// Ceiling lamps on a regular grid (world units). Used for floor, wall and ceiling lighting.
const LAMP_X = [5, 11, 17];
const LAMP_Y = [7, 13, 19];
const BREAK_LAMPS = [[21, 6], [21, 12], [21, 18]];

const snap = (v, o, max) => Math.min(max, Math.max(o, Math.round((v - o) / 6) * 6 + o));

export function nearestLamp(x, y) {
  let lx = snap(x, 5, 17), ly = snap(y, 7, 19);
  let d2 = (lx - x) ** 2 + (ly - y) ** 2;
  if (x > 18.5) {
    const by = Math.min(18, Math.max(6, Math.round((y - 6) / 6) * 6 + 6));
    const d = (21 - x) ** 2 + (by - y) ** 2;
    if (d < d2) { d2 = d; lx = 21; ly = by; }
  }
  return { lx, ly, d2 };
}

// The floor lamps switch the room lights: 1 = on, lower = dim
let lightLevel = 1;
export const setLightLevel = (v) => { lightLevel = v; };

// 0..~1.3 light level at a world position (soft pool under each lamp + dim ambient)
export function lightAt(x, y) {
  const { d2 } = nearestLamp(x, y);
  return (0.62 + 1.1 / (1 + d2 * 0.1)) * lightLevel;
}

const pack = (r, g, b) => (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class FloorCeilingRenderer {
  constructor(engine) {
    this.engine = engine;
    this.size = 64;
    this.floorTex = this.makeFloorTexture();
    this.woodTex = this.makeWoodTexture();
    this.ceilTex = this.makeCeilingTexture();
    this.resize(engine.width, engine.height);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.image = this.engine.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.image.data.buffer);
  }

  noise(i) {
    const s = Math.sin(i * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  makeFloorTexture() {
    const S = this.size, t = new Uint32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const tx = x % 32, ty = y % 32;
        const alt = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
        let base = alt ? [62, 78, 112] : [48, 62, 94];
        const n = (this.noise(x * 31 + y * 17) - 0.5) * 8;
        let [r, g, b] = base.map((v) => v + n);
        if (tx === 0 || ty === 0) { r *= 0.55; g *= 0.55; b *= 0.6; }              // grout
        else if (tx === 1 || ty === 1) { r += 12; g += 14; b += 20; }                // polished edge highlight
        t[y * S + x] = pack(r, g, b);
      }
    }
    return t;
  }

  makeWoodTexture() {
    const S = this.size, t = new Uint32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const plank = Math.floor(y / 16);
        const grain = Math.sin((x + plank * 23) * 0.35) * 5 + (this.noise(plank * 7 + Math.floor(x / 5)) - 0.5) * 14;
        let r = 92 + grain, g = 62 + grain * 0.7, b = 40 + grain * 0.5;
        if (y % 16 === 0) { r *= 0.5; g *= 0.5; b *= 0.5; }
        if ((x + plank * 29) % 64 === 0) { r *= 0.6; g *= 0.6; b *= 0.6; }
        t[y * S + x] = pack(r, g, b);
      }
    }
    return t;
  }

  makeCeilingTexture() {
    const S = this.size, t = new Uint32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = 46 + (this.noise(x * 13 + y * 29) - 0.5) * 6;
        if (x % 32 === 0 || y % 32 === 0) v = 22;
        t[y * S + x] = pack(v * 0.9, v, v * 1.2);
      }
    }
    return t;
  }

  // Area rugs under each desk, tinted with the agent colour (rebuilt once per frame)
  buildRugs() {
    this.rugs = [];
    for (const s of this.engine.sprites) {
      if (s.type !== 'agent') continue;
      const c = hexToRgb(this.engine.state.agents?.[s.agentId]?.color || '#64748b');
      this.rugs.push({
        x: s.x, y: s.y, hw: 2.1, hh: 1.5,
        edge: [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55],
        fill: [c[0] * 0.28 + 14, c[1] * 0.28 + 14, c[2] * 0.28 + 16]
      });
    }
    // rugs of the room itself (meeting corner, lounge, entrance, reading spot)
    for (const r of this.engine.decorRugs || []) this.rugs.push(r);
  }

  rugAt(fx, fy) {
    for (const r of this.rugs) {
      const dx = fx - r.x, dy = fy - r.y;
      if (dx > -r.hw && dx < r.hw && dy > -r.hh && dy < r.hh) {
        // a darker, brighter band around the edge makes it look like a real rug
        return Math.abs(dx) > r.hw - 0.25 || Math.abs(dy) > r.hh - 0.25 ? r.edge : r.fill;
      }
    }
    return null;
  }

  render() {
    this.buildRugs();
    const { engine, w, h, buf, size } = this;
    const p = engine.player;
    const rx0 = p.dirX - p.planeX, ry0 = p.dirY - p.planeY;
    const rx1 = p.dirX + p.planeX, ry1 = p.dirY + p.planeY;
    const horizon = h >> 1;
    const mask = size - 1;
    const t = performance.now() / 1000;
    const flicker = 1 + Math.sin(t * 9) * 0.01;

    for (let y = 0; y < h; y++) {
      const isFloor = y > horizon;
      const rowOffset = y - horizon;
      if (rowOffset === 0) {
        buf.fill(pack(10, 13, 20), y * w, (y + 1) * w);
        continue;
      }
      const rowDist = (0.5 * h) / Math.abs(rowOffset);
      const stepX = (rowDist * (rx1 - rx0)) / w;
      const stepY = (rowDist * (ry1 - ry0)) / w;
      let fx = p.x + rowDist * rx0;
      let fy = p.y + rowDist * ry0;
      const fog = Math.max(0.12, 1 - rowDist * 0.03);
      const row = y * w;

      for (let x = 0; x < w; x++, fx += stepX, fy += stepY) {
        const cellX = Math.floor(fx), cellY = Math.floor(fy);
        const u = Math.floor((fx - cellX) * size) & mask;
        const v = Math.floor((fy - cellY) * size) & mask;
        const light = lightAt(fx, fy) * flicker;

        if (isFloor) {
          const breakroom = fx > 19.2;
          const tex = breakroom ? this.woodTex : this.floorTex;
          const c = tex[v * size + u];
          let r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
          const rug = this.rugAt(fx, fy);
          if (rug) { r = rug[0] + (r - 30) * 0.2; g = rug[1] + (g - 37) * 0.2; b = rug[2] + (b - 54) * 0.2; }
          // warm lamp light on top of cool ambient, fogged into the dark
          const k = light * fog;
          // sheen: glossy highlight inside each lamp pool
          const sheen = Math.max(0, light - 1.15) * 55 * fog;
          // cool daylight spilling in from the window wall on the left
          const wg = fx < 7 ? (1 - fx / 7) * fog : 0;
          buf[row + x] = pack(r * k * 1.05 + sheen + wg * 6, g * k + sheen * 0.92 + wg * 20, b * k * 0.98 + sheen * 0.7 + wg * 46);
        } else {
          const c = this.ceilTex[v * size + u];
          const { d2 } = nearestLamp(fx, fy);
          const k = (0.55 + light * 0.5) * fog;
          let r = (c & 255) * k, g = ((c >> 8) & 255) * k, b = ((c >> 16) & 255) * k;
          if (d2 < 0.75) {
            // soft-edged glowing lamp panel with a thin frame
            const a = Math.min(1, (0.75 - d2) / 0.25);
            const glow = 255 * flicker * Math.max(0.12, lightLevel);   // lamp panels go dark with the lights
            r += (glow - r) * a; g += (glow * 0.95 - g) * a; b += (glow * 0.82 - b) * a;
          } else if (d2 < 0.95) {
            r *= 0.45; g *= 0.45; b *= 0.5;
          }
          buf[row + x] = pack(r, g, b);
        }
      }
    }
    engine.ctx.putImageData(this.image, 0, 0);
  }
}

// Post effects drawn after the scene
export class PostFX {
  constructor(engine) {
    this.engine = engine;
    this.resize(engine.width, engine.height);
  }

  resize(w, h) {
    this.small = document.createElement('canvas');
    this.small.width = Math.max(16, w >> 2);
    this.small.height = Math.max(10, h >> 2);
    this.sctx = this.small.getContext('2d');
    this.vignette = document.createElement('canvas');
    this.vignette.width = w;
    this.vignette.height = h;
    const v = this.vignette.getContext('2d');
    const g = v.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
    g.addColorStop(0, 'rgba(4,6,12,0)');
    g.addColorStop(1, 'rgba(6,4,18,0.5)');
    v.fillStyle = g;
    v.fillRect(0, 0, w, h);
  }

  apply() {
    const { ctx, canvas, width, height } = this.engine;
    // Cheap bloom: shrink, then add the blurred copy back on top
    this.sctx.imageSmoothingEnabled = true;
    this.sctx.drawImage(canvas, 0, 0, this.small.width, this.small.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4;
    ctx.drawImage(this.small, 0, 0, width, height);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.vignette, 0, 0);
  }
}
