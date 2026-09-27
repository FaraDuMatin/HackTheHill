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

export function describeEdit(e: Edit): string {
  switch (e.type) {
    case 'block_road':
      return `Blocked ${e.name}`
    case 'unblock_road':
      return `Unblocked ${e.name}`
    case 'set_lanes':
      return e.from == null ? `${e.name}: ${e.lanes} lanes` : `${e.name}: ${e.from} → ${e.lanes} lanes`
    case 'add_signal':
      return 'Added traffic signal'
    case 'remove_signal':
      return 'Removed traffic signal'
    case 'move_signal':
      return 'Moved traffic signal'
  }
}
