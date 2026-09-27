import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Ban, CircleCheck, CirclePlus, Minus, MousePointer2, Move, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { describeEdit } from '../scenario/fold'
import type { Edit, Mode, Selection } from '../scenario/types'

export const MIN_LANES = 1
export const MAX_LANES = 8
const ICON = 16

export interface Actions {
  toggleBlock: () => void
  setLanes: (n: number) => void
  removeSignal: () => void
  toggleMode: (m: Mode) => void
}

interface Props {
  edits: Edit[]
  selection: Selection | null
  mode: Mode
  blocked: boolean
  lanes: number
  canUndo: boolean
  canRedo: boolean
  actions: Actions
  onRemoveEdit: (index: number) => void
  onUndo: () => void
  onRedo: () => void
  onMode: (m: Mode) => void
  notice: string | null
  simPanel: ReactNode
}

const HINTS: Record<Exclude<Mode, 'select'>, string> = {
  'add-signal': 'Click an intersection to add a signal.',
  'move-signal': 'Click the new signal location.',
  'select-area': 'Drag a rectangle on the map.',
}

function Btn({ icon, label, kbd, ...rest }: { icon: ReactNode; label?: string; kbd?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} aria-keyshortcuts={kbd}>
      {icon}
      {label && <span>{label}</span>}
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  )
}

export default function Sidebar(p: Props) {
  const { selection: sel, mode, actions } = p

  return (
    <aside className="sidebar" aria-label="Scenario editor">
      <h1>Ottawa-Gatineau Sandbox</h1>

      <div className="toolbar" role="toolbar" aria-label="Tools">
        <Btn
          icon={<MousePointer2 size={ICON} />}
          label="Select"
          kbd="1"
          aria-pressed={mode === 'select'}
          onClick={() => p.onMode('select')}
        />
        <Btn
          icon={<CirclePlus size={ICON} />}
          label="Signal"
          kbd="2"
          aria-pressed={mode === 'add-signal'}
          onClick={() => actions.toggleMode('add-signal')}
        />
        <span className="spacer" />
        <Btn icon={<Undo2 size={ICON} />} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo} />
        <Btn icon={<Redo2 size={ICON} />} aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo} />
      </div>

      {mode !== 'select' && (
        <p className="hint" role="status">
          {HINTS[mode]}{' '}
          <kbd>Esc</kbd> to cancel.
        </p>
      )}

      {p.notice && (
        <p className="warn" role="alert">
          {p.notice}
        </p>
      )}

      <section aria-labelledby="sel-h">
        <h2 id="sel-h">Selection</h2>
        {!sel && <p className="muted">Click a road or signal.</p>}

        {sel?.kind === 'road' && (
          <div className="card">
            <p>
              <b>{sel.name}</b>
              {p.blocked && <span className="tag tag-blocked">blocked</span>}
            </p>
            <p className="muted">
              {sel.highway}
              {sel.oneway ? ' · one-way' : ''}
            </p>
            <div className="row">
              <Btn
                icon={p.blocked ? <CircleCheck size={ICON} /> : <Ban size={ICON} />}
                label={p.blocked ? 'Unblock' : 'Block'}
                kbd="B"
                onClick={actions.toggleBlock}
              />
            </div>
            <div className="row" role="group" aria-label="Lane count">
              <span className="row-label">Lanes</span>
              <Btn
                icon={<Minus size={ICON} />}
                aria-label="Remove a lane"
                kbd="["
                disabled={p.lanes <= MIN_LANES}
                onClick={() => actions.setLanes(p.lanes - 1)}
              />
              <output aria-live="polite">{p.lanes}</output>
              <Btn
                icon={<Plus size={ICON} />}
                aria-label="Add a lane"
                kbd="]"
                disabled={p.lanes >= MAX_LANES}
                onClick={() => actions.setLanes(p.lanes + 1)}
              />
            </div>
          </div>
        )}

        {sel?.kind === 'signal' && (
          <div className="card">
            <p>
              <b>Traffic signal</b>
              {sel.key.startsWith('new:') && <span className="tag">added</span>}
            </p>
            <div className="row">
              <Btn
                icon={<Move size={ICON} />}
                label="Move"
                kbd="M"
                aria-pressed={mode === 'move-signal'}
                onClick={() => actions.toggleMode('move-signal')}
              />
              <Btn icon={<Trash2 size={ICON} />} label="Remove" kbd="Del" onClick={actions.removeSignal} />
            </div>
            <p className="muted small">Tip: drag a signal to move it.</p>
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
              {e.by === 'ai' && (
                <span className="tag" title="Made by the AI assistant">
                  AI
                </span>
              )}
              <button className="icon" aria-label={`Revert: ${describeEdit(e)}`} title="Revert" onClick={() => p.onRemoveEdit(i)}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
      </section>

      {p.simPanel}
    </aside>
  )
}
