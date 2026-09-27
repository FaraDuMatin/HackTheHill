import { AlertTriangle, BoxSelect, Check, Loader2, Play } from 'lucide-react'
import type { BBox, Metrics, Skipped } from '../sim/api'
import type { SimState } from '../sim/useSimulation'
import type { Edit } from '../scenario/types'
import { describeEdit } from '../scenario/fold'
import type * as maplibregl from 'maplibre-gl'
import ReplayControls from './ReplayControls'

const ICON = 16

interface Props {
  area: BBox | null
  areaKm2: number | null
  maxKm2: number
  selectingArea: boolean
  sim: SimState
  stale: boolean
  edits: Edit[]
  onSelectArea: () => void
  onRun: () => void
  map: maplibregl.Map | null
}

type Row = { label: string; get: (m: Metrics) => number | null; fmt: (v: number) => string; higherIsBetter?: boolean; hint?: string }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

const ROWS: Row[] = [
  { label: 'Avg travel time', get: (m) => m.avg_travel_time_s, fmt: mmss },
  { label: 'Total delay', get: (m) => m.total_delay_s / 3600, fmt: (v) => `${v.toFixed(0)} veh·h` },
  { label: 'Trips not completed', get: (m) => m.not_completed, fmt: String },
  { label: 'Trips completed', get: (m) => m.throughput, fmt: String, higherIsBetter: true },
  { label: 'Max queue', get: (m) => m.max_queue_vehicles, fmt: (v) => `${v} veh` },
  {
    label: 'Stuck vehicles',
    get: (m) => m.teleports,
    fmt: String,
    hint: 'Vehicles stuck for 5 min are moved ahead by SUMO. High values mean gridlock.',
  },
]

function Delta({ row, before, after }: { row: Row; before: number | null; after: number | null }) {
  if (before == null || after == null) return <td>–</td>
  const diff = after - before
  const pct = before ? (diff / before) * 100 : 0
  if (Math.abs(diff) < 1e-9) return <td className="delta same">no change</td>
  const better = row.higherIsBetter ? diff > 0 : diff < 0
  const text = before ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` : `${diff > 0 ? '+' : ''}${diff}`
  return (
    <td className={`delta ${better ? 'better' : 'worse'}`}>
      {diff > 0 ? '▲' : '▼'} {text} <span className="sr-label">{better ? 'better' : 'worse'}</span>
    </td>
  )
}

function skippedLabel(s: Skipped, edits: Edit[]) {
  const edit = edits.find((e) =>
    s.key ? 'key' in e && e.key === s.key : 'wayId' in e && e.wayId === s.way_id,
  )
  return `${edit ? describeEdit(edit) : s.kind}: ${s.reason}`
}

export default function SimPanel(p: Props) {
  const running = p.sim.kind === 'running'
  const tooBig = p.areaKm2 != null && p.areaKm2 > p.maxKm2

  return (
    <section aria-labelledby="sim-h">
      <h2 id="sim-h">Simulation</h2>

      <div className="row">
        <button aria-pressed={p.selectingArea} onClick={p.onSelectArea} aria-keyshortcuts="3">
          <BoxSelect size={ICON} />
          <span>{p.area ? 'Change area' : 'Select area'}</span>
          <kbd>3</kbd>
        </button>
        <button className="primary" onClick={p.onRun} disabled={!p.area || tooBig || running} aria-keyshortcuts="R">
          {running ? <Loader2 size={ICON} className="spin" /> : <Play size={ICON} />}
          <span>Run</span>
          <kbd>R</kbd>
        </button>
      </div>

      {p.area && p.areaKm2 != null && (
        <p className={tooBig ? 'warn' : 'muted small'}>
          Area: {p.areaKm2.toFixed(1)} km²{tooBig && ` — max ${p.maxKm2} km². Select a smaller area.`}
        </p>
      )}
      {!p.area && <p className="muted small">Drag a rectangle on the map around the roads to simulate.</p>}

      {p.sim.kind === 'running' && (
        <ol className="stages" aria-live="polite">
          {(p.sim.job?.stages ?? ['Starting']).map((s, i) => {
            const stage = p.sim.kind === 'running' ? (p.sim.job?.stage ?? 0) : 0
            const state = i < stage ? 'done' : i === stage ? 'active' : 'todo'
            return (
              <li key={s} className={state}>
                {state === 'done' ? <Check size={14} /> : state === 'active' ? <Loader2 size={14} className="spin" /> : <span className="dot" />}
                {s}
              </li>
            )
          })}
          <li className="muted small">{p.sim.job ? `${Math.round(p.sim.job.elapsed_s)} s elapsed` : 'Starting…'}</li>
        </ol>
      )}

      {p.sim.kind === 'error' && (
        <p className="warn" role="alert">
          <AlertTriangle size={14} /> {p.sim.message}
        </p>
      )}

      {p.sim.kind === 'done' && p.sim.job.result && (
        <div className="results">
          {p.stale && (
            <p className="warn small" role="status">
              Edits changed since this run. Run again to update.
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const { baseline, scenario } = p.sim.kind === 'done' ? p.sim.job.result! : ({} as never)
                const b = row.get(baseline)
                const a = row.get(scenario)
                return (
                  <tr key={row.label}>
                    <th scope="row" title={row.hint}>
                      {row.label}
                      {row.hint && <span aria-hidden> ⓘ</span>}
                    </th>
                    <td>{b == null ? '–' : row.fmt(b)}</td>
                    <td>{a == null ? '–' : row.fmt(a)}</td>
                    <Delta row={row} before={b} after={a} />
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!!p.sim.job.result.applied?.skipped.length && (
            <div className="warn small" role="status">
              <p>
                <AlertTriangle size={14} /> Not applied:
              </p>
              <ul>
                {p.sim.job.result.applied.skipped.map((s, i) => (
                  <li key={i}>{skippedLabel(s, p.edits)}</li>
                ))}
              </ul>
            </div>
          )}

          <ReplayControls key={p.sim.job.id} map={p.map} jobId={p.sim.job.id} />

          <p className="disclaimer small">
            Synthetic traffic ({p.sim.job.result.baseline.trips} random trips, 1 h). Relative before/after comparison, not a
            real-world prediction.
          </p>
        </div>
      )}
    </section>
  )
}
