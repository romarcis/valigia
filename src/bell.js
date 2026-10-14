// A hotel-desk bell, synthesised so there is no audio file to ship.
// Desk bells ring with inharmonic partials (about 1 : 2.76 : 5.4), which is what makes them sound metallic.
export function ring() {
  try {
    const ctx = new AudioContext()
    const t0 = ctx.currentTime
    for (const [ratio, gain, decay] of [[1, 0.22, 1.8], [2.76, 0.09, 1.1], [5.4, 0.05, 0.6]]) {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.frequency.value = 1320 * ratio
      vol.gain.setValueAtTime(0, t0)
      vol.gain.linearRampToValueAtTime(gain, t0 + 0.004) // soft attack: no click
      vol.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
      osc.connect(vol).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + decay)
    }
    setTimeout(() => ctx.close(), 2200)
  } catch {
    // no audio device or API: stay silent
  }
}
