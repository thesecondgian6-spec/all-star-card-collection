'use client';

/* ---------------- sound (synthesized, no audio files needed) ---------------- */

let audioCtx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function isSoundEnabled() {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem('cv-sound');
  return v === null ? true : v === 'on';
}
export function setSoundEnabled(on) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('cv-sound', on ? 'on' : 'off');
}

function tone(ctx, { freq, start, duration, type = 'sine', gain = 0.18 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

/** Short blip for each card flip. */
export function playFlip() {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, { freq: 520, start: 0, duration: 0.09, type: 'triangle', gain: 0.12 });
}

/** Rarity-scaled chime: bigger pulls get a fuller, brighter arpeggio. */
export function playChime(rarity) {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  const scales = {
    common: [523.25],
    uncommon: [523.25, 659.25],
    rare: [523.25, 659.25, 783.99],
    epic: [523.25, 659.25, 783.99, 1046.5],
    legendary: [392, 523.25, 659.25, 783.99, 1046.5],
    mythic: [349.23, 440, 523.25, 659.25, 783.99, 1046.5, 1318.5],
  };
  const notes = scales[rarity] || scales.common;
  const gain = rarity === 'mythic' ? 0.22 : rarity === 'legendary' ? 0.19 : 0.14;
  notes.forEach((freq, i) => {
    tone(ctx, { freq, start: i * 0.09, duration: 0.5, type: 'sine', gain });
  });
}

/* ---------------- screen shake ---------------- */

export function screenShake(intensity = 1) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('shell') || document.body;
  el.style.animation = 'none';
  // force reflow so the animation can restart if triggered twice in a row
  void el.offsetWidth;
  el.style.animation = `cv-shake ${0.35 + intensity * 0.1}s cubic-bezier(.36,.07,.19,.97) both`;
  setTimeout(() => { el.style.animation = ''; }, 700);
}

/* ---------------- confetti (canvas, no dependency) ---------------- */

const RARITY_COLORS = {
  common: ['#8b8fa3', '#c7c9d4'],
  uncommon: ['#4ade80', '#bbf7d0'],
  rare: ['#38bdf8', '#bae6fd'],
  epic: ['#a78bfa', '#ddd6fe'],
  legendary: ['#f5b642', '#fde68a', '#e8b84b'],
  mythic: ['#f4568c', '#f0abfc', '#e8b84b', '#a78bfa'],
};

export function burstConfetti(rarity = 'rare') {
  if (typeof document === 'undefined') return;
  const colors = RARITY_COLORS[rarity] || RARITY_COLORS.rare;
  const count = { common: 0, uncommon: 18, rare: 30, epic: 50, legendary: 90, mythic: 140 }[rarity] ?? 30;
  if (count === 0) return;

  let canvas = document.getElementById('cv-confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'cv-confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;width:100vw;height:100vh;';
    document.body.appendChild(canvas);
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const particles = Array.from({ length: count }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: window.innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 9 - 3,
    size: 5 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    vrot: (Math.random() - 0.5) * 14,
    life: 0,
  }));

  let frame = 0;
  const maxFrames = 110;
  function step() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.vy += 0.22; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, 1 - frame / maxFrames);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (frame < maxFrames) {
      requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(step);
}

/** Convenience: play the right combo of effects for a given rarity reveal. */
export function celebrateRarity(rarity) {
  playChime(rarity);
  if (rarity === 'legendary' || rarity === 'mythic') {
    screenShake(rarity === 'mythic' ? 2 : 1);
  }
  if (rarity !== 'common') burstConfetti(rarity);
}
