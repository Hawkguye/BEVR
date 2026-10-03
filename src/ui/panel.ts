/**
 * Wrist-menu canvas texture + desktop HUD copy.
 * Buttons: Hyperbolic / Euclidean / Spherical, tools, K slider, reset, vignette.
 */
export type ModeId = "H" | "E" | "S";

export interface PanelState {
  mode: ModeId;
  K: number;
  walkers: boolean;
  triangle: boolean;
  vignette: boolean;
  fps: number;
  instances: number;
  triangles: number;
  walkerDist: number | null;
  triText: string;
  tutorial: string;
}

export type PanelAction =
  | { type: "mode"; mode: ModeId }
  | { type: "walkers" }
  | { type: "triangle" }
  | { type: "vignette" }
  | { type: "reset" }
  | { type: "K"; K: number };

const W = 512;
const H = 512;

interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  action: PanelAction | "slider";
}

export class WristPanel {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  hits: HitRect[] = [];
  draggingK = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
  }

  draw(s: PanelState): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = "rgba(8, 10, 22, 0.92)";
    roundRect(c, 8, 8, W - 16, H - 16, 24);
    c.fill();
    c.strokeStyle = "rgba(140, 190, 255, 0.35)";
    c.lineWidth = 2;
    c.stroke();

    c.fillStyle = "#dbe7ff";
    c.font = "700 28px ui-sans-serif, system-ui, sans-serif";
    c.fillText("Beyond Euclid", 36, 52);
    c.font = "16px ui-sans-serif, system-ui, sans-serif";
    c.fillStyle = "#8aa0c8";
    c.fillText("walk the curvature", 36, 78);

    this.hits = [];
    const modes: { id: ModeId; label: string }[] = [
      { id: "H", label: "H³  hyperbolic" },
      { id: "E", label: "E³  euclidean" },
      { id: "S", label: "S³  spherical" },
    ];
    modes.forEach((m, i) => {
      const x = 32;
      const y = 100 + i * 52;
      const on = s.mode === m.id;
      button(c, x, y, 448, 44, m.label, on, modeColor(m.id));
      this.hits.push({ x, y, w: 448, h: 44, action: { type: "mode", mode: m.id } });
    });

    button(c, 32, 270, 216, 44, s.walkers ? "Walkers ON" : "Walkers", s.walkers, "#ffd36a");
    this.hits.push({ x: 32, y: 270, w: 216, h: 44, action: { type: "walkers" } });
    button(c, 264, 270, 216, 44, s.triangle ? "Triangle ON" : "Triangle", s.triangle, "#ff9ad5");
    this.hits.push({ x: 264, y: 270, w: 216, h: 44, action: { type: "triangle" } });

    c.fillStyle = "#8aa0c8";
    c.font = "15px ui-sans-serif, system-ui, sans-serif";
    c.fillText(`curvature radius K = ${s.K.toFixed(1)} m`, 36, 340);
    slider(c, 32, 352, 448, 22, (s.K - 2) / 10);
    this.hits.push({ x: 32, y: 344, w: 448, h: 38, action: "slider" });

    button(c, 32, 392, 216, 40, "Reset pose", false, "#a8b4d0");
    this.hits.push({ x: 32, y: 392, w: 216, h: 40, action: { type: "reset" } });
    button(c, 264, 392, 216, 40, s.vignette ? "Vignette ON" : "Vignette", s.vignette, "#9ad0ff");
    this.hits.push({ x: 264, y: 392, w: 216, h: 40, action: { type: "vignette" } });

    c.fillStyle = "#c5d4f5";
    c.font = "14px ui-sans-serif, system-ui, sans-serif";
    c.fillText(
      `${s.fps.toFixed(0)} FPS   ${s.instances} cells   ${(s.triangles / 1000).toFixed(0)}k tri`,
      36,
      456,
    );
    if (s.walkerDist !== null) {
      c.fillStyle = "#ffd36a";
      c.fillText(`walker distance  ${s.walkerDist.toFixed(2)} m`, 36, 478);
    }
    if (s.triText) {
      c.fillStyle = "#ff9ad5";
      c.fillText(s.triText, 36, 478 + (s.walkerDist !== null ? 18 : 0));
    }
    c.fillStyle = "#7f90b8";
    c.font = "13px ui-sans-serif, system-ui, sans-serif";
    wrapText(c, s.tutorial, 36, 500, 440, 16);
  }

  hit(u: number, v: number): PanelAction | "slider" | null {
    const x = u * W;
    const y = (1 - v) * H;
    for (const h of this.hits) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.action;
    }
    return null;
  }

  kFromU(u: number): number {
    const x = u * W;
    const t = Math.min(1, Math.max(0, (x - 32) / 448));
    return 2 + t * 10;
  }
}

function modeColor(m: ModeId): string {
  if (m === "H") return "#7ee0ff";
  if (m === "S") return "#ffb36a";
  return "#c8d4ff";
}

function button(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  on: boolean,
  color: string,
): void {
  c.fillStyle = on ? color : "rgba(255,255,255,0.06)";
  roundRect(c, x, y, w, h, 10);
  c.fill();
  if (on) {
    c.strokeStyle = "rgba(0,0,0,0.25)";
    c.stroke();
  } else {
    c.strokeStyle = color;
    c.globalAlpha = 0.5;
    c.stroke();
    c.globalAlpha = 1;
  }
  c.fillStyle = on ? "#111318" : "#e8eefc";
  c.font = "600 16px ui-sans-serif, system-ui, sans-serif";
  c.fillText(label, x + 16, y + h / 2 + 6);
}

function slider(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  c.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(c, x, y, w, h, h / 2);
  c.fill();
  c.fillStyle = "#7ee0ff";
  roundRect(c, x, y, Math.max(h, w * t), h, h / 2);
  c.fill();
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrapText(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
): void {
  if (!text) return;
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (c.measureText(test).width > maxW) {
      c.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  if (line) c.fillText(line, x, yy);
}

export function formatTriangle(m: {
  angles: [number, number, number];
  sum: number;
  extra: number;
} | null, mode: ModeId): string {
  if (!m) return mode === "E" ? "" : "place 3 points (trigger / click)";
  const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
  const sum = deg(m.sum);
  if (mode === "H") return `∠ ${deg(m.angles[0])} ${deg(m.angles[1])} ${deg(m.angles[2])}  Σ=${sum}°  deficit=${deg(m.extra)}°`;
  if (mode === "S") return `∠ ${deg(m.angles[0])} ${deg(m.angles[1])} ${deg(m.angles[2])}  Σ=${sum}°  excess=${deg(m.extra)}°`;
  return `∠ ${deg(m.angles[0])} ${deg(m.angles[1])} ${deg(m.angles[2])}  Σ=${sum}°`;
}
