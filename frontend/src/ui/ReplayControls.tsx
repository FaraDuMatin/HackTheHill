import { useEffect, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { Loader2, Pause, Play } from 'lucide-react'
import { frameAt, loadReplay, SPEED_STOPS, type Replay, type Which } from '../sim/replay'
import { useI18n } from '../i18n'

const SPEEDS = [10, 30, 60, 120]
const FRAME_MS = 33 // ~30 fps map updates

const hms = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

interface Props {
  map: maplibregl.Map | null
  jobId: string
}

export default function ReplayControls({ map, jobId }: Props) {
  const { t: tr } = useI18n()
  const [which, setWhich] = useState<Which>('scenario')
  const [replay, setReplay] = useState<Replay | null>(null)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(30)
  const [t, setT] = useState(0)
  const cache = useRef(new Map<string, Replay>())

  // Load (or reuse) the selected run's trajectories.
  useEffect(() => {
    const key = `${jobId}:${which}`
    const hit = cache.current.get(key)
    if (hit) return setReplay(hit)
    let alive = true
    setReplay(null)
    setError(false)
    loadReplay(jobId, which)
      .then((r) => {
        cache.current.set(key, r)
        if (alive) setReplay(r)
      })
      .catch(() => alive && setError(true))
    return () => void (alive = false)
  }, [jobId, which])

  // Draw the current frame.
  useEffect(() => {
    const src = map?.getSource('vehicles') as maplibregl.GeoJSONSource | undefined
    if (src && replay) src.setData(frameAt(replay, t))
  }, [map, replay, t])

  // Clear vehicles when the controls go away.
  useEffect(() => {
    return () => {
      const src = map?.getSource('vehicles') as maplibregl.GeoJSONSource | undefined
      src?.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [map])

  // Playback loop.
  useEffect(() => {
    if (!playing || !replay) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      if (now - last >= FRAME_MS) {
        const dt = ((now - last) / 1000) * speed
        last = now
        setT((cur) => {
          const next = cur + dt
          if (next >= replay.end) {
            setPlaying(false)
            return replay.end
          }
          return next
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, replay, speed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      e.preventDefault()
      setPlaying((p) => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const end = replay?.end ?? 0

  return (
    <div className="replay" aria-labelledby="replay-h">
      <h3 id="replay-h">{tr('replay')}</h3>
      <div className="segmented" role="radiogroup" aria-label={tr('whichRun')}>
        {(['baseline', 'scenario'] as Which[]).map((w) => (
          <button key={w} role="radio" aria-checked={which === w} onClick={() => setWhich(w)}>
            {w === 'baseline' ? tr('before') : tr('after')}
          </button>
        ))}
      </div>

      {error && <p className="warn small">{tr('replayMissing')}</p>}

      <div className="row">
        <button
          className="primary"
          onClick={() => {
            if (t >= end) setT(0)
            setPlaying((p) => !p)
          }}
          disabled={!replay}
          aria-keyshortcuts="P"
        >
          {!replay && !error ? <Loader2 size={16} className="spin" /> : playing ? <Pause size={16} /> : <Play size={16} />}
          <span>{playing ? tr('pause') : tr('play')}</span>
          <kbd>P</kbd>
        </button>
        <label className="small">
          {tr('speed')}{' '}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        type="range"
        className="timeline"
        min={0}
        max={end}
        step={1}
        value={t}
        disabled={!replay}
        onChange={(e) => setT(Number(e.target.value))}
        aria-label={tr('simTime')}
        aria-valuetext={hms(t)}
      />
      <p className="small muted">
        {hms(t)} / {hms(end)}
      </p>

      <div className="legend small">
        <span>{tr('speedLegend')}</span>
        {SPEED_STOPS.map(([v, c], i) => (
          <span key={v} className="legend-item">
            <span className="swatch" style={{ background: c }} />
            {i === 0 ? tr('stopped') : i === SPEED_STOPS.length - 1 ? `${v}+` : v}
          </span>
        ))}
        <span>km/h</span>
      </div>
    </div>
  )
}
