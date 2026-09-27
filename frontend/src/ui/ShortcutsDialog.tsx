import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useI18n, type Key } from '../i18n'

const SHORTCUTS: [string[], Key][] = [
  [['1'], 'scSelect'],
  [['2'], 'scSignal'],
  [['3'], 'scArea'],
  [['R'], 'scRun'],
  [['M'], 'scMove'],
  [['Del'], 'scDelete'],
  [['B'], 'scBlock'],
  [['[', ']'], 'scLanes'],
  [['Ctrl+Z', 'Ctrl+Y'], 'scUndo'],
  [['Esc'], 'scEsc'],
  [['P'], 'scPlay'],
  [['←', '↑', '→', '↓'], 'scMapPan'],
  [['+', '-'], 'scMapZoom'],
  [['Enter'], 'scMapEnter'],
  [['?'], 'scHelp'],
]

/** Modal list of keyboard shortcuts (native <dialog>: focus trap + Esc to close). */
export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    // No close() in cleanup: it fires onClose, which StrictMode's re-run would turn into an instant close.
    if (!ref.current!.open) ref.current!.showModal()
  }, [])

  return (
    <dialog ref={ref} className="shortcuts" aria-labelledby="sc-h" onClose={onClose} onCancel={onClose}>
      <header>
        <h2 id="sc-h">{t('shortcuts')}</h2>
        <button className="icon" onClick={onClose} aria-label={t('close')} autoFocus>
          <X size={16} />
        </button>
      </header>
      <table>
        <tbody>
          {SHORTCUTS.map(([keys, label]) => (
            <tr key={label}>
              <td>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  )
}
