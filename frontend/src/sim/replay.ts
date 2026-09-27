/** Vehicle trajectories from the backend (see backend/app/sim/replay.py). */

export type Which = 'baseline' | 'scenario'

/** Vehicle colour by speed (km/h). Viridis: colour-blind safe, ordered by lightness. */
export const SPEED_STOPS: [number, string][] = [
  [0, '#440154'],
  [15, '#3b528b'],
  [30, '#21918c'],
  [50, '#5ec962'],
  [70, '#fde725'],
]

interface Track {
  first: number // index of the first sample
  lng: Float64Array
  lat: Float64Array
  speed: Uint8Array // km/h
}

export interface Replay {
  period: number
  end: number
  tracks: Track[]
}

const SCALE = 1e5

function decode(xs: number[]) {
  const out = new Float64Array(xs.length)
  let acc = 0
  for (let i = 0; i < xs.length; i++) {
    acc += xs[i]
    out[i] = acc / SCALE
  }
  return out
}

export async function loadReplay(jobId: string, which: Which): Promise<Replay> {
  const res = await fetch(`/api/jobs/${jobId}/replay/${which}`)
  if (!res.ok) throw new Error('Replay not available. Run the simulation again.')
  const raw: { period: number; end: number; vehicles: [number, number[], number[], number[]][] } = await res.json()
  return {
    period: raw.period,
    end: raw.end,
    tracks: raw.vehicles.map(([first, xs, ys, speeds]) => ({
      first,
      lng: decode(xs),
      lat: decode(ys),
      speed: Uint8Array.from(speeds),
    })),
  }
}

/** Vehicle positions at time t (seconds), linearly interpolated between samples. */
export function frameAt(r: Replay, t: number) {
  const features = []
  const s = t / r.period
  for (const tr of r.tracks) {
    const i = s - tr.first
    const n = tr.lng.length
    if (i < 0 || i > n - 1) continue
    const k = Math.min(Math.floor(i), n - 2)
    const f = n === 1 ? 0 : i - k
    const k1 = n === 1 ? 0 : k + 1
    features.push({
      type: 'Feature' as const,
      properties: { speed: tr.speed[k] + (tr.speed[k1] - tr.speed[k]) * f },
      geometry: {
        type: 'Point' as const,
        coordinates: [tr.lng[k] + (tr.lng[k1] - tr.lng[k]) * f, tr.lat[k] + (tr.lat[k1] - tr.lat[k]) * f],
      },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}
