let ctx = null;
let master = null;
let bgmTimer = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.25, slideTo = null, delay = 0) {
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur = 0.15, vol = 0.25, cutoff = 800) {
  const c = ac();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start();
}

export const sfx = {
  punch() { noise(0.12, 0.3, 900); tone(160, 0.12, 'square', 0.14, 80); },
  punchHeavy() { noise(0.18, 0.42, 550); tone(110, 0.22, 'square', 0.22, 45); tone(320, 0.1, 'sine', 0.12, 90); },
  swing() { noise(0.14, 0.22, 3200); tone(650, 0.14, 'sine', 0.1, 1500); },
  shoot() { noise(0.07, 0.32, 1600); tone(230, 0.09, 'square', 0.16, 55); },
  hit() { tone(280, 0.1, 'square', 0.18, 140); },
  kill() { tone(500, 0.28, 'sine', 0.22, 110); noise(0.2, 0.18, 500); },
  jump() { tone(260, 0.18, 'sine', 0.18, 520); },
  land() { noise(0.08, 0.12, 400); },
  pickup() { tone(880, 0.09, 'sine', 0.18); tone(1320, 0.14, 'sine', 0.18, null, 0.07); },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.2, null, i * 0.09)); },
  hurt() { tone(200, 0.16, 'sawtooth', 0.14, 90); }
};

const BGM_SEQ = [392, 440, 523, 587, 659, 587, 523, 440, 392, 523, 440, 349];

export function startBgm() {
  if (bgmTimer) return;
  ac();
  let i = 0;
  bgmTimer = setInterval(() => {
    const f = BGM_SEQ[i % BGM_SEQ.length];
    tone(f / 2, 1.1, 'triangle', 0.05);
    if (i % 4 === 0) tone(f / 4, 2.0, 'sine', 0.035);
    i++;
  }, 620);
}

export function initAudio() {
  const unlock = () => {
    startBgm();
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
}
