#!/usr/bin/env node
// One-off palette shift for the 2026-11 redesign: green-tinted colours in a
// stylesheet are moved to the navy/slate + teal palette while keeping their
// lightness (so contrast is unchanged). Muted greens (saturation < 0.3) become
// slate/navy (hue 215); saturated greens become teal (hue 174). Other hues
// (amber warnings, reds) are untouched.
//   node scripts/recolor-css.mjs styles.css
import { readFileSync, writeFileSync } from "node:fs";

function hexToRgb(hex) {
  const h = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export function shift(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (s < 0.04 || h < 70 || h > 170) return hex; // greys, ambers, reds, blues stay
  return s < 0.3 ? hslToHex(215, Math.min(0.28, s + 0.06), l) : hslToHex(174, Math.min(0.85, s), Math.max(0.18, l - 0.04));
}

const file = process.argv[2];
if (file) {
  const css = readFileSync(file, "utf8");
  let changed = 0;
  const out = css.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => {
    const next = shift(m.toLowerCase());
    if (next !== m.toLowerCase()) changed += 1;
    return next === m.toLowerCase() ? m : next;
  });
  writeFileSync(file, out);
  console.log(`${file}: ${changed} colours shifted`);
}
