import { useSettingsStore } from '../store/settingsStore'

type Note = {
  freq: number
  at: number
  dur: number
  type?: OscillatorType
  gain?: number
  endFreq?: number
}

let ctx: AudioContext | null = null

const getContext = () => {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const play = (notes: Note[]) => {
  if (!useSettingsStore.getState().soundOn) return
  const ac = getContext()
  const now = ac.currentTime

  for (const n of notes) {
    const start = now + n.at
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.setValueAtTime(n.freq, start)
    if (n.endFreq) osc.frequency.exponentialRampToValueAtTime(n.endFreq, start + n.dur)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(n.gain ?? 0.15, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(start)
    osc.stop(start + n.dur + 0.02)
  }
}

export const sounds = {
  click: () => play([{ freq: 880, at: 0, dur: 0.05, type: 'square', gain: 0.05 }]),

  tick: () => play([{ freq: 1200, at: 0, dur: 0.03, type: 'triangle', gain: 0.07 }]),

  spin: (seconds: number) => {
    const notes: Note[] = []
    let t = 0
    while (t < seconds) {
      notes.push({ freq: 1600, at: t, dur: 0.02, type: 'square', gain: 0.04 })
      const progress = t / seconds
      t += 0.04 + 0.22 * progress * progress
    }
    play(notes)
  },

  start: () => play([{ freq: 330, at: 0, dur: 0.3, type: 'triangle', endFreq: 660, gain: 0.12 }]),

  correct: () =>
    play([
      { freq: 523.25, at: 0, dur: 0.18, type: 'triangle', gain: 0.14 },
      { freq: 659.25, at: 0.09, dur: 0.18, type: 'triangle', gain: 0.14 },
      { freq: 783.99, at: 0.18, dur: 0.18, type: 'triangle', gain: 0.14 },
      { freq: 1046.5, at: 0.27, dur: 0.4, type: 'triangle', gain: 0.14 },
    ]),

  wrong: () =>
    play([{ freq: 220, at: 0, dur: 0.35, type: 'sawtooth', endFreq: 110, gain: 0.08 }]),

  timeout: () =>
    play([
      { freq: 440, at: 0, dur: 0.2, type: 'triangle', gain: 0.12 },
      { freq: 330, at: 0.2, dur: 0.35, type: 'triangle', gain: 0.12 },
    ]),

  win: () =>
    play([
      { freq: 523.25, at: 0, dur: 0.15, type: 'triangle', gain: 0.14 },
      { freq: 659.25, at: 0.15, dur: 0.15, type: 'triangle', gain: 0.14 },
      { freq: 783.99, at: 0.3, dur: 0.15, type: 'triangle', gain: 0.14 },
      { freq: 1046.5, at: 0.45, dur: 0.7, type: 'triangle', gain: 0.16 },
    ]),
}
