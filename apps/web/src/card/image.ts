/**
 * Draws a scorecard as a 1080x1350 PNG (a portrait social image) with the
 * page's own fonts and colours. Runs entirely in the browser.
 */
import type { CardPayload } from '@tell/shared';
import { cardSummary } from '@tell/shared';
import { RESULT_WORD, cardKicker, gradeLabel, trapName } from './text';

const W = 1080;
const H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function drawCard(p: CardPayload, verifyUrl: string, sample = false): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const paper = v('--surface', '#FBFAF7');
  const ink = v('--text', '#0B0B0C');
  const muted = v('--muted', '#6B6A66');
  const line = v('--line', '#DDD9D0');
  const accent = v('--accent', '#3D4BFF');
  const onAccent = v('--on-accent', '#FBFAF7');
  const display = v('--font-display', 'serif');
  const sans = v('--font-body', 'sans-serif');
  const mono = v('--font-mono', 'monospace');
  try {
    await Promise.all([document.fonts?.load(`italic 180px ${display}`), document.fonts?.load(`600 40px ${sans}`), document.fonts?.load(`28px ${mono}`)]);
  } catch {
    // draw with whatever is loaded
  }

  const pad = 72;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  const tag = sample ? 'SAMPLE' : p.witnessed ? 'WITNESSED' : 'BROWSER-REPORTED';
  ctx.font = `600 24px ${mono}`;
  const tw = ctx.measureText(tag).width + 32;

  // The kicker shrinks (then shortens) to fit beside the tag, so a long name never runs under it.
  ctx.fillStyle = muted;
  ctx.textBaseline = 'alphabetic';
  const room = W - pad * 2 - tw - 24;
  let kicker = cardKicker(p).toUpperCase();
  let size = 26;
  ctx.font = `600 ${size}px ${mono}`;
  while (size > 18 && ctx.measureText(kicker).width > room) {
    size -= 1;
    ctx.font = `600 ${size}px ${mono}`;
  }
  while (kicker.length > 4 && ctx.measureText(kicker).width > room) kicker = `${kicker.slice(0, -2)}\u2026`;
  ctx.fillText(kicker, pad, pad + 26);

  ctx.font = `600 24px ${mono}`;
  if (p.witnessed && !sample) {
    ctx.fillStyle = ink;
    ctx.fillRect(W - pad - tw, pad - 8, tw, 46);
    ctx.fillStyle = paper;
  } else {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(W - pad - tw + 1, pad - 7, tw - 2, 44);
    ctx.fillStyle = ink;
  }
  ctx.fillText(tag, W - pad - tw + 16, pad + 24);

  ctx.fillStyle = ink;
  ctx.font = `italic 176px ${display}`;
  ctx.fillText(gradeLabel(p), pad - 6, pad + 230);

  ctx.font = `500 38px ${sans}`;
  const summary = wrap(ctx, cardSummary(p, trapName), W - pad * 2);
  summary.slice(0, 3).forEach((l, i) => ctx.fillText(l, pad, pad + 310 + i * 50));

  const top = pad + 310 + Math.min(summary.length, 3) * 50 + 30;
  const rowH = 96;
  p.traps.forEach((t, i) => {
    const y = top + i * rowH;
    if (t.result === 'fired') {
      ctx.fillStyle = accent;
      ctx.fillRect(0, y, W, rowH);
    } else {
      ctx.fillStyle = line;
      ctx.fillRect(0, y, W, 2);
    }
    const color = t.result === 'fired' ? onAccent : ink;
    ctx.fillStyle = t.result === 'fired' ? onAccent : muted;
    ctx.font = `26px ${mono}`;
    ctx.fillText(String(i + 1).padStart(2, '0'), pad, y + 58);
    ctx.fillStyle = t.result === 'not-tested' ? muted : color;
    ctx.font = `${t.result === 'fired' ? 650 : 450} 36px ${sans}`;
    ctx.fillText(trapName(t.trap), pad + 80, y + 60);
    ctx.font = `600 24px ${mono}`;
    const word = RESULT_WORD[t.result].toUpperCase();
    ctx.fillText(word, W - pad - ctx.measureText(word).width, y + 58);
  });

  const foot = top + 7 * rowH;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, foot);
  ctx.lineTo(W, foot);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ink;
  ctx.font = `26px ${mono}`;
  ctx.fillText(sample ? 'Sample card, made up \u00B7 check it at' : 'Ed25519 signed \u00B7 check it at', pad, foot + 64);
  ctx.font = `600 26px ${mono}`;
  ctx.fillText(verifyUrl.replace(/^https?:\/\//, ''), pad, foot + 104);
  return canvas;
}

export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
