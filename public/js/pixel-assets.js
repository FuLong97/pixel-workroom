// public/js/pixel-assets.js - High-Definition 16-Bit Procedural Pixel Art Asset Generator
export class PixelAssetManager {
  constructor() {
    this.textures = {};
    this.sprites = {};
    this.generateAllAssets();
  }

  // Create an offscreen canvas
  createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx };
  }

  generateAllAssets() {
    this.generateWallTextures();
    this.generateFloorCeilingTextures();
    this.generateAgentSprites();
    this.generateOfficeProps();
  }

  generateWallTextures() {
    const S = 128; // Upgraded to 128x128 for high-definition pixel art

    // 1. Office Tech Wall with Baseboard & Conduit
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#1e222d';
      ctx.fillRect(0, 0, S, S);

      // Panel borders & seams
      ctx.fillStyle = '#181b24';
      for (let x = 0; x < S; x += 32) {
        ctx.fillRect(x, 0, 2, S);
      }
      // Top crown molding
      ctx.fillStyle = '#2f3545';
      ctx.fillRect(0, 0, S, 6);
      ctx.fillStyle = '#3b4356';
      ctx.fillRect(0, 6, S, 2);

      // Bottom baseboard
      ctx.fillStyle = '#12141c';
      ctx.fillRect(0, S - 16, S, 16);
      ctx.fillStyle = '#2d3342';
      ctx.fillRect(0, S - 18, S, 2);

      // Metallic cable conduit running horizontally
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(0, S - 26, S, 2);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, S - 24, S, 1);

      // Subtle textured speckling
      for (let i = 0; i < 400; i++) {
        const px = Math.floor(Math.random() * S);
        const py = Math.floor(Math.random() * (S - 24)) + 8;
        ctx.fillStyle = Math.random() > 0.5 ? '#252a37' : '#191c25';
        ctx.fillRect(px, py, 1, 1);
      }

      this.textures['wall_office'] = canvas;
    }

    // 2. Panoramic Skyline Window Wall
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#161922';
      ctx.fillRect(0, 0, S, S);

      // Glass frame
      ctx.fillStyle = '#090c14';
      ctx.fillRect(8, 8, S - 16, S - 32);

      // Deep night sky gradient
      const skyGrad = ctx.createLinearGradient(0, 8, 0, S - 24);
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(0.5, '#0f172a');
      skyGrad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(8, 8, S - 16, S - 32);

      // Stars & Constellations
      ctx.fillStyle = '#f8fafc';
      const stars = [
        [16, 16], [32, 22], [54, 14], [80, 20], [105, 12],
        [24, 34], [48, 28], [72, 38], [96, 26], [112, 30]
      ];
      stars.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(40, 18, 2, 2);
      ctx.fillRect(88, 16, 2, 2);

      // Cyberpunk Pixel Cityscape
      const buildings = [
        { x: 12, w: 18, h: 48, col: '#172554' },
        { x: 34, w: 22, h: 62, col: '#1e1b4b' },
        { x: 60, w: 16, h: 38, col: '#0f172a' },
        { x: 80, w: 24, h: 54, col: '#1e293b' },
        { x: 108, w: 10, h: 42, col: '#172554' }
      ];

      buildings.forEach(b => {
        const by = S - 24 - b.h;
        ctx.fillStyle = b.col;
        ctx.fillRect(b.x, by, b.w, b.h);

        // Antenna with blinking red warning light
        ctx.fillStyle = '#475569';
        ctx.fillRect(b.x + b.w / 2, by - 8, 1, 8);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(b.x + b.w / 2 - 1, by - 9, 3, 2);

        // Lit Windows
        for (let wy = by + 6; wy < S - 28; wy += 6) {
          for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 5) {
            if (Math.random() > 0.35) {
              ctx.fillStyle = Math.random() > 0.4 ? '#fef08a' : '#38bdf8';
              ctx.fillRect(wx, wy, 2, 3);
            }
          }
        }
      });

      // Window mullions (crossbars)
      ctx.fillStyle = '#262b3a';
      ctx.fillRect(S / 2 - 2, 8, 4, S - 32);
      ctx.fillRect(8, (S - 24) / 2, S - 16, 4);

      // Bottom sill & baseboard
      ctx.fillStyle = '#12141c';
      ctx.fillRect(0, S - 16, S, 16);

      this.textures['wall_window'] = canvas;
    }

    // 3. Central Office Whiteboard Wall
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#1e222d';
      ctx.fillRect(0, 0, S, S);

      // Aluminum whiteboard frame
      ctx.fillStyle = '#475569';
      ctx.fillRect(8, 12, S - 16, S - 36);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(10, 14, S - 20, S - 40);

      // Dry-erase surface
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(12, 16, S - 24, S - 44);

      // Architecture Diagrams & Flowcharts
      ctx.fillStyle = '#2563eb'; // Blue boxes
      ctx.fillRect(20, 24, 24, 14);
      ctx.fillRect(68, 24, 24, 14);
      ctx.fillStyle = '#059669'; // Green DB box
      ctx.fillRect(44, 52, 28, 16);

      // Arrow connectors
      ctx.fillStyle = '#475569';
      ctx.fillRect(44, 30, 24, 3);
      ctx.fillRect(57, 33, 3, 19);

      // Sticky Notes (Yellow, Coral, Mint, Cyan)
      const stickies = [
        { x: 20, y: 72, w: 10, h: 10, col: '#fde047' },
        { x: 34, y: 72, w: 10, h: 10, col: '#f472b6' },
        { x: 74, y: 72, w: 10, h: 10, col: '#4ade80' },
        { x: 88, y: 72, w: 10, h: 10, col: '#38bdf8' }
      ];
      stickies.forEach(st => {
        ctx.fillStyle = st.col;
        ctx.fillRect(st.x, st.y, st.w, st.h);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(st.x + 2, st.y + 3, st.w - 4, 1);
        ctx.fillRect(st.x + 2, st.y + 6, st.w - 5, 1);
      });

      // Pen tray with colored markers
      ctx.fillStyle = '#334155';
      ctx.fillRect(12, S - 26, S - 24, 4);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(20, S - 28, 6, 2);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(30, S - 28, 6, 2);
      ctx.fillStyle = '#10b981'; ctx.fillRect(40, S - 28, 6, 2);

      // Baseboard
      ctx.fillStyle = '#12141c';
      ctx.fillRect(0, S - 16, S, 16);

      this.textures['wall_whiteboard'] = canvas;
    }

    // 4. Server Datacenter Wall with Animated Blinkers
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, S, S);

      // Dual high-density server cabinets
      [8, 68].forEach(rx => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(rx, 8, 52, S - 24);
        ctx.fillStyle = '#090d16';
        ctx.fillRect(rx + 4, 12, 44, S - 32);

        // Rack Units (1U & 2U servers)
        for (let ry = 16; ry < S - 24; ry += 10) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(rx + 4, ry, 44, 9);

          // LED arrays (Green, Cyan, Amber, Blue)
          const ledCols = ['#22c55e', '#38bdf8', '#f59e0b', '#a855f7', '#22c55e'];
          ledCols.forEach((col, idx) => {
            ctx.fillStyle = col;
            ctx.fillRect(rx + 8 + idx * 6, ry + 3, 3, 2);
          });

          // Server drive bay latches & cooling vents
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(rx + 38, ry + 2, 8, 5);
        }

        // Hanging fiber patch cables
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx + 12, 20);
        ctx.bezierCurveTo(rx + 2, 50, rx + 24, 70, rx + 14, S - 30);
        ctx.stroke();
      });

      ctx.fillStyle = '#12141c';
      ctx.fillRect(0, S - 16, S, 16);

      this.textures['wall_server'] = canvas;
    }

    // 5. Bookshelf Wall (Library & Quiet Nook)
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#3e2723'; // Rich dark mahogany wood
      ctx.fillRect(0, 0, S, S);

      // Shelves
      for (let sy = 16; sy < S - 16; sy += 28) {
        ctx.fillStyle = '#2d1810';
        ctx.fillRect(4, sy, S - 8, 6);
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(4, sy - 2, S - 8, 2);

        // Row of colorful book spines
        let bx = 8;
        const bookCols = [
          '#b91c1c', '#1d4ed8', '#047857', '#d97706', '#6d28d9',
          '#be185d', '#0f766e', '#1e293b', '#b45309', '#0369a1'
        ];
        while (bx < S - 16) {
          const bw = Math.floor(Math.random() * 4) + 3;
          const bh = Math.floor(Math.random() * 6) + 18;
          const col = bookCols[Math.floor(Math.random() * bookCols.length)];
          ctx.fillStyle = col;
          ctx.fillRect(bx, sy - bh, bw, bh);
          // Gold / silver foil line on book spine
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(bx + 1, sy - bh + 4, bw - 2, 1);
          bx += bw + 1;
        }
      }

      ctx.fillStyle = '#1b120c';
      ctx.fillRect(0, S - 16, S, 16);

      this.textures['wall_bookshelf'] = canvas;
    }

    // 6. Retro Tech Poster Wall ("Keep Calm & Git Push")
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#1e222d';
      ctx.fillRect(0, 0, S, S);

      // Framed Cyberpunk Poster 1
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(12, 16, 44, 60);
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(14, 18, 40, 56);
      // Pixel art neon skull / logo
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(26, 26, 16, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(22, 46, 24, 4);
      ctx.fillRect(26, 54, 16, 4);

      // Framed Git Poster 2
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(72, 16, 44, 60);
      ctx.fillStyle = '#042f2e';
      ctx.fillRect(74, 18, 40, 56);
      // Git branch diagram
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(80, 24, 4, 38);
      ctx.fillRect(94, 34, 4, 20);
      ctx.fillRect(84, 38, 10, 4);
      ctx.fillRect(84, 50, 10, 4);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(78, 22, 8, 8);
      ctx.fillRect(92, 32, 8, 8);
      ctx.fillRect(78, 58, 8, 8);

      ctx.fillStyle = '#12141c';
      ctx.fillRect(0, S - 16, S, 16);

      this.textures['wall_posters'] = canvas;
    }
  }

  generateFloorCeilingTextures() {
    const S = 128;

    // Carpet floor (Hexagon tech pattern)
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#161923';
      ctx.fillRect(0, 0, S, S);

      // Weave pattern
      ctx.fillStyle = '#1e222f';
      for (let y = 0; y < S; y += 4) {
        for (let x = (y % 8 === 0 ? 0 : 4); x < S; x += 8) {
          ctx.fillRect(x, y, 4, 2);
        }
      }
      ctx.fillStyle = '#11131a';
      ctx.fillRect(0, 0, S, 1);
      ctx.fillRect(0, 0, 1, S);

      this.textures['floor_carpet'] = canvas;
    }

    // Ceiling acoustic tiles with recessed LED troffers
    {
      const { canvas, ctx } = this.createCanvas(S, S);
      ctx.fillStyle = '#202430';
      ctx.fillRect(0, 0, S, S);

      // Grid
      ctx.fillStyle = '#151821';
      ctx.fillRect(0, 0, S, 2);
      ctx.fillRect(0, 0, 2, S);

      // Fluorescent troffer fixture
      ctx.fillStyle = '#2d3344';
      ctx.fillRect(32, 48, 64, 32);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(36, 52, 56, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(40, 56, 48, 16);

      this.textures['ceiling_office'] = canvas;
    }
  }

  generateAgentSprites() {
    const agentDefs = [
      { id: 'alice', shirt: '#3b82f6', hair: '#f59e0b', skin: '#fcd34d', glasses: true },
      { id: 'bob', shirt: '#ec4899', hair: '#64748b', skin: '#fde047', headphones: true },
      { id: 'charlie', shirt: '#10b981', hair: '#78350f', skin: '#fcd34d' },
      { id: 'diana', shirt: '#f59e0b', hair: '#1e293b', skin: '#fed7aa', glasses: true },
      { id: 'echo', shirt: '#8b5cf6', hair: '#38bdf8', skin: '#e2e8f0', visor: true }
    ];

    agentDefs.forEach(def => {
      // 64x96 high-definition pixel sprite
      const W = 64, H = 96;
      const { canvas, ctx } = this.createCanvas(W, H);

      // Ergonomic mesh office chair
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(16, 36, 32, 40);
      ctx.fillStyle = '#334155';
      ctx.fillRect(18, 38, 28, 36);
      ctx.fillStyle = '#64748b'; // Headrest
      ctx.fillRect(22, 28, 20, 8);

      // Agent Head & Hair
      ctx.fillStyle = def.hair;
      ctx.fillRect(20, 12, 24, 20);
      ctx.fillStyle = def.skin;
      ctx.fillRect(22, 20, 20, 16);

      // Face features
      ctx.fillStyle = '#0f172a'; // Eyes
      ctx.fillRect(26, 26, 3, 3);
      ctx.fillRect(35, 26, 3, 3);

      // Glasses / Visor / Headphones
      if (def.glasses) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(24, 24, 7, 5);
        ctx.fillRect(33, 24, 7, 5);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(26, 26, 3, 2);
        ctx.fillRect(35, 26, 3, 2);
      }
      if (def.visor) {
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(22, 24, 20, 7);
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(26, 26, 12, 3);
      }
      if (def.headphones) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(18, 20, 5, 12);
        ctx.fillRect(41, 20, 5, 12);
        ctx.fillRect(22, 10, 20, 4);
      }

      // Torso & Clothing
      ctx.fillStyle = def.shirt;
      ctx.fillRect(18, 36, 28, 26);

      // Arms & Keyboard typing posture
      ctx.fillStyle = def.shirt;
      ctx.fillRect(12, 44, 6, 18);
      ctx.fillRect(46, 44, 6, 18);
      ctx.fillStyle = def.skin;
      ctx.fillRect(16, 58, 8, 6);
      ctx.fillRect(40, 58, 8, 6);

      // Large Wooden Executive Desk
      ctx.fillStyle = '#78350f'; // Desk surface
      ctx.fillRect(6, 62, 52, 8);
      ctx.fillStyle = '#451a03'; // Desk body
      ctx.fillRect(6, 70, 52, 24);

      // Dual CRT Monitors on Desk!
      // Monitor 1 (Left: Code editor)
      ctx.fillStyle = '#334155';
      ctx.fillRect(12, 44, 18, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(14, 46, 14, 14);
      ctx.fillStyle = '#22c55e'; // Green screen glow
      ctx.fillRect(16, 48, 10, 10);

      // Monitor 2 (Right: MCP Terminal)
      ctx.fillStyle = '#334155';
      ctx.fillRect(34, 44, 18, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(36, 46, 14, 14);
      ctx.fillStyle = '#38bdf8'; // Cyan screen glow
      ctx.fillRect(38, 48, 10, 10);

      // Coffee mug with steam
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(48, 58, 6, 6);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(50, 54, 2, 2); // Steam

      this.sprites[`agent_${def.id}`] = canvas;
    });
  }

  generateOfficeProps() {
    // 1. Retro Arcade Cabinet ("Antigravity Quest")
    {
      const W = 64, H = 96;
      const { canvas, ctx } = this.createCanvas(W, H);

      // Cabinet side profile
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(10, 8, 44, 86);
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(12, 10, 40, 82);

      // Glowing Marquee
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(14, 12, 36, 14);
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ARCADE', 32, 22);

      // CRT Arcade Screen (with mini pixel game!)
      ctx.fillStyle = '#090d16';
      ctx.fillRect(14, 30, 36, 28);
      // Mini spaceship & stars on screen
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(30, 48, 4, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(22, 36, 4, 4);
      ctx.fillRect(38, 38, 4, 4);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(18, 32, 1, 1);
      ctx.fillRect(44, 44, 1, 1);

      // Control Panel (Joysticks & Buttons)
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(12, 58, 40, 12);
      ctx.fillStyle = '#ef4444'; // Red joystick
      ctx.fillRect(20, 60, 4, 4);
      ctx.fillStyle = '#22c55e'; // Green button
      ctx.fillRect(34, 62, 3, 3);
      ctx.fillStyle = '#3b82f6'; // Blue button
      ctx.fillRect(40, 62, 3, 3);

      // Coin Door with glowing illuminated 25¢ slots
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(18, 74, 28, 18);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(24, 78, 4, 6);
      ctx.fillRect(36, 78, 4, 6);

      this.sprites['prop_arcade'] = canvas;
    }

    // 2. Deluxe Commercial Espresso Coffee Bar
    {
      const W = 64, H = 64;
      const { canvas, ctx } = this.createCanvas(W, H);

      // Countertop table
      ctx.fillStyle = '#451a03';
      ctx.fillRect(4, 38, 56, 26);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(4, 34, 56, 5);

      // Chrome Espresso Machine
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(12, 14, 40, 22);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(14, 16, 36, 18);

      // Dual Portafilters
      ctx.fillStyle = '#334155';
      ctx.fillRect(20, 28, 6, 8);
      ctx.fillRect(38, 28, 6, 8);

      // Steam gauges & pressure meters
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(18, 18, 5, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(41, 18, 5, 5);

      // Steaming cups on drip tray
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(20, 32, 6, 4);
      ctx.fillRect(38, 32, 6, 4);

      // Animated vapor steam rising
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(22, 8, 2, 4);
      ctx.fillRect(24, 4, 2, 3);
      ctx.fillRect(40, 8, 2, 4);

      // Stacks of paper cups & coffee bean grinder on side
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(48, 12, 10, 24);

      this.sprites['prop_coffee_bar'] = canvas;
    }

    // 3. Glowing Neon Snack & Soda Vending Machine
    {
      const W = 64, H = 96;
      const { canvas, ctx } = this.createCanvas(W, H);

      // Vending machine chassis
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(10, 6, 44, 88);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(12, 8, 40, 84);

      // Illuminated Top Header ("QUANTUM SODA")
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(14, 10, 36, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SODAS', 32, 19);

      // Glass Display Window showing beverage cans
      ctx.fillStyle = '#020617';
      ctx.fillRect(14, 24, 26, 44);
      // Rows of colored sodas
      const cans = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#ec4899'];
      for (let cy = 28; cy < 64; cy += 10) {
        cans.forEach((col, idx) => {
          ctx.fillStyle = col;
          ctx.fillRect(16 + (idx % 3) * 7, cy, 5, 7);
        });
      }

      // Keypad & LED Price Screen
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(42, 24, 8, 30);
      ctx.fillStyle = '#22c55e'; // Green LED digits
      ctx.fillRect(43, 26, 6, 4);
      // Keypad buttons
      ctx.fillStyle = '#64748b';
      for (let ky = 34; ky < 50; ky += 4) {
        ctx.fillRect(44, ky, 4, 2);
      }

      // Soda Pickup Slot at bottom
      ctx.fillStyle = '#020617';
      ctx.fillRect(14, 72, 36, 14);
      ctx.fillStyle = '#334155';
      ctx.fillRect(16, 74, 32, 10);

      this.sprites['prop_vending'] = canvas;
    }

    // 4. Lounge Leather Couch (Break Area)
    {
      const W = 64, H = 48;
      const { canvas, ctx } = this.createCanvas(W, H);

      // Backrest
      ctx.fillStyle = '#0f766e'; // Retro teal leather
      ctx.fillRect(6, 12, 52, 18);
      ctx.fillStyle = '#115e59';
      ctx.fillRect(8, 14, 48, 14);

      // Armrests
      ctx.fillStyle = '#042f2e';
      ctx.fillRect(4, 16, 8, 26);
      ctx.fillRect(52, 16, 8, 26);

      // Seat cushions
      ctx.fillStyle = '#14b8a6';
      ctx.fillRect(12, 26, 40, 16);
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(31, 26, 2, 16); // Cushion split

      // Wooden legs
      ctx.fillStyle = '#78350f';
      ctx.fillRect(6, 42, 4, 6);
      ctx.fillRect(54, 42, 4, 6);

      this.sprites['prop_couch'] = canvas;
    }

    // 5. Tall Potted Ficus / Palm Tree
    {
      const W = 48, H = 80;
      const { canvas, ctx } = this.createCanvas(W, H);

      // Ceramic planter pot
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(14, 52, 20, 24);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(16, 54, 16, 20);

      // Soil
      ctx.fillStyle = '#451a03';
      ctx.fillRect(15, 52, 18, 3);

      // Tree trunk
      ctx.fillStyle = '#78350f';
      ctx.fillRect(22, 28, 4, 24);

      // Lush foliage & palm leaves
      ctx.fillStyle = '#15803d';
      ctx.fillRect(10, 12, 28, 20);
      ctx.fillRect(6, 20, 36, 14);
      ctx.fillRect(14, 6, 20, 14);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(14, 10, 20, 14);
      ctx.fillRect(8, 16, 12, 8);
      ctx.fillRect(28, 16, 12, 8);

      this.sprites['prop_ficus'] = canvas;
    }

    // 6. Water Cooler
    {
      const W = 32, H = 48;
      const { canvas, ctx } = this.createCanvas(W, H);

      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(8, 20, 16, 26);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(10, 22, 12, 22);

      // Dispenser spigots
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(12, 28, 3, 3);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(17, 28, 3, 3);

      // Blue bottle
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(9, 4, 14, 16);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(11, 6, 10, 12);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(10, 5, 3, 12); // Reflection

      this.sprites['prop_cooler'] = canvas;
    }

    // 7. Office Recycling Bin with Crumpled Paper
    {
      const W = 32, H = 32;
      const { canvas, ctx } = this.createCanvas(W, H);

      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(8, 12, 16, 18);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(10, 14, 12, 14);

      // White crumpled paper balls
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(11, 10, 4, 4);
      ctx.fillRect(16, 9, 5, 5);

      this.sprites['prop_bin'] = canvas;
    }
  }

  getTexture(id) {
    return this.textures[id] || this.textures['wall_office'];
  }

  getSprite(id) {
    return this.sprites[id] || null;
  }
}
