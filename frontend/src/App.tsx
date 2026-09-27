import { useEffect, useState } from 'react'
import MapView from './map/MapView'
import Sidebar from './ui/Sidebar'
import { useScenario } from './scenario/useScenario'
import type { Edit, LngLat, Mode, Selection } from './scenario/types'
import './App.css'

export default function App() {
  const scenario = useScenario()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mode, setMode] = useState<Mode>('select')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMode('select')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const place = (at: LngLat) => {
    if (mode === 'add-signal') {
      const key = `new:${crypto.randomUUID()}`
      scenario.apply({ type: 'add_signal', key, at })
      setSelection({ kind: 'signal', key, at })
    } else if (mode === 'move-signal' && selection?.kind === 'signal') {
      const from = scenario.state.added[selection.key] ?? selection.at
      scenario.apply({ type: 'move_signal', key: selection.key, from, to: at })
      setSelection({ ...selection, at })
    }
    setMode('select')
  }

  const apply = (edit: Edit) => {
    scenario.apply(edit)
    if (edit.type === 'remove_signal') setSelection(null)
  }

  return (
    <>
      <MapView state={scenario.state} selection={selection} mode={mode} onSelect={setSelection} onPlace={place} />
      <Sidebar
        edits={scenario.edits}
        state={scenario.state}
        selection={selection}
        mode={mode}
        canUndo={scenario.canUndo}
        canRedo={scenario.canRedo}
        onApply={apply}
        onRemoveEdit={scenario.remove}
        onUndo={scenario.undo}
        onRedo={scenario.redo}
        onMode={setMode}
      />
    </>
  )
}
