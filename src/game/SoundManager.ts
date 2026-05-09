/**
 * Procedural sound generator using Web Audio API.
 * No external audio files needed — all sounds are synthesized.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicPlaying = false;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** Play a gunshot-like sound */
  playShoot(isShotgun = false) {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Noise burst for shot
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 30);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = isShotgun ? 800 : 1500;
    noiseFilter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(isShotgun ? 0.5 : 0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.15);

    // Low thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isShotgun ? 80 : 150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(isShotgun ? 0.6 : 0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    if (isShotgun) {
      // Second delayed thump for pump-action feel
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(60, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(20, now + 0.25);
      const oscGain2 = ctx.createGain();
      oscGain2.gain.setValueAtTime(0.3, now + 0.15);
      oscGain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.connect(oscGain2);
      oscGain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.35);
    }
  }

  /** Play headshot / kill ping sound */
  playHeadshot() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Bright ping
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.25, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    // Higher harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1800, now);
    osc2.frequency.exponentialRampToValueAtTime(900, now + 0.1);
    const oscGain2 = ctx.createGain();
    oscGain2.gain.setValueAtTime(0.15, now);
    oscGain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc2.connect(oscGain2);
    oscGain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.15);
  }

  /** Play normal kill sound */
  playKill() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Explosion pop
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 25);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.2);

    // Low boom
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  private breathingPlaying = false;
  private breathingGain: GainNode | null = null;
  private breathingNodes: (AudioBufferSourceNode | OscillatorNode)[] = [];

  /** Player takes damage sound — realistic multi-tone pain grunt */
  playDamage() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const baseFreq = 150 + Math.random() * 60;

    // Vocal cord buzz — shaped sawtooth
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.35, now + 0.2);

    // Upper harmonic for throat resonance
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(baseFreq * 1.6, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.16);

    // Noise layer for breathiness of the gasp
    const nLen = Math.floor(ctx.sampleRate * 0.2);
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) {
      nData[i] = (Math.random() * 2 - 1) * Math.exp(-(i / nLen) * 8);
    }
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 480;
    filter.Q.value = 1.0;

    osc1.connect(filter);
    osc2.connect(filter);
    nSrc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    nSrc.start(now);
    osc1.stop(now + 0.28);
    osc2.stop(now + 0.28);
    nSrc.stop(now + 0.28);
  }

  /** Start realistic heavy breathing — multi-layer inhale/exhale cycle */
  startBreathing() {
    if (this.breathingPlaying) return;
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Build a realistic ~1.2s breath cycle buffer: quick inhale + slower exhale
    const cycleDuration = 1.2;
    const bufferSize = Math.floor(ctx.sampleRate * cycleDuration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const inhaleFrac = 0.35; // inhale = 35% of cycle, exhale = 65%
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      let envelope: number;
      if (t < inhaleFrac) {
        // Inhale: quick rise then sustain
        const p = t / inhaleFrac;
        envelope = Math.sin(p * Math.PI * 0.5); // smooth fast ramp up
      } else {
        // Exhale: gradual fall
        const p = (t - inhaleFrac) / (1 - inhaleFrac);
        envelope = Math.cos(p * Math.PI * 0.5) * 0.85; // gentler, slightly quieter
      }
      // Mix two noise textures — rougher (throat friction) + smoother (nasal)
      const rough = Math.random() * 2 - 1;
      const smooth = Math.sin(i * 0.04 + Math.random() * 0.5) * 0.6;
      data[i] = (rough * 0.7 + smooth * 0.3) * envelope;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = 1.1; // slightly faster for urgency

    // Dual-filter chain to shape realistic airway sound
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = "bandpass";
    lowFilter.frequency.value = 380;
    lowFilter.Q.value = 0.5;

    const highFilter = ctx.createBiquadFilter();
    highFilter.type = "highshelf";
    highFilter.frequency.value = 2000;
    highFilter.gain.value = -6; // cut harshness

    // Subtle LFO wobble on the filter for organic variation
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain);
    lfoGain.connect(lowFilter.frequency);
    lfo.start(now);

    this.breathingGain = ctx.createGain();
    this.breathingGain.gain.setValueAtTime(0.0, now);
    this.breathingGain.gain.linearRampToValueAtTime(0.22, now + 0.25);

    src.connect(lowFilter);
    lowFilter.connect(highFilter);
    highFilter.connect(this.breathingGain);
    this.breathingGain.connect(ctx.destination);
    src.start(now);

    this.breathingNodes = [src, lfo];
    this.breathingPlaying = true;
  }

  /** Immediately stop heavy breathing audio */
  stopBreathing() {
    if (!this.breathingPlaying || !this.breathingGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      this.breathingGain.gain.cancelScheduledValues(now);
      this.breathingGain.gain.setValueAtTime(this.breathingGain.gain.value, now);
      this.breathingGain.gain.linearRampToValueAtTime(0, now + 0.04);
      setTimeout(() => {
        for (const n of this.breathingNodes) {
          try { n.stop(); } catch (_) { /* */ }
        }
        this.breathingNodes = [];
        this.breathingPlaying = false;
      }, 50);
    } catch (_) {
      this.breathingPlaying = false;
    }
  }

  /** Reload sound */
  playReload() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Click/clack sequence
    const click = (delay: number, freq: number) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + delay + 0.05);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.08);
    };

    click(0, 600);
    click(0.15, 800);
    click(0.3, 700);
    click(0.5, 900);
  }

  /** Empty click */
  playEmpty() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.04);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Wave start / enemy spawn alert */
  playWaveStart() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const notes = [440, 554, 659, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.08, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
  }

  /** Weapon switch click */
  playWeaponSwitch() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Health pickup sound — bright ascending bell */
  playPickupHealth() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const notes = [523, 784, 1047]; // C5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.3);
    });
  }

  /** Exploder detonation — deep boom with rumble */
  playExplosion() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Deep thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.35);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);

    // Noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.18));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 320;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.55);
  }

  /** Exploder warning beep — rising urgency */
  playExploderBeep() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(660, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Ammo pickup — mechanical chunk-clack */
  playPickupAmmo() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    // Heavy metallic clunk
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
    // Higher click after
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(900, now + 0.08);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.12, now + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(now + 0.08);
    o2.stop(now + 0.2);
  }

  /** Game over sound */
  playGameOver() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const notes = [440, 370, 311, 220];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + i * 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.3 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 0.5);
    });
  }

  /** Start background music — a simple low-poly ambient drone */
  startMusic() {
    if (this.musicPlaying) return;
    const ctx = this.ensureCtx();
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(0, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.5);
    this.musicGain.connect(ctx.destination);

    // Two low oscillators creating a tense drone
    const freqs = [55, 82.5];
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      // Subtle vibrato
      const vibrato = ctx.createOscillator();
      vibrato.type = "sine";
      vibrato.frequency.setValueAtTime(0.5 + Math.random(), ctx.currentTime);
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.setValueAtTime(3, ctx.currentTime);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start();

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.12, ctx.currentTime);
      osc.connect(oscGain);
      oscGain.connect(this.musicGain!);
      osc.start();
      this.musicOscillators.push(osc, vibrato);
    }

    // Slow rhythmic pulse (a kick-like pulse)
    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = "sine";
    pulseOsc.frequency.setValueAtTime(40, ctx.currentTime);
    const pulseGain = ctx.createGain();
    pulseGain.gain.setValueAtTime(0, ctx.currentTime);
    // LFO for pulsing
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(1.5, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.5, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(pulseGain.gain);
    lfo.start();
    pulseOsc.connect(pulseGain);
    pulseGain.connect(this.musicGain);
    pulseOsc.start();
    this.musicOscillators.push(pulseOsc, lfo);

    this.musicPlaying = true;
  }

  /** Fade out and stop music */
  stopMusic() {
    if (!this.musicPlaying || !this.musicGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.linearRampToValueAtTime(0, now + 0.5);
    setTimeout(() => {
      for (const osc of this.musicOscillators) {
        try { osc.stop(); } catch (_) { /* already stopped */ }
      }
      this.musicOscillators = [];
      this.musicPlaying = false;
    }, 600);
  }
}

export const soundManager = new SoundManager();
