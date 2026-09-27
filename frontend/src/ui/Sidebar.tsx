import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Ban, CircleCheck, CirclePlus, Keyboard, Minus, MousePointer2, Move, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { describeEdit } from '../scenario/fold'
import type { Edit, Mode, Selection } from '../scenario/types'
import { useI18n, type Key } from '../i18n'

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
  onShortcuts: () => void
  notice: Key | null
  simPanel: ReactNode
}

const HINTS: Record<Exclude<Mode, 'select'>, Key> = {
  'add-signal': 'hintAddSignal',
  'move-signal': 'hintMoveSignal',
  'select-area': 'hintSelectArea',
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
  const { t, lang, setLang } = useI18n()

  return (
    <aside className="sidebar" aria-label={t('editor')}>
      <header className="sidebar-head">
        <h1>{t('appTitle')}</h1>
        <div className="segmented small" role="radiogroup" aria-label={t('language')}>
          {(['en', 'fr'] as const).map((l) => (
            <button key={l} role="radio" aria-checked={lang === l} lang={l} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="icon" onClick={p.onShortcuts} aria-label={t('shortcuts')} title={`${t('shortcuts')} (?)`}>
          <Keyboard size={ICON} />
        </button>
      </header>

      <div className="toolbar" role="toolbar" aria-label={t('tools')}>
        <Btn
          icon={<MousePointer2 size={ICON} />}
          label={t('select')}
          kbd="1"
          aria-pressed={mode === 'select'}
          onClick={() => p.onMode('select')}
        />
        <Btn
          icon={<CirclePlus size={ICON} />}
          label={t('signal')}
          kbd="2"
          aria-pressed={mode === 'add-signal'}
          onClick={() => actions.toggleMode('add-signal')}
        />
        <span className="spacer" />
        <Btn icon={<Undo2 size={ICON} />} aria-label={t('undo')} title={t('undoTitle')} disabled={!p.canUndo} onClick={p.onUndo} />
        <Btn icon={<Redo2 size={ICON} />} aria-label={t('redo')} title={t('redoTitle')} disabled={!p.canRedo} onClick={p.onRedo} />
      </div>

      {mode !== 'select' && (
        <p className="hint" role="status">
          {t(HINTS[mode])} <kbd>Esc</kbd> {t('escToCancel')}
        </p>
      )}

      {p.notice && (
        <p className="warn" role="alert">
          {t(p.notice)}
        </p>
      )}

      <section aria-labelledby="sel-h">
        <h2 id="sel-h">{t('selection')}</h2>
        {!sel && <p className="muted">{t('selectionEmpty')}</p>}

        {sel?.kind === 'road' && (
          <div className="card">
            <p>
              <b>{sel.name ?? t('unnamedRoad')}</b>
              {p.blocked && <span className="tag tag-blocked">{t('blocked')}</span>}
            </p>
            <p className="muted">
              {sel.highway}
              {sel.oneway ? ` · ${t('oneway')}` : ''}
            </p>
            <div className="row">
              <Btn
                icon={p.blocked ? <CircleCheck size={ICON} /> : <Ban size={ICON} />}
                label={p.blocked ? t('unblock') : t('block')}
                kbd="B"
                onClick={actions.toggleBlock}
              />
            </div>
            <div className="row" role="group" aria-label={t('laneCount')}>
              <span className="row-label">{t('lanes')}</span>
              <Btn
                icon={<Minus size={ICON} />}
                aria-label={t('removeLane')}
                kbd="["
                disabled={p.lanes <= MIN_LANES}
                onClick={() => actions.setLanes(p.lanes - 1)}
              />
              <output aria-live="polite">{p.lanes}</output>
              <Btn
                icon={<Plus size={ICON} />}
                aria-label={t('addLane')}
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
              <b>{t('trafficSignal')}</b>
              {sel.key.startsWith('new:') && <span className="tag">{t('added')}</span>}
            </p>
            <div className="row">
              <Btn
                icon={<Move size={ICON} />}
                label={t('move')}
                kbd="M"
                aria-pressed={mode === 'move-signal'}
                onClick={() => actions.toggleMode('move-signal')}
              />
              <Btn icon={<Trash2 size={ICON} />} label={t('remove')} kbd="Del" onClick={actions.removeSignal} />
            </div>
            <p className="muted small">{t('dragTip')}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="edits-h">
        <h2 id="edits-h">
          {t('edits')} ({p.edits.length})
        </h2>
        {!p.edits.length && <p className="muted">{t('noEdits')}</p>}
        <ol className="edits">
          {p.edits.map((e, i) => (
            <li key={i}>
              <span>{describeEdit(e, t)}</span>
              {e.by === 'ai' && (
                <span className="tag" title={t('byAi')}>
                  AI
                </span>
              )}
              <button
                className="icon"
                aria-label={t('revertLabel', { edit: describeEdit(e, t) })}
                title={t('revert')}
                onClick={() => p.onRemoveEdit(i)}
              >
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
