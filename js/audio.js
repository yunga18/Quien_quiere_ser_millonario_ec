// Original synthesized cues: no audio downloads, tracking, or third-party music.
export class StudioAudio {
  constructor(enabled = true) { this.enabled = enabled; this.context = null; this.loop = null; this.step = 0; }
  unlock() {
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.11 : 0;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* The game works even when the browser blocks audio. */ }
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(enabled ? 0.11 : 0, this.context.currentTime, 0.08);
  }
  note(frequency, duration = 0.35, delay = 0, volume = 0.4, type = 'sine') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const time = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain); gain.connect(this.master);
    oscillator.start(time); oscillator.stop(time + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  cue(type) {
    this.unlock();
    const notes = {
      start: [196, 246.94, 293.66, 392],
      select: [246.94, 293.66],
      correct: [392, 493.88, 587.33, 783.99],
      milestone: [392, 493.88, 587.33, 783.99, 987.77, 1174.66],
      wrong: [196, 185, 146.83, 123.47],
      lifeline: [440, 587.33, 440],
      retired: [293.66, 392, 493.88],
    }[type];
    if (type === 'lock') {
      for (let i = 0; i < 8; i++) this.note(i % 2 ? 185 : 196, 0.22, i * 0.22, 0.45, 'triangle');
    } else if (notes) notes.forEach((frequency, i) => this.note(frequency, 0.65, i * 0.14, 0.55, 'triangle'));
  }
  startAmbience() {
    this.stopAmbience();
    this.unlock();
    const phrase = () => {
      if (document.hidden) return;
      const bass = [73.42, 65.41, 58.27, 65.41][this.step++ % 4];
      this.note(bass, 3.6, 0, 0.2);
      this.note(bass * 2, 2.5, 0.8, 0.07);
      this.note(bass * 3, 2, 1.8, 0.035);
    };
    phrase(); this.loop = window.setInterval(phrase, 4000);
  }
  stopAmbience() { window.clearInterval(this.loop); this.loop = null; }
}

export function speak(text, enabled) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  if (!enabled) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-EC'; utterance.rate = 0.96;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang === 'es-EC') || voices.find(v => v.lang.startsWith('es'));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}
