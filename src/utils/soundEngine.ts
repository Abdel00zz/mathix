
export type SoundType = 'correct' | 'wrong' | 'finish' | 'click' | 'alert';

export const playSound = (type: SoundType) => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    
    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'wrong') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(200, now + 0.2);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'finish') {
        // Major Chord Arpeggio
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.02, now + i*0.1);
            g.gain.exponentialRampToValueAtTime(0.001, now + i*0.1 + 0.6);
            o.start(now + i*0.1);
            o.stop(now + i*0.1 + 0.6);
        });
    } else if (type === 'click') {
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'alert') {
        // Alarme de démarrage de séance : deux séries de trois bips aigus.
        const beep = (start: number) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'square';
            o.frequency.setValueAtTime(880, now + start);
            g.gain.setValueAtTime(0.06, now + start);
            g.gain.exponentialRampToValueAtTime(0.001, now + start + 0.18);
            o.start(now + start);
            o.stop(now + start + 0.18);
        };
        [0, 0.25, 0.5, 0.9, 1.15, 1.4].forEach(beep);
    }
  } catch {
    // Silent fail in restrictive browsers
  }
};
