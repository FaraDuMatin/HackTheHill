import type { Edit, ScenarioState } from './types'

export function fold(edits: Edit[]): ScenarioState {
  const blocked = new Set<number>()
  const lanes: Record<number, number> = {}
  const added: ScenarioState['added'] = {}
  const removed: ScenarioState['removed'] = {}

  for (const e of edits) {
    switch (e.type) {
      case 'block_road':
        blocked.add(e.wayId)
        break
      case 'unblock_road':
        blocked.delete(e.wayId)
        break
      case 'set_lanes':
        lanes[e.wayId] = e.lanes
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
    signals_added: Object.values(s.added),
    signals_removed: Object.values(s.removed),
  }
}

export function describeEdit(e: Edit): string {
  switch (e.type) {
    case 'block_road':
      return `Blocked ${e.name}`
    case 'unblock_road':
      return `Unblocked ${e.name}`
    case 'set_lanes':
      return `${e.name}: ${e.from} → ${e.lanes} lanes`
    case 'add_signal':
      return 'Added traffic signal'
    case 'remove_signal':
      return 'Removed traffic signal'
    case 'move_signal':
      return 'Moved traffic signal'
  }
}
