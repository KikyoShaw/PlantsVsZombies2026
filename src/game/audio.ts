import { ASSET_ROOT } from './assets';

const SOUND_NAMES = [
  'Boom', 'Eat', 'Fire', 'Lose', 'Mush', 'NewsLost', 'NotEnoughSun',
  'Pea', 'PeaHit', 'Place', 'Pole', 'Potato', 'ShieldHit', 'Sun',
] as const;
const SOUNDS = new Set<string>(SOUND_NAMES);
const MIN_INTERVAL: Readonly<Record<string, number>> = {
  Boom: 0.15, Eat: 0.16, Fire: 0.08, Lose: 0.5, Mush: 0.07,
  NewsLost: 0.25, NotEnoughSun: 0.3, Pea: 0.045, PeaHit: 0.065,
  Place: 0.07, Pole: 0.15, Potato: 0.15, ShieldHit: 0.09, Sun: 0.07,
};
const MAX_VOICES = 16;
const MAX_VOICES_PER_SOUND = 3;

interface Voice {
  name: string;
  source: AudioBufferSourceNode;
}

export class GameAudio {
  private soundEnabled = true;
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private unavailable = false;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Set<Voice>();
  private lastPlayed = new Map<string, number>();
  private generation = 0;

  get enabled(): boolean {
    return this.soundEnabled;
  }

  set enabled(value: boolean) {
    this.setEnabled(value);
  }

  unlock(): void {
    if (this.unavailable) return;
    if (!this.context) {
      try {
        if (typeof AudioContext === 'undefined') {
          this.unavailable = true;
          return;
        }
        const context = new AudioContext();
        this.context = context;
        this.output = context.createGain();
        this.output.gain.value = this.enabled ? 0.32 : 0;
        this.output.connect(context.destination);
      } catch {
        this.unavailable = true;
        return;
      }
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => { /* Sound remains optional. */ });
    }
    // Cache both successful decodes and failures: play never repeatedly fetches
    // a missing WAV and a stopped run cannot replay pending decoded effects.
    for (const name of SOUND_NAMES) void this.buffer(name);
  }

  setEnabled(value: boolean): void {
    this.soundEnabled = Boolean(value);
    if (this.output) this.output.gain.value = this.soundEnabled ? 0.32 : 0;
    if (!this.soundEnabled) this.stop();
  }

  play(name: string): void {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running' || !SOUNDS.has(name)) return;
    const now = context.currentTime;
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < (MIN_INTERVAL[name] ?? 0.08)) return;
    this.lastPlayed.set(name, now);
    const generation = this.generation;
    void this.buffer(name).then((buffer) => {
      if (!buffer || !this.enabled || generation !== this.generation ||
          context.state !== 'running' || !this.output) return;
      // Discard an effect if its initial decode completed after the action ended.
      if (context.currentTime - now > 0.35) return;
      let overlap = 0;
      for (const voice of this.voices) if (voice.name === name) overlap++;
      if (overlap >= MAX_VOICES_PER_SOUND) return;
      if (this.voices.size >= MAX_VOICES) {
        const oldest = this.voices.values().next().value as Voice | undefined;
        if (oldest) this.stopVoice(oldest);
      }
      let voice: Voice | null = null;
      try {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.output);
        voice = { name, source };
        this.voices.add(voice);
        const currentVoice = voice;
        source.onended = () => {
          this.voices.delete(currentVoice);
          source.disconnect();
        };
        source.start();
      } catch {
        if (voice) this.stopVoice(voice);
      }
    }).catch(() => { /* Audio failures must not interrupt gameplay. */ });
  }

  stop(): void {
    this.generation++;
    for (const voice of this.voices) this.stopVoice(voice);
    this.lastPlayed.clear();
  }

  private stopVoice(voice: Voice): void {
    this.voices.delete(voice);
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* It may already have ended. */ }
    voice.source.disconnect();
  }

  private buffer(name: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const context = this.context;
    if (!context) return Promise.resolve(null);
    const pending = fetch(`${ASSET_ROOT}audio/${name}.wav`)
      .then((response) => {
        if (!response.ok) throw new Error(`Cannot load ${name}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
    this.buffers.set(name, pending);
    return pending;
  }
}
