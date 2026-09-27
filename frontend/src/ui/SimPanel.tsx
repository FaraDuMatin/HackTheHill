import { AlertTriangle, BoxSelect, Check, FileText, Loader2, Play } from 'lucide-react'
import type * as maplibregl from 'maplibre-gl'
import type { BBox } from '../sim/api'
import type { SimState } from '../sim/useSimulation'
import type { Edit } from '../scenario/types'
import { delta, notApplied, ROWS, type Row } from '../sim/metrics'
import { useI18n, type Key } from '../i18n'
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
  onExport: () => void
  map: maplibregl.Map | null
}

function Delta({ row, before, after }: { row: Row; before: number | null; after: number | null }) {
  const { t } = useI18n()
  const d = delta(row, before, after)
  if (!d) return <td>–</td>
  if (d.text == null) return <td className="delta same">{t('noChange')}</td>
  return (
    <td className={`delta ${d.better ? 'better' : 'worse'}`}>
      {d.up ? '▲' : '▼'} {d.text} <span className="sr-label">{d.better ? t('better') : t('worse')}</span>
    </td>
  )
}

export default function SimPanel(p: Props) {
  const { t } = useI18n()
  const running = p.sim.kind === 'running'
  const tooBig = p.areaKm2 != null && p.areaKm2 > p.maxKm2
  const result = p.sim.kind === 'done' ? p.sim.job.result : null
  const skippedLines = result ? notApplied(result.applied?.skipped ?? [], p.edits, t) : []

  return (
    <section aria-labelledby="sim-h">
      <h2 id="sim-h">{t('simulation')}</h2>

      <div className="row">
        <button aria-pressed={p.selectingArea} onClick={p.onSelectArea} aria-keyshortcuts="3">
          <BoxSelect size={ICON} />
          <span>{p.area ? t('changeArea') : t('selectArea')}</span>
          <kbd>3</kbd>
        </button>
        <button className="primary" onClick={p.onRun} disabled={!p.area || tooBig || running} aria-keyshortcuts="R">
          {running ? <Loader2 size={ICON} className="spin" /> : <Play size={ICON} />}
          <span>{t('run')}</span>
          <kbd>R</kbd>
        </button>
      </div>

      {p.area && p.areaKm2 != null && (
        <p className={tooBig ? 'warn' : 'muted small'}>
          {t('area', { km2: p.areaKm2.toFixed(1) })}
          {tooBig && t('areaTooBig', { max: p.maxKm2 })}
        </p>
      )}
      {!p.area && <p className="muted small">{t('areaHelp')}</p>}

      {p.sim.kind === 'running' && (
        <ol className="stages" aria-live="polite">
          {[0, 1, 2, 3, 4].map((i) => {
            const stage = p.sim.kind === 'running' ? (p.sim.job?.stage ?? 0) : 0
            const state = i < stage ? 'done' : i === stage ? 'active' : 'todo'
            return (
              <li key={i} className={state}>
                {state === 'done' ? <Check size={14} /> : state === 'active' ? <Loader2 size={14} className="spin" /> : <span className="dot" />}
                {t(`stage${i}` as Key)}
              </li>
            )
          })}
          <li className="muted small">
            {p.sim.job ? t('elapsed', { s: Math.round(p.sim.job.elapsed_s) }) : t('starting')}
          </li>
        </ol>
      )}

      {p.sim.kind === 'error' && (
        <p className="warn" role="alert">
          <AlertTriangle size={14} /> {p.sim.message}
        </p>
      )}

      {p.sim.kind === 'done' && result && (
        <div className="results">
          {p.stale && (
            <p className="warn small" role="status">
              {t('stale')}
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th scope="col">{t('metric')}</th>
                <th scope="col">{t('before')}</th>
                <th scope="col">{t('after')}</th>
                <th scope="col">{t('change')}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const b = row.get(result.baseline)
                const a = row.get(result.scenario)
                return (
                  <tr key={row.label}>
                    <th scope="row" title={row.hint && t(row.hint)}>
                      {t(row.label)}
                      {row.hint && <span aria-hidden> ⓘ</span>}
                    </th>
                    <td>{b == null ? '–' : row.fmt(b, t)}</td>
                    <td>{a == null ? '–' : row.fmt(a, t)}</td>
                    <Delta row={row} before={b} after={a} />
                  </tr>
                )
              })}
            </tbody>
          </table>

          {skippedLines.length > 0 && (
            <div className="warn small" role="status">
              <p>
                <AlertTriangle size={14} /> {t('notApplied')}
              </p>
              <ul>
                {skippedLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="row">
            <button onClick={p.onExport} disabled={p.stale} title={p.stale ? t('stale') : undefined}>
              <FileText size={ICON} />
              <span>{t('exportProposal')}</span>
            </button>
          </div>

          <ReplayControls key={p.sim.job.id} map={p.map} jobId={p.sim.job.id} />

          <p className="disclaimer small">{t('disclaimer', { trips: result.baseline.trips })}</p>
        </div>
      )}
    </section>
  )
}
