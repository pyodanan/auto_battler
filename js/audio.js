// 8-bit Retro Audio Synthesizer using Web Audio API
// Fully self-contained, no external audio files required!

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // Play a short retro tone
  playTone(freq, type = 'square', duration = 0.1, gainVal = 0.1, pitchDecay = 0) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    const now = this.ctx.currentTime;

    osc.frequency.setValueAtTime(freq, now);
    if (pitchDecay !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + pitchDecay), now + duration);
    }

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  // White noise generator for physical impact / arrows
  playNoise(duration = 0.1, gainVal = 0.08) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
  }

  playAttack(heroClass) {
    this.init();
    switch (heroClass) {
      case 'KNIGHT':
        this.playTone(180, 'triangle', 0.12, 0.12, -80);
        break;
      case 'MAGE':
        this.playTone(520, 'sine', 0.18, 0.09, 220);
        break;
      case 'ROGUE':
        this.playTone(320, 'sawtooth', 0.08, 0.08, -120);
        break;
      case 'ARCHER':
        this.playNoise(0.09, 0.06);
        this.playTone(400, 'square', 0.08, 0.04, 300);
        break;
      case 'CLERIC':
        this.playTone(440, 'sine', 0.15, 0.08, 80);
        break;
      default:
        this.playTone(220, 'square', 0.1, 0.08);
    }
  }

  playSkill(heroClass) {
    this.init();
    if (this.muted || !this.ctx) return;

    switch (heroClass) {
      case 'KNIGHT': // Heavy shield slam
        this.playTone(120, 'square', 0.25, 0.2, -70);
        this.playNoise(0.18, 0.1);
        break;
      case 'MAGE': // Magic explosion
        this.playTone(600, 'sawtooth', 0.35, 0.15, -400);
        setTimeout(() => this.playNoise(0.2, 0.12), 80);
        break;
      case 'ROGUE': // Quick multi-slice
        this.playTone(480, 'sawtooth', 0.08, 0.1, -200);
        setTimeout(() => this.playTone(580, 'sawtooth', 0.08, 0.1, -250), 60);
        setTimeout(() => this.playTone(680, 'sawtooth', 0.08, 0.1, -300), 120);
        break;
      case 'ARCHER': // Piercing arrow
        this.playTone(700, 'square', 0.25, 0.12, 400);
        this.playNoise(0.15, 0.08);
        break;
      case 'CLERIC': // Holy divine heal chime
        this.playTone(523.25, 'sine', 0.2, 0.12); // C5
        setTimeout(() => this.playTone(659.25, 'sine', 0.2, 0.12), 80); // E5
        setTimeout(() => this.playTone(783.99, 'sine', 0.3, 0.12), 160); // G5
        setTimeout(() => this.playTone(1046.50, 'sine', 0.4, 0.15), 240); // C6
        break;
    }
  }

  playHit() {
    this.init();
    this.playTone(140, 'triangle', 0.08, 0.1, -60);
  }

  playCrit() {
    this.init();
    this.playTone(600, 'sawtooth', 0.12, 0.15, -300);
  }

  playBuy() {
    this.init();
    this.playTone(659.25, 'sine', 0.08, 0.08);
    setTimeout(() => this.playTone(880, 'sine', 0.12, 0.1), 70);
  }

  playReroll() {
    this.init();
    this.playTone(350, 'triangle', 0.06, 0.08, 100);
    setTimeout(() => this.playTone(450, 'triangle', 0.08, 0.08, -50), 60);
  }

  playCombine() {
    this.init();
    // Ascending power arpeggio
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'square', 0.15, 0.12);
      }, idx * 75);
    });
  }

  playRoundWin() {
    this.init();
    const fan = [523.25, 659.25, 783.99, 1046.50];
    fan.forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'square', 0.18, 0.12), i * 90);
    });
  }

  playRoundLoss() {
    this.init();
    const loss = [400, 360, 320, 240];
    loss.forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sawtooth', 0.22, 0.1), i * 110);
    });
  }

  playDeploy() {
    this.init();
    this.playTone(280, 'sine', 0.08, 0.09, 120);
    setTimeout(() => this.playTone(420, 'triangle', 0.1, 0.09), 50);
  }

  playDrop() {
    this.init();
    this.playTone(320, 'triangle', 0.06, 0.07, -80);
  }
}

export const sound = new SoundEngine();
