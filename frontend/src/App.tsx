import { useEffect, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import MapView from './map/MapView'
import Sidebar, { MAX_LANES, MIN_LANES, type Actions } from './ui/Sidebar'
import SimPanel from './ui/SimPanel'
import { useScenario } from './scenario/useScenario'
import { toBackend } from './scenario/fold'
import { snap, type BBox } from './sim/api'
import { useSimulation } from './sim/useSimulation'
import type { LngLat, Mode, Selection } from './scenario/types'
import './App.css'

const MAX_AREA_KM2 = 25 // keep in sync with backend runner.MAX_AREA_KM2

function areaKm2([w, s, e, n]: BBox) {
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180)
  return (e - w) * k * 111.32 * (n - s) * 111.32
}

export default function App() {
  const scenario = useScenario()
  const { sim, run } = useSimulation()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [mode, setMode] = useState<Mode>('select')
  const [area, setArea] = useState<BBox | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)

  const road = selection?.kind === 'road' ? selection : null
  const signal = selection?.kind === 'signal' ? selection : null
  const blocked = road ? scenario.state.blocked.includes(road.wayId) : false
  const lanes = road ? (scenario.state.lanes[road.wayId] ?? road.lanes) : 0
  const payload = toBackend(scenario.state)
  const stale = sim.kind === 'done' && sim.runKey !== JSON.stringify({ bbox: area, scenario: payload })
  const km2 = area ? areaKm2(area) : null

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const runSim = () => {
    if (area && km2 != null && km2 <= MAX_AREA_KM2 && sim.kind !== 'running') run(area, payload)
  }

  /** Snap a signal location to the nearest intersection; null (with a notice) if there is none. */
  const snapSignal = async (at: LngLat): Promise<LngLat | null> => {
    try {
      const snapped = await snap(at)
      if (!snapped) setNotice('No intersection within 30 m. Signals must be on an intersection.')
      return snapped
    } catch {
      return at // backend unreachable: keep the point, the simulation will report it if invalid
    }
  }

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

  const moveSignal = async (key: string, from: LngLat, to: LngLat) => {
    const at = await snapSignal(to)
    if (!at) return
    scenario.apply({ type: 'move_signal', key, from, to: at })
    setSelection({ kind: 'signal', key, at })
  }

  const place = async (at: LngLat) => {
    setMode('select')
    if (mode === 'add-signal') {
      const snapped = await snapSignal(at)
      if (!snapped) return
      const key = `new:${crypto.randomUUID()}`
      scenario.apply({ type: 'add_signal', key, at: snapped })
      setSelection({ kind: 'signal', key, at: snapped })
    } else if (mode === 'move-signal' && signal) {
      await moveSignal(signal.key, scenario.state.added[signal.key] ?? signal.at, at)
    }
  }

  const pickArea = (bbox: BBox) => {
    setArea(bbox)
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
      else if (k === '3') actions.toggleMode('select-area')
      else if (k === 'r') runSim()
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
        area={area}
        onArea={pickArea}
        onReady={setMap}
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
        notice={notice}
        onRemoveEdit={scenario.remove}
        onUndo={scenario.undo}
        onRedo={scenario.redo}
        onMode={setMode}
        simPanel={
          <SimPanel
            area={area}
            areaKm2={km2}
            maxKm2={MAX_AREA_KM2}
            selectingArea={mode === 'select-area'}
            sim={sim}
            stale={stale}
            edits={scenario.edits}
            onSelectArea={() => actions.toggleMode('select-area')}
            onRun={runSim}
            map={map}
          />
        }
      />
    </>
  )
}
