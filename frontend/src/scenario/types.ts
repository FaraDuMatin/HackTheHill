export type LngLat = [number, number]

export type Edit =
  | { type: 'block_road'; wayId: number; name: string }
  | { type: 'unblock_road'; wayId: number; name: string }
  | { type: 'set_lanes'; wayId: number; name: string; from: number; lanes: number }
  | { type: 'add_signal'; key: string; at: LngLat }
  | { type: 'remove_signal'; key: string; at: LngLat }
  | { type: 'move_signal'; key: string; from: LngLat; to: LngLat }

/** Folded result of an edit list. This is what the backend receives. */
export interface ScenarioState {
  blocked: number[]
  lanes: Record<number, number>
  /** Signals added by the user (incl. moved base signals), keyed by signal key. */
  added: Record<string, LngLat>
  /** Base (OSM) signals removed or moved away, keyed by `osm:<id>`. */
  removed: Record<string, LngLat>
}

export type Selection =
  | { kind: 'road'; wayId: number; name: string; highway: string; lanes: number; oneway: boolean }
  | { kind: 'signal'; key: string; at: LngLat }

export type Mode = 'select' | 'add-signal' | 'move-signal'
