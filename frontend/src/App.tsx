import { useEffect, useState } from 'react'
import MapView from './map/MapView'
import Sidebar, { MAX_LANES, MIN_LANES, type Actions } from './ui/Sidebar'
import { useScenario } from './scenario/useScenario'
import type { LngLat, Mode, Selection } from './scenario/types'
import './App.css'

export default function App() {
  const scenario = useScenario()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mode, setMode] = useState<Mode>('select')

  const road = selection?.kind === 'road' ? selection : null
  const signal = selection?.kind === 'signal' ? selection : null
  const blocked = road ? scenario.state.blocked.includes(road.wayId) : false
  const lanes = road ? (scenario.state.lanes[road.wayId] ?? road.lanes) : 0

  const actions: Actions = {
    toggleBlock: () => {
      if (!road) return
      scenario.apply({ type: blocked ? 'unblock_road' : 'block_road', wayId: road.wayId, name: road.name })
    },
    setLanes: (n) => {
      if (!road || n < MIN_LANES || n > MAX_LANES) return
      scenario.apply({ type: 'set_lanes', wayId: road.wayId, name: road.name, from: lanes, lanes: n })
    },
    removeSignal: () => {
      if (!signal) return
      scenario.apply({ type: 'remove_signal', key: signal.key, at: signal.at })
      setSelection(null)
    },
    toggleMode: (m) => setMode((cur) => (cur === m ? 'select' : m)),
  }

  const moveSignal = (key: string, from: LngLat, to: LngLat) => {
    scenario.apply({ type: 'move_signal', key, from, to })
    setSelection({ kind: 'signal', key, at: to })
  }

  const place = (at: LngLat) => {
    if (mode === 'add-signal') {
      const key = `new:${crypto.randomUUID()}`
      scenario.apply({ type: 'add_signal', key, at })
      setSelection({ kind: 'signal', key, at })
    } else if (mode === 'move-signal' && signal) {
      moveSignal(signal.key, scenario.state.added[signal.key] ?? signal.at, at)
    }
    setMode('select')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if (k === 'escape') {
        if (mode !== 'select') setMode('select')
        else setSelection(null)
      } else if (k === '1' || k === 'v') setMode('select')
      else if (k === '2' || k === 's') actions.toggleMode('add-signal')
      else if (k === 'm' && signal) actions.toggleMode('move-signal')
      else if ((k === 'delete' || k === 'backspace') && signal) actions.removeSignal()
      else if (k === 'b' && road) actions.toggleBlock()
      else if (k === ']' && road) actions.setLanes(lanes + 1)
      else if (k === '[' && road) actions.setLanes(lanes - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <MapView
        state={scenario.state}
        selection={selection}
        mode={mode}
        onSelect={setSelection}
        onPlace={place}
        onMoveSignal={moveSignal}
      />
      <Sidebar
        edits={scenario.edits}
        selection={selection}
        mode={mode}
        blocked={blocked}
        lanes={lanes}
        canUndo={scenario.canUndo}
        canRedo={scenario.canRedo}
        actions={actions}
        onRemoveEdit={scenario.remove}
        onUndo={scenario.undo}
        onRedo={scenario.redo}
        onMode={setMode}
      />
    </>
  )
}
