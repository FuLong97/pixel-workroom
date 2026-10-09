// public/js/engine3d.js - High-Definition First-Person 3D Pixel Raycaster Engine
import { audioSynth } from './audio.js';
import { FloorCeilingRenderer, PostFX, lightAt, setLightLevel } from './fx.js';

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
    this.lightsOn = true;
    this.viewMode = 'fpv'; // 'fpv' | 'top'
    this.hover = null;
    this.topLayout = null;

    // dust floating in the lamp light
    this.dust = Array.from({ length: 70 }, (_, i) => ({
      x: 2 + Math.random() * 19, y: 2 + Math.random() * 21, z: 0.1 + Math.random() * 0.85,
      vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12, vz: 0.01 + Math.random() * 0.03, phase: Math.random() * 6.28
    }));

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
    // h = height in wall units (the picture's own proportions give the width), r = how much room it takes
    // up for walking (0 = walk through), icon = size in the top view. Zones: work desks around a meeting
    // table in the middle, a lounge with the machines on the east wall, shelves and servers along the
    // north and south walls, plants and lamps along the windows.
    const D = (id, spriteId, x, y, h, r, icon, title = '') => ({ id, type: 'prop', decor: true, title, x, y, spriteId, h, r, icon });

    this.sprites = [
      // The five desks, two on each side of the meeting table and one in the research corner
      { id: 'alice', type: 'agent', agentId: 'alice', x: 6.5, y: 8.5, spriteId: 'agent_alice', h: 0.95, r: 0.7, icon: 2.4 },
      { id: 'bob', type: 'agent', agentId: 'bob', x: 6.5, y: 14.0, spriteId: 'agent_bob', h: 0.95, r: 0.7, icon: 2.4 },
      { id: 'charlie', type: 'agent', agentId: 'charlie', x: 15.5, y: 8.5, spriteId: 'agent_charlie', h: 0.95, r: 0.7, icon: 2.4 },
      { id: 'diana', type: 'agent', agentId: 'diana', x: 15.5, y: 14.0, spriteId: 'agent_diana', h: 0.95, r: 0.7, icon: 2.4 },
      { id: 'echo', type: 'agent', agentId: 'echo', x: 11.0, y: 19.5, spriteId: 'agent_echo', h: 0.95, r: 0.7, icon: 2.4 },

      // Lounge and break machines along the east wall
      { id: 'couch1', type: 'couch', title: 'Leather Lounge Sofa', x: 20.6, y: 4.3, spriteId: 'prop_couch', h: 0.55, r: 0.8, icon: 2.2 },
      { id: 'coffee_bar', type: 'coffee_bar', title: 'Espresso Coffee Bar', x: 21.3, y: 8.6, spriteId: 'prop_coffee_bar', h: 0.6, r: 0.6, icon: 1.8 },
      { id: 'arcade', type: 'arcade', title: 'Antigravity Arcade', x: 21.4, y: 11.8, spriteId: 'prop_arcade', h: 1.05, r: 0.5, icon: 1.9 },
      { id: 'vending', type: 'vending', title: 'Soda & Snack Machine', x: 21.4, y: 14.6, spriteId: 'prop_vending', h: 1.05, r: 0.5, icon: 1.9 },
      D('cooler', 'prop_cooler', 21.5, 17.4, 0.62, 0.35, 1.3, 'Water Cooler'),
      D('coffee_table', 'prop_coffee_table', 20.4, 6.2, 0.32, 0.55, 1.8),
      D('bin1', 'prop_bin', 19.7, 8.9, 0.3, 0.25, 0.9),
      D('lamp_lounge', 'prop_lamp', 19.3, 3.0, 1.0, 0.2, 0.9),

      // Meeting corner in the middle of the room
      D('table', 'prop_table', 11.0, 11.4, 0.5, 0.85, 2.7),
      D('chair1', 'prop_chair', 9.8, 11.4, 0.4, 0.25, 0.9),
      D('chair2', 'prop_chair', 12.2, 11.4, 0.4, 0.25, 0.9),
      D('chair3', 'prop_chair', 10.5, 10.3, 0.4, 0.25, 0.9),
      D('chair4', 'prop_chair', 11.5, 10.3, 0.4, 0.25, 0.9),
      D('chair5', 'prop_chair', 10.5, 12.5, 0.4, 0.25, 0.9),
      D('chair6', 'prop_chair', 11.5, 12.5, 0.4, 0.25, 0.9),
      D('board', 'prop_whiteboard', 8.2, 2.0, 1.0, 0.5, 2.0),

      // Along the north wall: printer, cabinets, shelves
      D('printer', 'prop_printer', 2.6, 2.4, 0.4, 0.4, 1.4),
      D('cabinet1', 'prop_cabinet', 4.0, 1.8, 0.62, 0.4, 1.1),
      D('shelf1', 'prop_bookshelf', 13.2, 1.8, 1.05, 0.5, 1.5),
      D('shelf2', 'prop_bookshelf', 14.6, 1.8, 1.05, 0.5, 1.5),
      D('plant_n', 'prop_plant_small', 16.0, 2.0, 0.4, 0.25, 0.9),
      D('cabinet2', 'prop_cabinet', 17.2, 1.8, 0.62, 0.4, 1.1),

      // Along the window wall (west): lamps and plants in a rhythm
      D('lamp_w1', 'prop_lamp', 1.8, 6.0, 1.0, 0.2, 0.9),
      D('lamp_w2', 'prop_lamp', 1.8, 11.5, 1.0, 0.2, 0.9),
      D('lamp_w3', 'prop_lamp', 1.8, 17.0, 1.0, 0.2, 0.9),
      D('plant_w1', 'prop_plant_small', 1.9, 8.8, 0.4, 0.25, 0.9),
      D('plant_w2', 'prop_plant_small', 1.9, 14.3, 0.4, 0.25, 0.9),
      D('plant_w3', 'prop_plant_small', 1.9, 19.8, 0.4, 0.25, 0.9),

      // South: server racks, shelves and the research corner
      D('server1', 'prop_server', 3.4, 22.3, 1.05, 0.4, 1.3),
      D('server2', 'prop_server', 4.8, 22.3, 1.05, 0.4, 1.3),
      D('server3', 'prop_server', 18.2, 22.3, 1.05, 0.4, 1.3),
      D('server4', 'prop_server', 19.6, 22.3, 1.05, 0.4, 1.3),
      D('shelf3', 'prop_bookshelf', 8.4, 22.3, 1.05, 0.5, 1.5),
      D('shelf4', 'prop_bookshelf', 13.6, 22.3, 1.05, 0.5, 1.5),
      D('plant_s1', 'prop_plant_small', 9.9, 22.2, 0.4, 0.25, 0.9),
      D('plant_s2', 'prop_plant_small', 12.1, 22.2, 0.4, 0.25, 0.9),

      // Small plants beside the desks, big ones in the corners
      D('plant_d1', 'prop_plant_small', 8.5, 8.0, 0.4, 0.25, 0.9),
      D('plant_d2', 'prop_plant_small', 13.5, 8.0, 0.4, 0.25, 0.9),
      D('plant_d3', 'prop_plant_small', 8.5, 13.5, 0.4, 0.25, 0.9),
      D('plant_d4', 'prop_plant_small', 13.5, 13.5, 0.4, 0.25, 0.9),
      D('ficus1', 'prop_ficus', 2.0, 3.6, 1.0, 0.35, 1.5, 'Ficus Tree'),
      D('ficus2', 'prop_ficus', 21.9, 1.9, 1.0, 0.35, 1.5, 'Ficus Tree'),
      D('ficus3', 'prop_ficus', 1.9, 22.3, 1.0, 0.35, 1.5, 'Ficus Tree'),
      D('ficus4', 'prop_ficus', 21.8, 22.0, 1.0, 0.35, 1.5, 'Ficus Tree')
    ];

    // What the furniture does: press E next to it (or click it in the top view).
    // [title, action, what happens]. Everything not listed here is just decoration.
    const ACTS = {
      board: ['📋 PLANNING BOARD', 'jobs', 'SEE ALL JOBS AND THEIR PROGRESS'],
      table: ['🗣 MEETING TABLE', 'chat', 'OPEN THE TEAM CHAT'],
      shelf: ['📚 BOOKSHELF', 'library', 'BROWSE EVERYTHING THE TEAM BUILT'],
      cabinet: ['🗄 FILING CABINET', 'assign', 'FILE A NEW JOB'],
      server: ['🖥 SERVER RACK', 'models', 'CHOOSE OR DOWNLOAD LOCAL MODELS'],
      printer: ['🖨 PRINTER', 'print', 'SAVE A REPORT OF JOBS AND CHAT'],
      lamp: ['💡 FLOOR LAMP', 'lights', 'SWITCH THE ROOM LIGHTS ON OR OFF'],
      ficus: ['🪴 FICUS', 'water', 'WATER IT: FILLS ALL TOKEN BARS'],
      couch: ['🛋 LEATHER SOFA', 'settings', 'API KEYS AND SETTINGS'],
      cooler: ['💧 WATER COOLER', 'share', 'PHONE LINK AND TELEGRAM'],
      bin: ['🗑 RECYCLING BIN', 'bin', 'EMPTY CHAT AND JOBS']
    };
    for (const s of this.sprites) {
      const key = s.id.replace(/[0-9]+$/, '').replace(/^lamp_.*/, 'lamp');
      const a = ACTS[key];
      if (a) Object.assign(s, { title: a[0], act: a[1], hint: a[2], decor: false });
    }

    // Rugs on the floor (the desks get a rug in their agent's colour automatically)
    this.decorRugs = [
      { x: 11.0, y: 11.4, hw: 2.3, hh: 1.9, fill: [34, 54, 92], edge: [58, 84, 128] },     // meeting corner
      { x: 20.3, y: 5.2, hw: 2.0, hh: 2.2, fill: [84, 34, 40], edge: [126, 66, 58] },      // lounge
      { x: 11.0, y: 3.9, hw: 1.7, hh: 0.8, fill: [24, 30, 44], edge: [52, 62, 84] },       // entrance mat
      { x: 11.0, y: 21.6, hw: 3.6, hh: 0.9, fill: [32, 48, 44], edge: [64, 96, 84] }       // reading spot
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

    for (const m of this.dust) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt * Math.sin(m.phase + performance.now() / 2000);
      if (m.z > 0.95 || m.z < 0.05) m.vz = -m.vz;
      if (m.x < 1.5 || m.x > 22) m.vx = -m.vx;
      if (m.y < 1.5 || m.y > 23) m.vy = -m.vy;
    }

    this.checkProximity();
  }

  isSolid(x, y) {
    const mapX = Math.floor(x);
    const mapY = Math.floor(y);
    if (mapX < 0 || mapX >= this.mapWidth || mapY < 0 || mapY >= this.mapHeight) return true;
    if (this.map[mapY][mapX] > 0) return true;
    // desks, tables, shelves and machines take up room; you walk around them
    for (const s of this.sprites) {
      if (!s.r) continue;
      const dx = x - s.x;
      const dy = y - s.y;
      if (dx * dx + dy * dy < s.r * s.r) return true;
    }
    return false;
  }

  checkProximity() {
    let closest = null;
    let minDist = 2.6;

    for (const s of this.sprites) {
      if (s.decor) continue;
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

    // furniture with a job to do (planning board, shelf, printer, lamp, ...)
    if (item.act) {
      audioSynth.playBleep();
      window.workroomApp?.runAction(item.act, item);
      return;
    }

    if (item.type === 'agent') {
      window.workroomApp?.openMonitorCockpit(item.agentId);
      audioSynth.playBleep();
    } else if (item.type === 'coffee_bar') {
      // (the token bars are real usage now, so a coffee no longer changes them)
      window.workroomApp?.sendWebSocketAction({
        type: 'broadcast',
        text: '☕ Fresh batch of artisan espresso brewed at the coffee bar!',
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

  // Floor lamps switch the lights: dark room, glowing screens
  toggleLights() {
    this.lightsOn = !this.lightsOn;
    setLightLevel(this.lightsOn ? 1 : 0.38);
    return this.lightsOn;
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.hover = null;
    const hint = document.getElementById('view-hint');
    if (hint) {
      hint.innerHTML = mode === 'top'
        ? '<span>Click floor: <strong class="text-slate-200">Move</strong></span> &bull; <span>Click agent: <strong class="text-cyan-300">Open monitor</strong></span> &bull; <span>[V]: <strong class="text-slate-200">First person</strong></span>'
        : hint.dataset.fpv;
    }
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
      if (s.decor) continue;
      const pos = this.spriteTopPos(s);
      const d = Math.hypot(pos.x - wx, pos.y - wy);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) return { kind: 'sprite', sprite: best, x: wx, y: wy };
    return { kind: 'floor', x: wx, y: wy };
  }

  // Agents move in shared state; use their live position when available
  // Desks stand where the room puts them (the saved agent position is only a leftover from older versions
  // and would draw the top view differently from the first-person view).
  spriteTopPos(s) {
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

    // Floor rugs (meeting corner, lounge, entrance, reading spot)
    for (const r of this.decorRugs || []) {
      const rx = ox + (r.x - r.hw) * tile;
      const ry = oy + (r.y - r.hh) * tile;
      ctx.fillStyle = `rgb(${r.fill.join(',')})`;
      ctx.beginPath();
      ctx.roundRect(rx, ry, r.hw * 2 * tile, r.hh * 2 * tile, tile * 0.35);
      ctx.fill();
      ctx.strokeStyle = `rgb(${r.edge.join(',')})`;
      ctx.lineWidth = Math.max(1, tile * 0.12);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${r.edge.join(',')},0.35)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + tile * 0.4, ry + tile * 0.4, r.hw * 2 * tile - tile * 0.8, r.hh * 2 * tile - tile * 0.8);
    }

    // Soft drop shadows under props, sized to each piece of furniture
    for (const s of this.sprites) {
      const pos = this.spriteTopPos(s);
      const reach = tile * (s.icon || 1.8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(ox + pos.x * tile + tile * 0.1, oy + pos.y * tile + reach * 0.18, reach * 0.48, reach * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Desk rugs under each agent
    for (const s of this.sprites) {
      if (s.type !== 'agent') continue;
      const a = this.state.agents?.[s.agentId];
      const pos = this.spriteTopPos(s);
      ctx.fillStyle = (a?.color || '#94a3b8') + '33';
      ctx.beginPath();
      ctx.roundRect(ox + (pos.x - 2.1) * tile, oy + (pos.y - 1.5) * tile, tile * 4.2, tile * 3, tile * 0.3);
      ctx.fill();
    }

    // Props & agents
    for (const s of this.sprites) {
      const pos = this.spriteTopPos(s);
      const cx = ox + pos.x * tile;
      const cy = oy + pos.y * tile;
      const img = this.assets.getSprite(s.spriteId);
      // keep the picture's own proportions; "icon" is the longest side in tiles
      if (img) {
        const side = tile * (s.icon || 1.8);
        const aspect = img.width / img.height;
        const iw = aspect >= 1 ? side : side * aspect;
        const ih = aspect >= 1 ? side / aspect : side;
        ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
      }

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
          const w = ctx.measureText(label).width + tile * 0.9;
          const lh = tile * 0.9;
          const lx = cx - w / 2;
          const ly = cy - tile * 1.95;
          ctx.fillStyle = 'rgba(8, 12, 24, 0.92)';
          ctx.beginPath();
          ctx.roundRect(lx, ly, w, lh, lh / 2);
          ctx.fill();
          ctx.strokeStyle = color + '99';
          ctx.lineWidth = 1;
          ctx.stroke();
          const live = a.state !== 'IDLE';
          ctx.fillStyle = live ? '#22c55e' : '#64748b';
          ctx.beginPath();
          ctx.arc(lx + lh * 0.5, ly + lh / 2, tile * 0.16, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.textAlign = 'left';
          ctx.fillText(label, lx + lh * 0.85, ly + lh * 0.68);
          ctx.textAlign = 'center';
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
      const text = a ? `${a.name} — ${a.status}  [click: open monitor]` : `${s.title || s.type}  [click: ${s.hint ? s.hint.toLowerCase() : 'interact'}]`;
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

      // Polish: soft shadow under the ceiling, dark baseboard with a bright top edge, contact shadow on the floor
      const wallH = drawEnd - drawStart;
      if (wallH > 8) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
        ctx.fillRect(x, drawStart, 1, Math.max(1, wallH * 0.07));
        ctx.fillStyle = 'rgba(28, 18, 12, 0.62)';
        ctx.fillRect(x, drawEnd - wallH * 0.075, 1, wallH * 0.075);
        ctx.fillStyle = 'rgba(255, 235, 200, 0.16)';
        ctx.fillRect(x, drawEnd - wallH * 0.075, 1, Math.max(1, wallH * 0.012));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(x, drawEnd - wallH * 0.16, 1, wallH * 0.085);
      }
    }

    // 3. Render 3D Sprites
    this.renderSprites();

    this.renderDust();

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

  renderDust() {
    const { ctx, width, height } = this;
    const p = this.player;
    const invDet = 1.0 / (p.planeX * p.dirY - p.dirX * p.planeY);
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.dust) {
      const dx = m.x - p.x, dy = m.y - p.y;
      const tx = invDet * (p.dirY * dx - p.dirX * dy);
      const ty = invDet * (-p.planeY * dx + p.planeX * dy);
      if (ty < 0.4 || ty > 14) continue;
      const sx = Math.floor((width / 2) * (1 + tx / ty));
      if (sx < 0 || sx >= width || ty >= this.zBuffer[sx]) continue;
      const sy = height / 2 + (0.5 - m.z) * (height / ty);
      const glow = Math.min(1, lightAt(m.x, m.y) - 0.5);
      if (glow <= 0) continue;
      const a = Math.max(0, glow) * (0.25 + 0.25 * Math.sin(t * 2 + m.phase)) * Math.min(1, 6 / ty);
      ctx.fillStyle = `rgba(255, 236, 200, ${a.toFixed(3)})`;
      const size = ty < 3 ? 2 : 1;
      ctx.fillRect(sx, sy, size, size);
    }
    ctx.restore();
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

      const img = this.assets.getSprite(sprite.spriteId);
      if (!img) continue;

      const spriteScreenX = Math.floor((width / 2) * (1 + transformX / transformY));
      // Real proportions: the height is given in wall units, the width follows the picture, and the
      // feet stand on the floor (before, everything was squeezed into a square and sat below the floor).
      const unit = height / transformY;                        // one wall unit on screen
      const spriteHeight = Math.max(1, Math.floor(unit * (sprite.h ?? 1)));
      const spriteWidth = Math.max(1, Math.floor(spriteHeight * (img.width / img.height)));
      const floorY = Math.floor(height / 2 + unit / 2);        // where the floor is at this distance
      const top = floorY - spriteHeight;
      const left = Math.floor(spriteScreenX - spriteWidth / 2);

      const drawStartX = Math.max(0, left);
      const drawEndX = Math.min(width, left + spriteWidth);
      if (drawEndX <= drawStartX || top > height || floorY < 0) continue;
      if (spriteWidth > 1600 || spriteHeight > 1600) continue;  // so close that it would fill the screen

      const drawStartY = top;
      const w = drawEndX - drawStartX;
      const h = spriteHeight;

      // agents breathe a little while they work
      const agent = sprite.type === 'agent' ? this.state.agents?.[sprite.agentId] : null;
      const t = performance.now() / 1000;
      const bob = agent && agent.state !== 'IDLE' ? Math.sin(t * 3 + sprite.x) * h * 0.012 : 0;
      const centerVisible = transformY < this.zBuffer[Math.min(width - 1, Math.max(0, spriteScreenX))];

      // contact shadow on the floor
      if (centerVisible) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.ellipse(spriteScreenX, floorY - h * 0.01, spriteWidth * 0.46, Math.max(2, unit * 0.07), 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // soft glow from an agent's monitor, in their colour
      if (agent && centerVisible) {
        const gy = top + h * 0.45;
        const g = ctx.createRadialGradient(spriteScreenX, gy, 0, spriteScreenX, gy, spriteWidth * 0.9);
        g.addColorStop(0, (agent.color || '#38bdf8') + '55');
        g.addColorStop(1, (agent.color || '#38bdf8') + '00');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(spriteScreenX - spriteWidth, gy - spriteWidth, spriteWidth * 2, spriteWidth * 2);
        ctx.restore();
      }

      // draw the sprite into a scratch canvas (respecting walls in front), light it, then composite
      const tmp = this.spriteTmp || (this.spriteTmp = document.createElement('canvas'));
      if (tmp.width < w || tmp.height < h) {
        tmp.width = Math.max(tmp.width, w);
        tmp.height = Math.max(tmp.height, h);
      }
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      tctx.clearRect(0, 0, w, h);
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (transformY >= this.zBuffer[stripe]) continue;
        const texX = Math.min(img.width - 1, Math.floor(((stripe - left) * img.width) / spriteWidth));
        tctx.drawImage(img, texX, 0, 1, img.height, stripe - drawStartX, 0, 1, h);
      }
      const lit = Math.min(1, lightAt(sprite.x, sprite.y) * Math.max(0.35, 1 - transformY * 0.03));
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = `rgba(6, 9, 20, ${Math.max(0, 0.62 - lit * 0.5).toFixed(3)})`;
      tctx.fillRect(0, 0, w, h);
      tctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, 0, 0, w, h, drawStartX, top + bob, w, h);

      // 3D Status Banner for Agents
      if (sprite.type === 'agent' && transformY < 14) {
        const agent = this.state.agents[sprite.agentId];
        if (agent) {
          const badgeY = Math.max(8, drawStartY - 20 + bob);
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
    const bannerY = Math.floor(height * 0.76) - bannerH;   // above the help bar, which sits over the bottom of the picture

    let title = '';
    let subtitle = '';
    let color = '#38bdf8';

    if (item.act) {
      title = item.title;
      subtitle = `[E] ${item.hint}`;
      color = '#22d3ee';
    } else if (item.type === 'agent') {
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
    for (const s of this.sprites) {
      if (s.type !== 'agent') continue;
      ctx.fillStyle = this.state.agents?.[s.agentId]?.color || '#f43f5e';
      ctx.fillRect(startX + s.x * scale - 1, startY + s.y * scale - 1, 3.5, 3.5);
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
