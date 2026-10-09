// The floor renderer's speed-ups must not change a single pixel, and the touch controls must be wired up
import './setup.mjs';
import assert from 'assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = (p) => path.join(here, '..', 'public', p);
const read = (p) => fs.readFileSync(pub(p), 'utf8');

const { FloorCeilingRenderer, nearestLamp, lightAt, setLightLevel } = await import(pathToUrl(pub('js/fx.js')));
function pathToUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }

// a tiny stand-in for the engine: the renderer only needs a canvas context that can make image data
const makeEngine = (w, h, rugs = []) => ({
  width: w, height: h,
  ctx: { createImageData: (iw, ih) => ({ width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) }), putImageData() {} },
  player: { x: 11, y: 5, dirX: 0, dirY: 1, planeX: 0.66, planeY: 0 },
  sprites: [], state: { agents: {} }, decorRugs: rugs
});

console.log('▶ lightAt gives exactly what the lamp-distance formula says (the per-pixel shortcut changed nothing)');
setLightLevel(1);
let checked = 0;
for (let x = 0; x <= 24; x += 0.37) {
  for (let y = 0; y <= 25; y += 0.41) {
    const want = (0.62 + 1.1 / (1 + nearestLamp(x, y).d2 * 0.1)) * 1;
    assert.strictEqual(lightAt(x, y), want, `at ${x.toFixed(2)},${y.toFixed(2)}`);
    checked++;
  }
}
setLightLevel(0.38);
assert.strictEqual(lightAt(5, 7), (0.62 + 1.1) * 0.38, 'dimmed lights scale it');
setLightLevel(1);
console.log(`  ✓ ${checked} points`);

console.log('▶ Skipping rugs a floor row cannot touch finds exactly the same rug for every pixel');
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
let rows = 0, hits = 0;
for (let round = 0; round < 40; round++) {
  const rugs = Array.from({ length: 2 + Math.floor(rnd() * 12) }, () => ({
    x: 2 + rnd() * 20, y: 2 + rnd() * 21, hw: 0.8 + rnd() * 2.5, hh: 0.6 + rnd() * 2, edge: [1, 2, 3], fill: [4, 5, 6]
  }));
  const r = new FloorCeilingRenderer(makeEngine(64, 40));
  r.rugs = rugs;
  for (let k = 0; k < 60; k++) {
    // a row of the floor: a straight line of 'w' steps, like the real loop walks along it
    const w = 640, x0 = rnd() * 24, y0 = rnd() * 25, sx = (rnd() - 0.5) * 0.06, sy = (rnd() - 0.5) * 0.06;
    const onRow = r.rugsOnRow(x0, y0, x0 + sx * w, y0 + sy * w);
    let fx = x0, fy = y0;
    for (let i = 0; i < w; i++, fx += sx, fy += sy) {
      const full = r.rugAt(fx, fy);
      assert.strictEqual(r.rugAt(fx, fy, onRow), full, 'a rug was skipped that covers this pixel');
      if (full) hits++;
    }
    rows++;
  }
}
assert(hits > 1000, 'the test really exercises rugs (' + hits + ' pixels on a rug)');
console.log(`  ✓ ${rows} rows, ${hits} pixels on a rug`);

console.log('▶ A whole frame is drawn: every pixel opaque, deterministic, and it follows the camera');
Object.defineProperty(globalThis.performance, 'now', { value: () => 5000, configurable: true, writable: true });   // the lamp flicker depends on time
const eng = makeEngine(160, 100, [{ x: 11, y: 8, hw: 2, hh: 1.5, edge: [90, 20, 20], fill: [60, 10, 10] }]);
const fr = new FloorCeilingRenderer(eng);
fr.render();
const first = Uint32Array.from(fr.buf);
assert(first.every((p) => (p >>> 24) === 255), 'every pixel is opaque');
assert(new Set(first).size > 500, 'a textured picture, not a flat colour');
fr.render();
assert.deepStrictEqual(Uint32Array.from(fr.buf), first, 'the same camera draws the same picture');
eng.player.x = 18; eng.player.y = 14; eng.player.dirX = -1; eng.player.dirY = 0; eng.player.planeX = 0; eng.player.planeY = 0.66;
fr.render();
assert.notDeepStrictEqual(Uint32Array.from(fr.buf), first, 'moving the camera changes the picture');
console.log('  ✓ ' + new Set(first).size + ' distinct colours');

console.log('▶ Every script of the page still parses');
for (const f of fs.readdirSync(pub('js')).filter((n) => n.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', pub('js/' + f)], { stdio: 'pipe' });
}
console.log('  ✓');

console.log('▶ Touch controls: a stick for walking, a drag to look, a USE button, wired into the page');
const touch = read('js/touch-controls.js');
const engine = read('js/engine3d.js');
const app = read('js/app.js');
const html = read('index.html');
const css = read('css/style.css');
assert(app.includes("import { TouchControls } from './touch-controls.js'") && /new TouchControls\(this\.engine/.test(app), 'the app creates it');
for (const word of ['pointerdown', 'pointermove', 'pointercancel', 'setPointerCapture', 'engine.analog', 'triggerInteraction', 'workroom:viewmode', 'visibilitychange']) assert(touch.includes(word), `touch-controls.js uses ${word}`);
assert(/this\.analog = \{ x: 0, y: 0 \}/.test(engine) && /const \{ x: sx, y: sy \} = this\.analog/.test(engine), 'the engine walks by the stick');
assert(engine.includes("e.pointerType !== 'touch'") && engine.includes('lookId') && !engine.includes("addEventListener('touchstart'"), 'looking uses one finger id, not touches[0]');
assert(/#render-canvas \{ touch-action: none; \}/.test(css) && css.includes('#touch-stick') && css.includes('#touch-use'), 'the page does not scroll or zoom under the fingers');
assert(!html.includes('Virtual D-Pad') && !html.includes("engine.keys['w']=true"), 'the old tap-to-nudge buttons are gone');
assert(app.includes('watchFrameCost') && app.includes('resPinned'), 'slow devices step the picture size down by themselves');
console.log('  ✓');

console.log('\n🎉 RENDER TESTS PASSED');
process.exit(0);
