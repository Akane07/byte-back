import { deflateSync } from 'zlib';

/**
 * Минимальный растровый холст с кодированием в PNG — чтобы сгенерировать
 * картинки для тестовых данных без внешних библиотек.
 */

export type Rgb = [number, number, number];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export class Canvas {
  private readonly px: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.px = new Float32Array(width * height * 3);
  }

  /** Линейный градиент под углом (в градусах) через несколько цветов. */
  gradient(stops: Rgb[], angle = 135) {
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const proj = (x: number, y: number) => x * dx + y * dy;
    const corners = [
      proj(0, 0),
      proj(this.width, 0),
      proj(0, this.height),
      proj(this.width, this.height),
    ];
    const min = Math.min(...corners);
    const span = Math.max(...corners) - min;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const t = ((proj(x, y) - min) / span) * (stops.length - 1);
        const i = Math.min(Math.floor(t), stops.length - 2);
        const f = t - i;
        const o = (y * this.width + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          this.px[o + ch] = mix(stops[i][ch], stops[i + 1][ch], f);
        }
      }
    }
    return this;
  }

  private blend(x: number, y: number, color: Rgb, alpha: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) {
      return;
    }
    const o = (y * this.width + x) * 3;
    for (let ch = 0; ch < 3; ch++) {
      this.px[o + ch] = mix(this.px[o + ch], color[ch], Math.min(alpha, 1));
    }
  }

  /** Круг; softness > 0 — размытый край (световое пятно). */
  circle(cx: number, cy: number, r: number, color: Rgb, alpha = 1, softness = 1.5) {
    const reach = r + softness;
    for (let y = Math.floor(cy - reach); y <= cy + reach; y++) {
      for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const edge = Math.max(0, Math.min(1, (reach - d) / (softness * 2)));
        this.blend(x, y, color, alpha * edge);
      }
    }
    return this;
  }

  /** Прямоугольник со скруглёнными углами. */
  rect(x: number, y: number, w: number, h: number, color: Rgb, alpha = 1, radius = 0) {
    const r = Math.min(radius, w / 2, h / 2);
    for (let py = Math.floor(y); py < y + h; py++) {
      for (let px = Math.floor(x); px < x + w; px++) {
        // Расстояние до скруглённого угла — со сглаживанием края.
        const cx = Math.max(x + r - px, 0, px - (x + w - r));
        const cy = Math.max(y + r - py, 0, py - (y + h - r));
        const cover = r > 0 ? Math.max(0, Math.min(1, r - Math.hypot(cx, cy) + 0.5)) : 1;
        this.blend(px, py, color, alpha * cover);
      }
    }
    return this;
  }

  toPng() {
    const { width, height } = this;
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
      const row = y * (width * 3 + 1);
      raw[row] = 0; // фильтр строки: без фильтра
      for (let i = 0; i < width * 3; i++) {
        raw[row + 1 + i] = Math.round(Math.max(0, Math.min(255, this.px[y * width * 3 + i])));
      }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // бит на канал
    header[9] = 2; // RGB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// --- Готовые сюжеты -------------------------------------------------------

export const PALETTES: Rgb[][] = [
  [[131, 85, 250], [236, 110, 173], [255, 196, 140]],
  [[24, 40, 72], [52, 110, 190], [120, 220, 230]],
  [[20, 20, 30], [60, 50, 110], [200, 120, 255]],
  [[255, 150, 110], [250, 90, 120], [120, 60, 170]],
  [[30, 80, 70], [60, 170, 130], [210, 240, 170]],
  [[250, 220, 170], [240, 150, 110], [150, 70, 90]],
  [[16, 22, 40], [40, 60, 120], [255, 120, 90]],
  [[230, 235, 245], [170, 190, 230], [110, 120, 210]],
];

const WHITE: Rgb = [255, 255, 255];
const DARK: Rgb = [18, 18, 24];

/** Аватар: мягкий градиент и световое пятно. */
export function avatar(seed: number) {
  const pal = PALETTES[seed % PALETTES.length];
  const c = new Canvas(256, 256).gradient(pal, 30 + seed * 47);
  c.circle(70 + (seed * 37) % 120, 60 + (seed * 53) % 100, 90, WHITE, 0.25, 70);
  c.circle(128, 150, 58, WHITE, 0.14, 30);
  return c.toPng();
}

type Scene = 'web' | 'mobile' | 'brand' | 'dashboard' | 'abstract';

/** Обложка проекта 800×560 — схематичный макет сайта, приложения и т. п. */
export function cover(scene: Scene, seed: number) {
  const pal = PALETTES[seed % PALETTES.length];
  const W = 800;
  const H = 560;
  const c = new Canvas(W, H).gradient(pal, 120 + seed * 23);
  c.circle(W * 0.8, H * 0.2, 260, WHITE, 0.18, 200);

  if (scene === 'web') {
    c.rect(90, 70, 620, 420, WHITE, 0.92, 18);
    c.rect(90, 70, 620, 44, DARK, 0.08, 18);
    [0, 1, 2].forEach((i) => c.circle(118 + i * 20, 92, 6, pal[i], 0.9));
    c.rect(130, 150, 300, 28, DARK, 0.75, 6);
    c.rect(130, 192, 240, 14, DARK, 0.3, 5);
    c.rect(130, 216, 200, 14, DARK, 0.3, 5);
    c.rect(130, 250, 130, 38, pal[0], 1, 8);
    c.rect(470, 140, 200, 160, pal[1], 0.85, 14);
    [0, 1, 2].forEach((i) => {
      c.rect(130 + i * 185, 330, 165, 120, pal[i], 0.25, 12);
      c.rect(148 + i * 185, 410, 90, 10, DARK, 0.4, 4);
    });
  } else if (scene === 'mobile') {
    [-1, 1].forEach((side, i) => {
      const x = W / 2 + side * 130 - 105;
      const y = 60 + i * 30;
      c.rect(x, y, 210, 420, DARK, 0.9, 32);
      c.rect(x + 10, y + 10, 190, 400, WHITE, 0.95, 24);
      c.rect(x + 26, y + 40, 158, 110, pal[i + 1], 0.9, 16);
      for (let r = 0; r < 4; r++) {
        c.circle(x + 44, y + 185 + r * 52, 16, pal[r % 3], 0.8);
        c.rect(x + 70, y + 175 + r * 52, 100, 10, DARK, 0.55, 4);
        c.rect(x + 70, y + 192 + r * 52, 70, 8, DARK, 0.25, 4);
      }
    });
  } else if (scene === 'brand') {
    c.circle(W / 2, H / 2 - 20, 130, WHITE, 0.95, 1.5);
    c.circle(W / 2, H / 2 - 20, 90, pal[0], 1, 1.5);
    c.rect(W / 2 - 34, H / 2 - 64, 68, 88, WHITE, 1, 10);
    c.rect(W / 2 - 150, H - 110, 300, 18, WHITE, 0.85, 9);
    [0, 1, 2, 3].forEach((i) => c.rect(90 + i * 170, 40, 110, 24, pal[i % 3], 0.9, 12));
  } else if (scene === 'dashboard') {
    c.rect(60, 50, 680, 460, WHITE, 0.93, 16);
    c.rect(60, 50, 150, 460, DARK, 0.85, 16);
    for (let r = 0; r < 6; r++) c.rect(82, 100 + r * 44, 100, 12, WHITE, 0.35, 5);
    [0, 1, 2].forEach((i) => c.rect(236 + i * 164, 80, 144, 84, pal[i], 0.85, 12));
    for (let b = 0; b < 10; b++) {
      const h = 60 + ((seed * 31 + b * 47) % 170);
      c.rect(250 + b * 46, 470 - h, 28, h, pal[b % 3], 0.9, 6);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      c.circle(
        (seed * 97 + i * 131) % W,
        (seed * 61 + i * 89) % H,
        60 + ((seed + i * 29) % 120),
        pal[i % 3],
        0.55,
        40,
      );
    }
    c.rect(120, 380, 360, 26, WHITE, 0.9, 13);
    c.rect(120, 420, 240, 16, WHITE, 0.6, 8);
  }
  return c.toPng();
}
