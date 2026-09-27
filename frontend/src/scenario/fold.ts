import type { T } from '../i18n'
import type { Edit, ScenarioState } from './types'

export function fold(edits: Edit[]): ScenarioState {
  const blocked = new Set<number>()
  const lanes: Record<number, number> = {}
  const added: ScenarioState['added'] = {}
  const removed: ScenarioState['removed'] = {}

  for (const e of edits) {
    switch (e.type) {
      case 'block_road':
        e.wayIds.forEach((w) => blocked.add(w))
        break
      case 'unblock_road':
        e.wayIds.forEach((w) => blocked.delete(w))
        break
      case 'set_lanes':
        e.wayIds.forEach((w) => (lanes[w] = e.lanes))
        break
      case 'add_signal':
        added[e.key] = e.at
        break
      case 'remove_signal':
        if (e.key in added) delete added[e.key]
        else removed[e.key] = e.at
        break
      case 'move_signal':
        if (e.key in added) {
          added[e.key] = e.to
        } else {
          removed[e.key] = e.from
          added[e.key] = e.to
        }
        break
    }
  }
  return { blocked: [...blocked], lanes, added, removed }
}

/** Payload for the backend (app/sim/edits.py). */
export function toBackend(s: ScenarioState) {
  return {
    blocked: s.blocked,
    lanes: s.lanes,
    signals_added: Object.entries(s.added).map(([key, at]) => ({ key, at })),
    signals_removed: Object.entries(s.removed).map(([key, at]) => ({ key, at })),
  }
}

export function describeEdit(e: Edit, t: T): string {
  switch (e.type) {
    case 'block_road':
      return t('editBlock', { name: e.name })
    case 'unblock_road':
      return t('editUnblock', { name: e.name })
    case 'set_lanes':
      return e.from == null
        ? t('editLanes', { name: e.name, lanes: e.lanes })
        : t('editLanesFrom', { name: e.name, from: e.from, lanes: e.lanes })
    case 'add_signal':
      return t('editAddSignal')
    case 'remove_signal':
      return t('editRemoveSignal')
    case 'move_signal':
      return t('editMoveSignal')
  }
}
