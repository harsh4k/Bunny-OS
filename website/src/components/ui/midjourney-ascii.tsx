"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = " .:-=+*#%@";

export type StageConfig = {
  rows: number;
  ink: string;
  logoColor: string;
  bg: string;
  text: string;
  speed: number;
  swirl: number;
  density: number;
  zoom: number;
};

export const DEFAULT_STAGE: StageConfig = {
  rows: 44,
  ink: "#d4bc94",
  logoColor: "#eef0f4",
  bg: "#0e0f12",
  text: "BUNNY OS",
  speed: 1,
  swirl: 1,
  density: 0.55,
  zoom: 1,
};

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function wordMask(text: string, cols: number, rows: number) {
  const letters = text.toUpperCase().split("");
  const glyphW = 5;
  const glyphH = 7;
  const gap = 1;
  const totalW = letters.length * (glyphW + gap) - gap;
  const scale = Math.max(1, Math.floor((cols * 0.8) / Math.max(totalW, 1)));
  const pxW = totalW * scale;
  const pxH = glyphH * scale;
  const ox = Math.floor((cols - pxW) / 2);
  const oy = Math.floor((rows - pxH) / 2);
  const mask = new Set<string>();
  letters.forEach((ch, li) => {
    const g = FONT[ch] ?? FONT[" "];
    for (let y = 0; y < glyphH; y++) {
      for (let x = 0; x < glyphW; x++) {
        if (g[y][x] === "1") {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const cx = ox + li * (glyphW + gap) * scale + x * scale + sx;
              const cy = oy + y * scale + sy;
              mask.add(`${cx},${cy}`);
            }
          }
        }
      }
    }
  });
  return mask;
}

export function useSwirlStage(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  cfg: React.MutableRefObject<StageConfig>,
  onFail?: () => void,
) {
  const startRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onFail?.();
      return;
    }

    let raf = 0;
    let running = true;

    const render = (now: number) => {
      if (!running) return;
      const c = cfg.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) {
        raf = requestAnimationFrame(render);
        return;
      }
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, w, h);

      const rows = c.rows;
      const cell = (h / rows) * c.zoom;
      const cols = Math.ceil(w / cell) + 2;
      const fontSize = cell * 1.2;
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const t = ((now - startRef.current) / 1000) * c.speed;
      const settle = Math.min(1, Math.max(0, (t - 2.5) / 2.5));
      const mask = wordMask(c.text, cols, rows);
      const cx = cols / 2;
      const cy = rows / 2;

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const dx = gx - cx;
          const dy = gy - cy;
          const r = Math.sqrt(dx * dx + dy * dy);
          const ang = Math.atan2(dy, dx);
          const field =
            Math.sin(ang * 3 * c.swirl + r * 0.35 - t * 2) *
            Math.cos(r * 0.25 - t);
          const swirlBright = (field + 1) / 2;
          const inWord = mask.has(`${gx},${gy}`);
          const bright = inWord
            ? Math.max(swirlBright * (1 - settle), settle)
            : swirlBright * (1 - settle * 0.85);

          if (bright < c.density * 0.4) continue;

          const gi = Math.min(
            GLYPHS.length - 1,
            Math.floor(bright * GLYPHS.length),
          );
          const glyph = GLYPHS[gi];
          if (glyph === " ") continue;

          ctx.fillStyle = inWord && settle > 0.2 ? c.logoColor : c.ink;
          ctx.globalAlpha = Math.min(1, bright * (0.5 + c.density));
          ctx.fillText(glyph, gx * cell + cell / 2, gy * cell + cell / 2);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [canvasRef, cfg, onFail]);
}

export type SwirlPlaygroundProps = Partial<StageConfig> & {
  className?: string;
};

export function SwirlPlayground(props: SwirlPlaygroundProps = {}) {
  const { className, ...stageProps } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const cfg = useRef<StageConfig>({ ...DEFAULT_STAGE, ...stageProps });

  useEffect(() => {
    cfg.current = { ...DEFAULT_STAGE, ...stageProps };
  });

  useSwirlStage(canvasRef, cfg, () => setFailed(true));

  return (
    <div
      className={className ?? "relative z-0 h-full w-full overflow-hidden"}
      style={{ backgroundColor: cfg.current.bg }}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-[13px] text-white/60">
          Canvas background unavailable in this browser.
        </div>
      ) : (
        <canvas ref={canvasRef} className="block h-full w-full" />
      )}
    </div>
  );
}

export default SwirlPlayground;
