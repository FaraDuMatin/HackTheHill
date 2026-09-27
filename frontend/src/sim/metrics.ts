import type { Key, T } from '../i18n'
import { describeEdit } from '../scenario/fold'
import type { Edit } from '../scenario/types'
import type { Metrics, Skipped } from './api'

export type Row = {
  label: Key
  get: (m: Metrics) => number | null
  fmt: (v: number, t: T) => string
  higherIsBetter?: boolean
  hint?: Key
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export const ROWS: Row[] = [
  { label: 'mAvgTravel', get: (m) => m.avg_travel_time_s, fmt: mmss },
  { label: 'mDelay', get: (m) => m.total_delay_s / 3600, fmt: (v, t) => `${v.toFixed(0)} ${t('vehH')}` },
  { label: 'mNotCompleted', get: (m) => m.not_completed, fmt: String },
  { label: 'mCompleted', get: (m) => m.throughput, fmt: String, higherIsBetter: true },
  { label: 'mMaxQueue', get: (m) => m.max_queue_vehicles, fmt: (v, t) => `${v} ${t('veh')}` },
  { label: 'mStuck', get: (m) => m.teleports, fmt: String, hint: 'mStuckHint' },
]

/** Change between before and after: text, and whether it is an improvement. */
export function delta(row: Row, before: number | null, after: number | null) {
  if (before == null || after == null) return null
  const diff = after - before
  if (Math.abs(diff) < 1e-9) return { text: null, better: null, up: false }
  const pct = before ? (diff / before) * 100 : 0
  const pctText = Math.abs(pct) < 1 ? pct.toFixed(1) : pct.toFixed(0)
  const text = before ? `${pct > 0 ? '+' : ''}${pctText}%` : `${diff > 0 ? '+' : ''}${diff}`
  return { text, better: row.higherIsBetter ? diff > 0 : diff < 0, up: diff > 0 }
}

/** One line per edit that had no effect. A road edit counts only if none of its ways applied. */
export function notApplied(skipped: Skipped[], edits: Edit[], t: T): string[] {
  const out = new Set<string>()
  const line = (e: Edit, s: Skipped) => `${describeEdit(e, t)}: ${t(`reason_${s.code}` as Key)}`
  for (const e of edits) {
    if (e.type === 'unblock_road') continue
    if ('wayIds' in e) {
      const kind = e.type === 'set_lanes' ? 'lanes' : 'block'
      const hits = skipped.filter((s) => s.kind === kind && e.wayIds.includes(s.way_id!))
      if (hits.length && hits.length >= e.wayIds.length) out.add(line(e, hits[0]))
    } else {
      const hit = skipped.find((s) => s.key === e.key)
      if (hit) out.add(line(e, hit))
    }
  }
  return [...out]
}

