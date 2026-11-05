// Procedural Pixel Art Sprite Generator for Auto Battler
// Creates crisp, retro 16x16 pixel sprites cached on offscreen canvases

export class PixelSpriteGenerator {
  constructor() {
    this.cache = new Map();
  }

  // Color Palettes (Authentic 16-color retro palette)
  static PALETTE = {
    TRANSPARENT: null,
    BLACK: '#141419',
    WHITE: '#fcfcfc',
    DARK_GRAY: '#3a3a48',
    LIGHT_GRAY: '#8b8b9e',
    STEEL_BLUE: '#385375',
    SHINING_BLUE: '#5b8bca',
    CYAN: '#00e5ff',
    GOLD: '#f1c40f',
    DARK_GOLD: '#b78900',
    SKIN: '#f5cba7',
    DARK_SKIN: '#d5a075',
    PURPLE: '#6c3483',
    BRIGHT_PURPLE: '#af7ac5',
    CRIMSON: '#922b21',
    RED: '#e74c3c',
    FOREST_GREEN: '#1e8449',
    LIGHT_GREEN: '#2ecc71',
    LEATHER_BROWN: '#784212',
    LIGHT_BROWN: '#a0522d'
  };

  /*
    16x16 Pixel Matrix Templates:
    . = transparent
    X = black / outline
    S = skin
    C = Primary Class Color
    L = Secondary / Light Color
    W = White / Accent
    G = Gold
    B = Brown / Leather
  */
  static TEMPLATES = {
    KNIGHT: [
      "....XXXXXXXX....",
      "...XCCLLCCLLX...",
      "..XCCCCCCCCCCX..",
      "..XCCWCCCCWCCX..", // Visor eyes
      "..XCCCCCCCCCCX..",
      "..XGGGGGGGGGGX..", // Gorget
      ".XCCCCCCCCCCCCX.", // Pauldrons
      ".XCLGGGGGGLCCX..", // Breastplate
      "XCCLGGGGGGLCCCX.",
      "XCCLGGGGGGLCCGX.", // Shield hand
      ".XCCCCCCCCCCX...",
      "..XBBBBBBBBX....", // Belt
      "..XCCCCCCCCX....", // Greaves
      "..XCCCCCCCCX....",
      "..XLLXXXXLLX....", // Sabatons
      "................"
    ],
    MAGE: [
      ".......XX.......", // Tip of hat
      "......XLLX......",
      ".....XCCCCX.....",
      "....XLLCCLLX....",
      "...XCCCCCCCCX...",
      "..XXXXXXXXXXXX..", // Hat brim
      "...XSSSSSSSSX...",
      "...XSWXSSXWSX...", // Mystical eyes
      "...XSSSSSSSSX.X.",
      "..XCCCCCCCCCCXCX", // Staff orb
      ".XCCCCWCCWCCCCXX",
      ".XCCCCWCCWCCCCXB", // Robe & Staff
      ".XCCCCCCCCCCCCXB",
      ".XCCCCLLLLCCCCXB",
      ".XCCCCCCCCCCCCXB",
      "................"
    ],
    ROGUE: [
      "....XXXXXXXX....",
      "...XCCCCCCCCX...", // Dark cowl
      "..XCCCCCCCCCCX..",
      "..XCCXCCCCXCCX..",
      "..XCRXCCCCXRCX..", // Glowing red eyes
      "..XCCCCCCCCCCX..",
      ".XCCCCCCCCCCCCX.",
      ".XCLCCCCCCCCLCX.",
      "XCCXXXXXXXXCCX..", // Daggers
      "XWXXBBBBBBXXWX..", // Dual daggers
      ".XCCCCCCCCCCX...",
      "..XBBBBBBBBX....",
      "..XCCCCXXCCCX...",
      "..XCCCCXXCCCX...",
      "..XLLXXXXLLX....",
      "................"
    ],
    ARCHER: [
      ".....XXXXXX.....",
      "...XXGCCCCX.....", // Feathered cap
      "..XGGCCCCCCCCX..",
      "..XCCCCCCCCCCX..",
      "...XSSSSSSSSX.B.", // Bow visible
      "...XSBXSSXBSXBXB",
      "...XSSSSSSSSX.XB",
      "..XCCCCCCCCCCXXB", // Tunic
      ".XCCLLCCCCLLCXBB",
      ".XCCCCCCCCCCCCXB",
      ".XCCCCCCCCCCCCXB",
      "..XBBBBBBBBXXB..",
      "..XLLLLLLLLX....", // Leather pants
      "..XLLLLLLLLX....",
      "..XBBXXXXBBX....", // Boots
      "................"
    ],
    CLERIC: [
      ".....XGGGGX.....", // Golden Halo
      "....XG....GX....",
      "....XXXXXXXX....",
      "...XSSSSSSSSX...",
      "...XSWXSSXWSX...", // Calm eyes
      "...XSSSSSSSSX...",
      "..XWWWWWWWWWWXG.", // Sun scepter
      ".XWWGGWWWWGGWWXG",
      ".XWWGGWWWWGGWWXX",
      ".XWWWWWWWWWWWWXB",
      ".XWWGGWWWWGGWWXB",
      "..XWWWWWWWWWWXB.",
      "..XWWWWWWWWWWX..",
      "..XWWWWWWWWWWX..",
      "..XGGXXXXGGX....",
      "................"
    ]
  };

  // Get color map for specific class
  static getClassPalette(heroClass) {
    const P = PixelSpriteGenerator.PALETTE;
    switch (heroClass) {
      case 'KNIGHT':
        return {
          'X': P.BLACK,
          'C': P.STEEL_BLUE,
          'L': P.SHINING_BLUE,
          'W': P.WHITE,
          'G': P.GOLD,
          'B': P.DARK_GRAY,
          'S': P.SKIN,
          'R': P.RED
        };
      case 'MAGE':
        return {
          'X': P.BLACK,
          'C': P.PURPLE,
          'L': P.BRIGHT_PURPLE,
          'W': P.CYAN,
          'G': P.GOLD,
          'B': P.LEATHER_BROWN,
          'S': P.SKIN,
          'R': P.RED
        };
      case 'ROGUE':
        return {
          'X': P.BLACK,
          'C': P.DARK_GRAY,
          'L': P.LIGHT_GRAY,
          'W': P.WHITE,
          'G': P.DARK_GOLD,
          'B': P.BLACK,
          'S': P.DARK_SKIN,
          'R': P.RED
        };
      case 'ARCHER':
        return {
          'X': P.BLACK,
          'C': P.FOREST_GREEN,
          'L': P.LIGHT_GREEN,
          'W': P.WHITE,
          'G': P.GOLD,
          'B': P.LEATHER_BROWN,
          'S': P.SKIN,
          'R': P.RED
        };
      case 'CLERIC':
        return {
          'X': P.BLACK,
          'C': P.WHITE,
          'L': P.GOLD,
          'W': P.WHITE,
          'G': P.GOLD,
          'B': P.DARK_GOLD,
          'S': P.SKIN,
          'R': P.RED
        };
      default:
        return {
          'X': P.BLACK,
          'C': P.LIGHT_GRAY,
          'L': P.WHITE,
          'W': P.WHITE,
          'G': P.GOLD,
          'B': P.DARK_GRAY,
          'S': P.SKIN,
          'R': P.RED
        };
    }
  }

  // Draw and return a cached sprite canvas scaled to target pixel size
  getSprite(heroClass, starLevel = 1, frame = 'idle', isEnemy = false) {
    const cacheKey = `${heroClass}_${starLevel}_${frame}_${isEnemy}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const template = PixelSpriteGenerator.TEMPLATES[heroClass] || PixelSpriteGenerator.TEMPLATES.KNIGHT;
    const palette = PixelSpriteGenerator.getClassPalette(heroClass);

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Render 16x16 pixel grid
    for (let y = 0; y < 16; y++) {
      const row = template[y];
      if (!row) continue;
      for (let x = 0; x < 16; x++) {
        const char = row[x];
        if (char === '.' || !char) continue;

        let color = palette[char] || PixelSpriteGenerator.PALETTE.WHITE;

        // If enemy, give slight crimson tint to armor/clothes
        if (isEnemy && (char === 'C' || char === 'L')) {
          color = heroClass === 'KNIGHT' ? '#782828' : (heroClass === 'MAGE' ? '#8a1f64' : color);
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    this.cache.set(cacheKey, canvas);
    return canvas;
  }

  // Render a projectile onto canvas
  drawProjectile(ctx, type, startX, startY, currentX, currentY, progress) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (type === 'ARROW') {
      const angle = Math.atan2(currentY - startY, currentX - startX);
      ctx.translate(currentX, currentY);
      ctx.rotate(angle);
      // Pixel arrow
      ctx.fillStyle = '#784212';
      ctx.fillRect(-8, -1, 12, 2);
      ctx.fillStyle = '#fcfcfc';
      ctx.fillRect(4, -2, 4, 4);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(-10, -2, 3, 4);
    } else if (type === 'FIREBALL') {
      ctx.translate(currentX, currentY);
      // Pulsing pixel fire
      const pulse = Math.sin(Date.now() / 60) * 2;
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-6 - pulse / 2, -6 - pulse / 2, 12 + pulse, 12 + pulse);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -2, 4, 4);
    } else if (type === 'LIGHTNING') {
      // Chain lightning bolt
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      const midX = (startX + currentX) / 2 + (Math.random() - 0.5) * 16;
      const midY = (startY + currentY) / 2 + (Math.random() - 0.5) * 16;
      ctx.lineTo(midX, midY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    } else if (type === 'HOLY') {
      ctx.translate(currentX, currentY);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
  }
}

export const spriteGen = new PixelSpriteGenerator();
