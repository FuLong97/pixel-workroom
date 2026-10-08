// public/js/props-extra.js - More furniture so the room feels lived in (pixel art drawn with rectangles)
export function addExtraProps(assets) {
  const make = (id, W, H, draw) => {
    const { canvas, ctx } = assets.createCanvas(W, H);
    draw(ctx);
    assets.sprites[id] = canvas;
  };
  const R = (ctx, color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // tiny deterministic "random" so the pictures never change between loads
  const rnd = (i) => {
    const s = Math.sin(i * 91.7) * 10000;
    return s - Math.floor(s);
  };

  // Meeting table with a laptop, a mug and papers
  make('prop_table', 160, 56, (c) => {
    R(c, '#451a03', 14, 24, 9, 30);      // legs
    R(c, '#451a03', 137, 24, 9, 30);
    R(c, '#0f172a', 14, 52, 9, 3);
    R(c, '#0f172a', 137, 52, 9, 3);
    R(c, '#5a3a1e', 4, 18, 152, 7);      // front edge
    R(c, '#6b4423', 4, 17, 152, 2);
    R(c, '#8b5e34', 2, 7, 156, 11);      // tabletop (calm walnut, not bright orange)
    R(c, '#a9743f', 2, 7, 156, 2);       // light edge
    R(c, '#6b4423', 2, 15, 156, 3);
    // laptop
    R(c, '#0f172a', 36, 0, 28, 9);
    R(c, '#38bdf8', 38, 1, 24, 6);
    R(c, '#64748b', 32, 9, 36, 2);
    // mug and papers
    R(c, '#f8fafc', 104, 3, 7, 7);
    R(c, '#94a3b8', 111, 5, 2, 3);
    R(c, '#e2e8f0', 118, 8, 24, 3);
    R(c, '#cbd5e1', 120, 6, 22, 3);
  });

  // Office chair
  make('prop_chair', 32, 48, (c) => {
    R(c, '#1e3a8a', 5, 2, 22, 24);       // backrest shadow
    R(c, '#1d4ed8', 6, 3, 20, 22);
    R(c, '#3b82f6', 8, 5, 16, 3);
    R(c, '#1e3a8a', 3, 26, 26, 9);       // seat
    R(c, '#2563eb', 4, 26, 24, 6);
    R(c, '#334155', 14, 35, 4, 8);       // stem
    R(c, '#334155', 5, 43, 22, 3);       // base
    R(c, '#0f172a', 4, 45, 5, 3);
    R(c, '#0f172a', 23, 45, 5, 3);
    R(c, '#0f172a', 14, 45, 4, 3);
  });

  // Standing planning board with sticky notes
  make('prop_whiteboard', 80, 96, (c) => {
    R(c, '#94a3b8', 2, 4, 76, 58);
    R(c, '#f1f5f9', 5, 7, 70, 52);
    const notes = ['#fde047', '#fb7185', '#4ade80', '#38bdf8', '#fdba74', '#c084fc'];
    for (let i = 0; i < 9; i++) {
      R(c, notes[i % notes.length], 9 + (i % 3) * 22, 11 + Math.floor(i / 3) * 15, 14, 11);
    }
    R(c, '#64748b', 12, 53, 30, 2);      // scribbles
    R(c, '#64748b', 48, 53, 20, 2);
    R(c, '#64748b', 2, 62, 76, 4);       // marker tray
    R(c, '#ef4444', 10, 60, 6, 2);
    R(c, '#2563eb', 20, 60, 6, 2);
    R(c, '#475569', 14, 66, 5, 26);      // legs
    R(c, '#475569', 61, 66, 5, 26);
    R(c, '#0f172a', 8, 90, 17, 4);
    R(c, '#0f172a', 55, 90, 17, 4);
  });

  // Server rack with blinking lights
  make('prop_server', 40, 96, (c) => {
    R(c, '#0f172a', 2, 2, 36, 92);
    R(c, '#1e293b', 4, 4, 32, 88);
    for (let i = 0; i < 9; i++) {
      const y = 7 + i * 9;
      R(c, '#0f172a', 7, y, 26, 7);
      R(c, '#334155', 9, y + 5, 14, 1);
      const on = rnd(i + 3) > 0.35;
      R(c, on ? '#22c55e' : '#166534', 27, y + 2, 3, 3);
      R(c, rnd(i + 11) > 0.7 ? '#f59e0b' : '#1e293b', 30, y + 2, 2, 3);
    }
    R(c, '#0f172a', 6, 90, 6, 4);
    R(c, '#0f172a', 28, 90, 6, 4);
  });

  // Printer on a small stand
  make('prop_printer', 48, 40, (c) => {
    R(c, '#f8fafc', 11, 3, 26, 11);      // paper tray
    R(c, '#e2e8f0', 13, 5, 22, 3);
    R(c, '#cbd5e1', 3, 13, 42, 15);      // body
    R(c, '#e2e8f0', 3, 13, 42, 3);
    R(c, '#38bdf8', 34, 18, 8, 5);       // display
    R(c, '#0f172a', 9, 22, 20, 3);       // paper slot
    R(c, '#475569', 7, 28, 34, 3);       // stand
    R(c, '#334155', 9, 31, 4, 9);
    R(c, '#334155', 35, 31, 4, 9);
  });

  // Floor lamp
  make('prop_lamp', 24, 96, (c) => {
    R(c, '#fde68a', 5, 5, 14, 5);        // shade
    R(c, '#fbbf24', 3, 10, 18, 10);
    R(c, '#f59e0b', 3, 18, 18, 3);
    R(c, '#fff7ed', 7, 21, 10, 3);       // light
    R(c, '#94a3b8', 11, 24, 2, 66);      // pole
    R(c, '#475569', 5, 90, 14, 5);       // base
  });

  // Small potted plant for desks and shelves
  make('prop_plant_small', 32, 40, (c) => {
    R(c, '#14532d', 6, 8, 20, 14);
    R(c, '#16a34a', 4, 12, 24, 10);
    R(c, '#22c55e', 10, 4, 12, 12);
    R(c, '#4ade80', 13, 6, 6, 6);
    R(c, '#b45309', 8, 24, 16, 14);      // pot
    R(c, '#c2410c', 8, 24, 16, 4);
    R(c, '#7c2d12', 8, 34, 16, 4);
  });

  // Free-standing bookshelf
  make('prop_bookshelf', 56, 96, (c) => {
    R(c, '#78350f', 2, 2, 52, 92);
    R(c, '#451a03', 5, 5, 46, 86);
    const shelves = [5, 31, 58, 86];
    for (const y of shelves) R(c, '#92400e', 5, y, 46, 4);
    const colours = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#e2e8f0', '#14b8a6'];
    for (let row = 0; row < 3; row++) {
      let x = 7;
      let i = 0;
      while (x < 46) {
        const w = 3 + Math.floor(rnd(row * 20 + i) * 4);
        const h = 16 + Math.floor(rnd(row * 30 + i + 5) * 8);
        R(c, colours[Math.floor(rnd(row * 7 + i * 3) * colours.length)], x, shelves[row] + 4 + (22 - h), w, h);
        x += w + 1;
        i++;
      }
    }
  });

  // Filing cabinet
  make('prop_cabinet', 40, 64, (c) => {
    R(c, '#475569', 3, 3, 34, 59);
    R(c, '#64748b', 4, 4, 32, 57);
    for (let i = 0; i < 3; i++) {
      R(c, '#94a3b8', 7, 8 + i * 18, 26, 15);
      R(c, '#cbd5e1', 7, 8 + i * 18, 26, 2);
      R(c, '#1e293b', 16, 14 + i * 18, 8, 3);
    }
    R(c, '#0f172a', 5, 60, 6, 3);
    R(c, '#0f172a', 29, 60, 6, 3);
  });

  // Low coffee table for the lounge
  make('prop_coffee_table', 72, 32, (c) => {
    R(c, '#b45309', 2, 6, 68, 8);
    R(c, '#d97706', 2, 6, 68, 2);
    R(c, '#78350f', 2, 14, 68, 4);
    R(c, '#451a03', 8, 18, 5, 12);
    R(c, '#451a03', 59, 18, 5, 12);
    R(c, '#f8fafc', 18, 1, 7, 6);        // mugs
    R(c, '#f8fafc', 28, 2, 6, 5);
    R(c, '#ef4444', 42, 4, 18, 3);       // magazine
    R(c, '#fde047', 44, 3, 12, 2);
  });
}
