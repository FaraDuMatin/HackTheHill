import { describeEdit } from '../scenario/fold'
import type { Edit, Mode, ScenarioState, Selection } from '../scenario/types'

const MIN_LANES = 1
const MAX_LANES = 8

interface Props {
  edits: Edit[]
  state: ScenarioState
  selection: Selection | null
  mode: Mode
  canUndo: boolean
  canRedo: boolean
  onApply: (e: Edit) => void
  onRemoveEdit: (index: number) => void
  onUndo: () => void
  onRedo: () => void
  onMode: (m: Mode) => void
}

export default function Sidebar(p: Props) {
  const { selection: sel, state, mode } = p

  return (
    <aside className="sidebar" aria-label="Scenario editor">
      <h1>Ottawa-Gatineau Sandbox</h1>

      <div className="toolbar" role="toolbar" aria-label="Edit tools">
        <button
          aria-pressed={mode === 'add-signal'}
          onClick={() => p.onMode(mode === 'add-signal' ? 'select' : 'add-signal')}
        >
          + Signal
        </button>
        <button onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Y)">
          Redo
        </button>
      </div>

      {mode !== 'select' && (
        <p className="hint" role="status">
          {mode === 'add-signal' ? 'Click an intersection to add a signal.' : 'Click the new signal location.'} Esc to
          cancel.
        </p>
      )}

      <section aria-labelledby="sel-h">
        <h2 id="sel-h">Selection</h2>
        {!sel && <p className="muted">Click a road or signal.</p>}

        {sel?.kind === 'road' && <RoadPanel sel={sel} state={state} onApply={p.onApply} />}

        {sel?.kind === 'signal' && (
          <div>
            <p>
              <b>Traffic signal</b>
              {sel.key.startsWith('new:') && <span className="tag">added</span>}
            </p>
            <div className="row">
              <button aria-pressed={mode === 'move-signal'} onClick={() => p.onMode(mode === 'move-signal' ? 'select' : 'move-signal')}>
                Move
              </button>
              <button onClick={() => p.onApply({ type: 'remove_signal', key: sel.key, at: sel.at })}>Remove</button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="edits-h">
        <h2 id="edits-h">Edits ({p.edits.length})</h2>
        {!p.edits.length && <p className="muted">No edits yet.</p>}
        <ol className="edits">
          {p.edits.map((e, i) => (
            <li key={i}>
              <span>{describeEdit(e)}</span>
              <button className="icon" aria-label={`Revert: ${describeEdit(e)}`} onClick={() => p.onRemoveEdit(i)}>
                ×
              </button>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}

function RoadPanel({ sel, state, onApply }: { sel: Extract<Selection, { kind: 'road' }>; state: ScenarioState; onApply: (e: Edit) => void }) {
  const blocked = state.blocked.includes(sel.wayId)
  const lanes = state.lanes[sel.wayId] ?? sel.lanes
  const setLanes = (n: number) => onApply({ type: 'set_lanes', wayId: sel.wayId, name: sel.name, from: lanes, lanes: n })

  return (
    <div>
      <p>
        <b>{sel.name}</b>
        {blocked && <span className="tag tag-blocked">blocked</span>}
      </p>
      <p className="muted">
        {sel.highway}
        {sel.oneway ? ' · one-way' : ''}
      </p>
      <div className="row">
        <button
          onClick={() => onApply({ type: blocked ? 'unblock_road' : 'block_road', wayId: sel.wayId, name: sel.name })}
        >
          {blocked ? 'Unblock' : 'Block'}
        </button>
      </div>
      <div className="row" role="group" aria-label="Lane count">
        <span>Lanes</span>
        <button aria-label="Remove a lane" disabled={lanes <= MIN_LANES} onClick={() => setLanes(lanes - 1)}>
          −
        </button>
        <output aria-live="polite">{lanes}</output>
        <button aria-label="Add a lane" disabled={lanes >= MAX_LANES} onClick={() => setLanes(lanes + 1)}>
          +
        </button>
      </div>
    </div>
  )
}
