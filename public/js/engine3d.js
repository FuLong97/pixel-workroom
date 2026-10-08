// public/js/engine3d.js - High-Definition First-Person 3D Pixel Raycaster Engine
import { audioSynth } from './audio.js';
import { FloorCeilingRenderer, PostFX, lightAt } from './fx.js';

export class Workroom3DEngine {
  constructor(canvas, assetManager, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.assets = assetManager;
    this.state = state;

    // Upgraded internal resolution (crisp pixel 640x400 by default!)
    this.resolutionMode = 'crisp';
    this.setResolution('crisp');

    // Player Camera
    this.player = {
      x: 10.0,
      y: 5.5,
      dirX: 0,
      dirY: 1, // Facing +Y (into the room)
      planeX: 0.66,
      planeY: 0,
      moveSpeed: 3.5,
      rotSpeed: 3.0
    };

    // Rich Office Map:
    // 0 = Floor
    // 1 = Office Tech Wall
    // 2 = Panoramic Window Wall
    // 3 = Whiteboard Wall
    // 4 = Datacenter Server Wall
    // 5 = Mahogany Bookshelf Wall
    // 6 = Retro Tech Poster Wall
    this.map = [
      [1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 1, 1]
    ];

    this.mapWidth = 24;
    this.mapHeight = 25;

    // Rich Office Props and Agent Sprites
    this.sprites = [];
    this.setupOfficeAssets();

    // Interaction target
    this.nearInteractable = null;

    // Visual Flags
    this.showScanlines = true;
    this.showMinimap = true;
    this.viewMode = 'fpv'; // 'fpv' | 'top'
    this.hover = null;
    this.topLayout = null;

    this.keys = {};
    this.bindEvents();
  }

  setResolution(mode) {
    this.resolutionMode = mode;
    if (mode === 'retro') {
      this.width = 320;
      this.height = 200;
    } else if (mode === 'hd') {
      this.width = 960;
      this.height = 600;
    } else {
      // 'crisp' (default)
      this.width = 640;
      this.height = 400;
    }

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.zBuffer = new Float32Array(this.width);
    this.ctx.imageSmoothingEnabled = false;
    if (this.floorFx) {
      this.floorFx.resize(this.width, this.height);
      this.post.resize(this.width, this.height);
    }
  }

  setupOfficeAssets() {
    this.sprites = [
      // Autonomous Agents at Workstations
      { id: 'alice', type: 'agent', agentId: 'alice', x: 5.0, y: 9.0, spriteId: 'agent_alice' },
      { id: 'bob', type: 'agent', agentId: 'bob', x: 5.0, y: 15.0, spriteId: 'agent_bob' },
      { id: 'charlie', type: 'agent', agentId: 'charlie', x: 17.0, y: 9.0, spriteId: 'agent_charlie' },
      { id: 'diana', type: 'agent', agentId: 'diana', x: 17.0, y: 15.0, spriteId: 'agent_diana' },
      { id: 'echo', type: 'agent', agentId: 'echo', x: 11.0, y: 20.0, spriteId: 'agent_echo' },

      // Breakroom / Lounge Zone
      { id: 'arcade', type: 'arcade', title: 'Antigravity Arcade', x: 21.0, y: 12.0, spriteId: 'prop_arcade' },
      { id: 'vending', type: 'vending', title: 'Soda & Snack Machine', x: 21.0, y: 16.0, spriteId: 'prop_vending' },
      { id: 'coffee_bar', type: 'coffee_bar', title: 'Espresso Coffee Bar', x: 21.0, y: 8.0, spriteId: 'prop_coffee_bar' },
      { id: 'couch1', type: 'couch', title: 'Leather Lounge Sofa', x: 20.5, y: 4.5, spriteId: 'prop_couch' },

      // Plants & Amenities
      { id: 'ficus1', type: 'prop', title: 'Ficus Tree', x: 2.0, y: 3.0, spriteId: 'prop_ficus' },
      { id: 'ficus2', type: 'prop', title: 'Ficus Tree', x: 21.0, y: 2.5, spriteId: 'prop_ficus' },
      { id: 'ficus3', type: 'prop', title: 'Ficus Tree', x: 2.0, y: 22.0, spriteId: 'prop_ficus' },
      { id: 'cooler', type: 'prop', title: 'Water Cooler', x: 21.0, y: 21.0, spriteId: 'prop_cooler' },
      { id: 'bin1', type: 'prop', title: 'Recycling Bin', x: 3.5, y: 9.5, spriteId: 'prop_bin' },
      { id: 'bin2', type: 'prop', title: 'Recycling Bin', x: 18.5, y: 9.5, spriteId: 'prop_bin' }
    ];
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.keys[e.key.toLowerCase()] = true;

      if (e.key === 'e' || e.key === 'E') {
        this.triggerInteraction();
      }
      if (e.key === 'c' || e.key === 'C') {
        this.showScanlines = !this.showScanlines;
      }
      if (e.key === 'v' || e.key === 'V') {
        this.setViewMode(this.viewMode === 'top' ? 'fpv' : 'top');
      }
      if (e.key === 'm' || e.key === 'M') {
        this.showMinimap = !this.showMinimap;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse drag
    let isDragging = false;
    let lastMouseX = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.viewMode === 'top') return;
      isDragging = true;
      lastMouseX = e.clientX;
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.viewMode === 'top') this.hover = this.pickTop(e);
    });
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; });
    this.canvas.addEventListener('click', (e) => {
      if (this.viewMode !== 'top') return;
      const hit = this.pickTop(e);
      if (!hit) return;
      if (hit.kind === 'sprite') {
        if (hit.sprite.type === 'agent') {
          window.workroomApp?.openMonitorCockpit(hit.sprite.agentId);
          audioSynth.playBleep();
        } else {
          this.nearInteractable = hit.sprite;
          this.triggerInteraction();
        }
      } else if (!this.isSolid(hit.x, hit.y)) {
        // Teleport the player to the clicked floor tile, keeping their heading
        this.player.x = hit.x;
        this.player.y = hit.y;
      }
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      this.rotate(-deltaX * 0.005);
    });

    // Touch
    let lastTouchX = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) lastTouchX = e.touches[0].clientX;
    });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const deltaX = e.touches[0].clientX - lastTouchX;
        lastTouchX = e.touches[0].clientX;
        this.rotate(-deltaX * 0.006);
      }
    });
  }

  rotate(angle) {
    const oldDirX = this.player.dirX;
    this.player.dirX = this.player.dirX * Math.cos(angle) - this.player.dirY * Math.sin(angle);
    this.player.dirY = oldDirX * Math.sin(angle) + this.player.dirY * Math.cos(angle);

    const oldPlaneX = this.player.planeX;
    this.player.planeX = this.player.planeX * Math.cos(angle) - this.player.planeY * Math.sin(angle);
    this.player.planeY = oldPlaneX * Math.sin(angle) + this.player.planeY * Math.cos(angle);
  }

  update(dt) {
    // Rotation keys
    const rotSpeed = this.player.rotSpeed * dt;
    if (this.keys['arrowleft'] || this.keys['q']) {
      this.rotate(rotSpeed);
    }
    if (this.keys['arrowright']) {
      this.rotate(-rotSpeed);
    }

    // Movement (WASD)
    const moveSpeed = this.player.moveSpeed * dt;
    let dx = 0;
    let dy = 0;

    if (this.keys['w'] || this.keys['arrowup']) {
      dx += this.player.dirX * moveSpeed;
      dy += this.player.dirY * moveSpeed;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      dx -= this.player.dirX * moveSpeed;
      dy -= this.player.dirY * moveSpeed;
    }
    if (this.keys['a']) {
      dx -= this.player.planeX * moveSpeed;
      dy -= this.player.planeY * moveSpeed;
    }
    if (this.keys['d']) {
      dx += this.player.planeX * moveSpeed;
      dy += this.player.planeY * moveSpeed;
    }

    // Collision detection
    if (dx !== 0 || dy !== 0) {
      const margin = 0.38;
      const newX = this.player.x + dx;
      const newY = this.player.y + dy;

      if (!this.isSolid(newX + Math.sign(dx) * margin, this.player.y)) {
        this.player.x = newX;
      }
      if (!this.isSolid(this.player.x, newY + Math.sign(dy) * margin)) {
        this.player.y = newY;
      }
    }

    this.checkProximity();
  }

  isSolid(x, y) {
    const mapX = Math.floor(x);
    const mapY = Math.floor(y);
    if (mapX < 0 || mapX >= this.mapWidth || mapY < 0 || mapY >= this.mapHeight) return true;
    return this.map[mapY][mapX] > 0;
  }

  checkProximity() {
    let closest = null;
    let minDist = 2.6;

    for (const s of this.sprites) {
      const dist = Math.hypot(this.player.x - s.x, this.player.y - s.y);
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }

    this.nearInteractable = closest;
  }

  triggerInteraction() {
    if (!this.nearInteractable) return;
    const item = this.nearInteractable;

    if (item.type === 'agent') {
      window.workroomApp?.openMonitorCockpit(item.agentId);
      audioSynth.playBleep();
    } else if (item.type === 'coffee_bar') {
      // Boost coffee and energy for all agents!
      Object.values(this.state.agents).forEach(a => {
        a.coffeeCups++;
        a.energy = Math.min(100, a.energy + 10);
      });
      window.workroomApp?.sendWebSocketAction({
        type: 'broadcast',
        text: '☕ Fresh batch of artisan espresso brewed at the coffee bar! Energy replenished.',
        sender: 'player'
      });
      audioSynth.playChime();
    } else if (item.type === 'arcade') {
      audioSynth.playChime();
      window.workroomApp?.sendWebSocketAction({
        type: 'broadcast',
        text: '👾 Arcade high score broken on Antigravity Quest! Score: 99,990 pts!',
        sender: 'player'
      });
    } else if (item.type === 'vending') {
      audioSynth.playBleep();
      window.workroomApp?.sendWebSocketAction({
        type: 'broadcast',
        text: '🥤 Grabbed chilled Quantum Cola from the breakroom vending machine.',
        sender: 'player'
      });
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.hover = null;
    const btn = document.getElementById('btn-view-toggle');
    if (btn) btn.textContent = mode === 'top' ? '🚶 First-Person [V]' : '🗺️ Top View [V]';
  }

  // Map a mouse event to a sprite or floor tile in the top-down view
  pickTop(e) {
    const L = this.topLayout;
    if (!L) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * this.width;
    const py = ((e.clientY - rect.top) / rect.height) * this.height;
    const wx = (px - L.ox) / L.tile;
    const wy = (py - L.oy) / L.tile;
    if (wx < 0 || wy < 0 || wx >= this.mapWidth || wy >= this.mapHeight) return null;

    let best = null;
    let bestD = 0.9;
    for (const s of this.sprites) {
      const pos = this.spriteTopPos(s);
      const d = Math.hypot(pos.x - wx, pos.y - wy);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) return { kind: 'sprite', sprite: best, x: wx, y: wy };
    return { kind: 'floor', x: wx, y: wy };
  }

  // Agents move in shared state; use their live position when available
  spriteTopPos(s) {
    if (s.type === 'agent') {
      const a = this.state.agents?.[s.agentId];
      if (a) return { x: a.pos.x, y: a.pos.z };
    }
    return { x: s.x, y: s.y };
  }

  drawHealthBar(x, y, w, h, pct) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(100, pct)) / 100, h);
  }

  renderTopDown() {
    const { ctx, width, height } = this;
    const tile = Math.floor(Math.min(width / this.mapWidth, height / this.mapHeight));
    const ox = Math.floor((width - tile * this.mapWidth) / 2);
    const oy = Math.floor((height - tile * this.mapHeight) / 2);
    this.topLayout = { tile, ox, oy };
    const t = performance.now() / 1000;

    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, width, height);

    // Floor checkerboard + walls
    const wallColors = { 1: '#475569', 2: '#38bdf8', 3: '#e2e8f0', 4: '#10b981', 5: '#854d0e', 6: '#a855f7' };
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const v = this.map[y][x];
        const sx = ox + x * tile;
        const sy = oy + y * tile;
        if (v === 0) {
          const alt = (x + y) % 2;
          ctx.fillStyle = x > 19 ? (alt ? '#5a3d26' : '#4f3421') : alt ? '#2a3550' : '#222c44';
          ctx.fillRect(sx, sy, tile, tile);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(sx, sy, tile, 1);
          ctx.fillRect(sx, sy, 1, tile);
        } else {
          ctx.fillStyle = wallColors[v] || '#475569';
          ctx.fillRect(sx, sy, tile, tile);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(sx, sy, tile, Math.max(1, tile >> 3));
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(sx, sy + tile - Math.max(1, tile >> 3), tile, Math.max(1, tile >> 3));
        }
      }
    }

    // Warm light pools under the ceiling lamps
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lx of [5, 11, 17]) {
      for (const ly of [7, 13, 19]) {
        const g = ctx.createRadialGradient(ox + lx * tile, oy + ly * tile, 0, ox + lx * tile, oy + ly * tile, tile * 5);
        g.addColorStop(0, 'rgba(255,214,150,0.22)');
        g.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(ox + (lx - 5) * tile, oy + (ly - 5) * tile, tile * 10, tile * 10);
      }
    }
    ctx.restore();

    // Soft drop shadows under props
    for (const s of this.sprites) {
      const pos = this.spriteTopPos(s);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(ox + pos.x * tile + tile * 0.15, oy + pos.y * tile + tile * 0.5, tile * 0.9, tile * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Desk rugs under each agent
    for (const s of this.sprites) {
      if (s.type !== 'agent') continue;
      const a = this.state.agents?.[s.agentId];
      const pos = this.spriteTopPos(s);
      ctx.fillStyle = (a?.color || '#94a3b8') + '33';
      ctx.fillRect(ox + (pos.x - 1.5) * tile, oy + (pos.y - 1) * tile, tile * 3, tile * 2);
    }

    // Props & agents
    for (const s of this.sprites) {
      const pos = this.spriteTopPos(s);
      const cx = ox + pos.x * tile;
      const cy = oy + pos.y * tile;
      const img = this.assets.getSprite(s.spriteId);
      const size = tile * 1.8;
      if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);

      if (s.type === 'agent') {
        const a = this.state.agents?.[s.agentId];
        const color = a?.color || '#f43f5e';
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, tile * 0.95, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (a) {
          ctx.font = `bold ${Math.max(8, tile * 0.6)}px monospace`;
          ctx.textAlign = 'center';
          const label = `${a.name} · ${a.state}`;
          const w = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(15,23,42,0.9)';
          ctx.fillRect(cx - w / 2 - 3, cy - tile * 1.9, w + 6, tile * 0.85);
          ctx.fillStyle = color;
          ctx.fillText(label, cx, cy - tile * 1.9 + tile * 0.62);
          this.drawHealthBar(cx - tile, cy - tile * 1.05, tile * 2, Math.max(3, tile * 0.22), a.energy);
        }
      }
    }

    // Player: FOV cone + marker
    const px = ox + this.player.x * tile;
    const py = oy + this.player.y * tile;
    const ang = Math.atan2(this.player.dirY, this.player.dirX);
    const fov = Math.atan2(Math.hypot(this.player.planeX, this.player.planeY), 1);
    ctx.fillStyle = 'rgba(250,250,250,0.14)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, tile * 6, ang - fov, ang + fov);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, tile * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + this.player.dirX * tile, py + this.player.dirY * tile);
    ctx.stroke();

    // Hover tooltip
    if (this.hover?.kind === 'sprite') {
      const s = this.hover.sprite;
      const a = s.type === 'agent' ? this.state.agents?.[s.agentId] : null;
      const text = a ? `${a.name} — ${a.status}  [click: open monitor]` : `${s.title || s.type}  [click: interact]`;
      ctx.font = `bold ${Math.max(9, tile * 0.6)}px monospace`;
      ctx.textAlign = 'left';
      const w = ctx.measureText(text).width + 10;
      const pos = this.spriteTopPos(s);
      const bx = Math.min(width - w - 2, Math.max(2, ox + pos.x * tile - w / 2));
      const by = oy + pos.y * tile + tile * 1.2;
      ctx.fillStyle = 'rgba(15,23,42,0.95)';
      ctx.fillRect(bx, by, w, tile);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(bx, by, w, tile);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(text, bx + 5, by + tile * 0.72);
    }

    this.post?.vignette && ctx.drawImage(this.post.vignette, 0, 0);

    // Title
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('TOP VIEW — click floor to move, click agent for monitor', 6, 12);

    if (this.showScanlines) this.renderScanlines();
  }

  render() {
    if (this.viewMode === 'top') {
      this.renderTopDown();
      return;
    }
    const { ctx, width, height } = this;

    // 1. Textured, lamp-lit ceiling & floor
    if (!this.floorFx) {
      this.floorFx = new FloorCeilingRenderer(this);
      this.post = new PostFX(this);
    }
    this.floorFx.render();

    // 2. DDA Wall Raycaster
    for (let x = 0; x < width; x++) {
      const cameraX = (2 * x) / width - 1;
      const rayDirX = this.player.dirX + this.player.planeX * cameraX;
      const rayDirY = this.player.dirY + this.player.planeY * cameraX;

      let mapX = Math.floor(this.player.x);
      let mapY = Math.floor(this.player.y);

      const deltaDistX = Math.abs(1 / rayDirX);
      const deltaDistY = Math.abs(1 / rayDirY);

      let stepX, stepY;
      let sideDistX, sideDistY;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (this.player.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - this.player.x) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (this.player.y - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - this.player.y) * deltaDistY;
      }

      let hit = 0;
      let side = 0;
      let wallType = 1;

      while (hit === 0) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }

        if (mapX >= 0 && mapX < this.mapWidth && mapY >= 0 && mapY < this.mapHeight) {
          if (this.map[mapY][mapX] > 0) {
            hit = 1;
            wallType = this.map[mapY][mapX];
          }
        } else {
          hit = 1;
          wallType = 1;
        }
      }

      let perpWallDist;
      if (side === 0) {
        perpWallDist = (mapX - this.player.x + (1 - stepX) / 2) / rayDirX;
      } else {
        perpWallDist = (mapY - this.player.y + (1 - stepY) / 2) / rayDirY;
      }

      this.zBuffer[x] = perpWallDist;

      const lineHeight = Math.floor(height / Math.max(0.08, perpWallDist));
      const drawStart = Math.max(0, -lineHeight / 2 + height / 2);
      const drawEnd = Math.min(height - 1, lineHeight / 2 + height / 2);

      let wallX;
      if (side === 0) {
        wallX = this.player.y + perpWallDist * rayDirY;
      } else {
        wallX = this.player.x + perpWallDist * rayDirX;
      }
      wallX -= Math.floor(wallX);

      // Select texture
      let texKey = 'wall_office';
      if (wallType === 2) texKey = 'wall_window';
      else if (wallType === 3) texKey = 'wall_whiteboard';
      else if (wallType === 4) texKey = 'wall_server';
      else if (wallType === 5) texKey = 'wall_bookshelf';
      else if (wallType === 6) texKey = 'wall_posters';

      const tex = this.assets.getTexture(texKey);
      const texX = Math.floor(wallX * tex.width);

      ctx.drawImage(tex, texX, 0, 1, tex.height, x, drawStart, 1, drawEnd - drawStart);

      // Lamp-lit walls with distance fog
      const hitX = this.player.x + perpWallDist * rayDirX;
      const hitY = this.player.y + perpWallDist * rayDirY;
      const lit = lightAt(hitX, hitY) * Math.max(0.25, 1 - perpWallDist * 0.035);
      const dark = Math.min(0.8, Math.max(0, 1 - lit * 1.0)) + (side === 1 ? 0.08 : 0);
      ctx.fillStyle = `rgba(6, 9, 20, ${Math.min(0.92, dark)})`;
      ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
    }

    // 3. Render 3D Sprites
    this.renderSprites();

    // Glow + vignette, then HUD on top
    this.post.apply();

    // 4. In-World Interaction HUD Prompt
    if (this.nearInteractable) {
      this.renderInteractionHUD(this.nearInteractable);
    }

    // 5. Minimap
    if (this.showMinimap) {
      this.renderMinimap();
    }

    // 6. CRT Scanlines
    if (this.showScanlines) {
      this.renderScanlines();
    }
  }

  renderSprites() {
    const { ctx, width, height } = this;

    const sortedSprites = this.sprites
      .map((s) => ({
        ...s,
        dist: Math.hypot(this.player.x - s.x, this.player.y - s.y)
      }))
      .sort((a, b) => b.dist - a.dist);

    for (const sprite of sortedSprites) {
      const spriteX = sprite.x - this.player.x;
      const spriteY = sprite.y - this.player.y;

      const invDet = 1.0 / (this.player.planeX * this.player.dirY - this.player.dirX * this.player.planeY);
      const transformX = invDet * (this.player.dirY * spriteX - this.player.dirX * spriteY);
      const transformY = invDet * (-this.player.planeY * spriteX + this.player.planeX * spriteY);

      if (transformY <= 0.1) continue;

      const spriteScreenX = Math.floor((width / 2) * (1 + transformX / transformY));
      const spriteHeight = Math.abs(Math.floor(height / transformY));
      const spriteWidth = Math.abs(Math.floor(height / transformY));

      const drawStartY = Math.max(0, Math.floor(-spriteHeight / 2 + height / 2 + spriteHeight * 0.15));
      const drawEndY = Math.min(height - 1, Math.floor(spriteHeight / 2 + height / 2 + spriteHeight * 0.15));

      const drawStartX = Math.max(0, Math.floor(-spriteWidth / 2 + spriteScreenX));
      const drawEndX = Math.min(width - 1, Math.floor(spriteWidth / 2 + spriteScreenX));

      const spriteImg = this.assets.getSprite(sprite.spriteId);
      if (!spriteImg) continue;

      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        const texX = Math.floor(((stripe - (-spriteWidth / 2 + spriteScreenX)) * spriteImg.width) / spriteWidth);

        if (transformY < this.zBuffer[stripe]) {
          ctx.drawImage(
            spriteImg,
            texX,
            0,
            1,
            spriteImg.height,
            stripe,
            drawStartY,
            1,
            drawEndY - drawStartY
          );
        }
      }

      // 3D Status Banner for Agents
      if (sprite.type === 'agent' && transformY < 14) {
        const agent = this.state.agents[sprite.agentId];
        if (agent) {
          const badgeY = Math.max(8, drawStartY - 20);
          const badgeX = spriteScreenX;

          ctx.save();
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';

          let icon = '💻';
          if (agent.state === 'THINKING') icon = '💭';
          else if (agent.state === 'TESTING') icon = '🧪';
          else if (agent.state === 'COFFEE') icon = '☕';
          else if (agent.state === 'RESEARCHING') icon = '🔍';

          const label = `${icon} ${agent.name} [${agent.state}]`;
          const textW = ctx.measureText(label).width;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(badgeX - textW / 2 - 4, badgeY - 8, textW + 8, 12);
          ctx.strokeStyle = agent.color || '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(badgeX - textW / 2 - 4, badgeY - 8, textW + 8, 12);

          ctx.fillStyle = agent.color || '#ffffff';
          ctx.fillText(label, badgeX, badgeY + 1);
          this.drawHealthBar(badgeX - textW / 2 - 4, badgeY + 5, textW + 8, 3, agent.energy);

          ctx.restore();
        }
      }
    }
  }

  renderInteractionHUD(item) {
    const { ctx, width, height } = this;
    ctx.save();

    const bannerW = Math.min(width - 30, 320);
    const bannerH = 34;
    const bannerX = (width - bannerW) / 2;
    const bannerY = height - bannerH - 12;

    let title = '';
    let subtitle = '';
    let color = '#38bdf8';

    if (item.type === 'agent') {
      const agent = this.state.agents[item.agentId];
      color = agent?.color || '#38bdf8';
      title = `${agent?.name?.toUpperCase()} // ${agent?.role?.toUpperCase()}`;
      subtitle = '[E] INSPECT CRT MONITOR   |   [T] TALK OVER MCP';
    } else if (item.type === 'coffee_bar') {
      color = '#f59e0b';
      title = '☕ ESPRESSO COFFEE BAR';
      subtitle = '[E] BREW ARTISAN ESPRESSO (+10% ENERGY TO ALL AGENTS)';
    } else if (item.type === 'arcade') {
      color = '#a855f7';
      title = '👾 ANTIGRAVITY ARCADE CABINET';
      subtitle = '[E] PLAY RETRO PIXEL QUEST ARCADE';
    } else if (item.type === 'vending') {
      color = '#38bdf8';
      title = '🥤 QUANTUM SODA & SNACK VENDING';
      subtitle = '[E] DISPENSE CHILLED BEVERAGE';
    } else {
      title = item.title || 'OFFICE ASSET';
      subtitle = '[E] INTERACT';
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, bannerY + 14);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(subtitle, width / 2, bannerY + 27);

    ctx.restore();
  }

  renderMinimap() {
    const { ctx, width } = this;
    const scale = 2.2;
    const pad = 8;
    const mapPixelW = this.mapWidth * scale;
    const mapPixelH = this.mapHeight * scale;
    const startX = width - mapPixelW - pad;
    const startY = pad;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(startX - 2, startY - 2, mapPixelW + 4, mapPixelH + 4);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(startX - 2, startY - 2, mapPixelW + 4, mapPixelH + 4);

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const val = this.map[y][x];
        if (val > 0) {
          ctx.fillStyle =
            val === 3 ? '#3b82f6' : val === 4 ? '#10b981' : val === 5 ? '#854d0e' : val === 6 ? '#a855f7' : '#475569';
          ctx.fillRect(startX + x * scale, startY + y * scale, scale, scale);
        }
      }
    }

    // Agent Blips
    for (const a of Object.values(this.state.agents)) {
      ctx.fillStyle = a.color || '#f43f5e';
      ctx.fillRect(startX + a.pos.x * scale - 1, startY + a.pos.z * scale - 1, 3.5, 3.5);
    }

    // Player
    const px = startX + this.player.x * scale;
    const py = startY + this.player.y * scale;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + this.player.dirX * 6, py + this.player.dirY * 6);
    ctx.stroke();

    ctx.restore();
  }

  renderScanlines() {
    const { ctx, width, height } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < height; y += 2) {
      ctx.fillRect(0, y, width, 1);
    }
  }
}
