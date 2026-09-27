import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { mapStyle } from './style'
import type { LngLat, Mode, ScenarioState, Selection } from '../scenario/types'
import type { BBox } from '../sim/api'

maplibregl.setWorkerUrl(workerUrl)
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

const SIGNAL_LAYERS = ['user-signals', 'signals']
const CLICKABLE = [...SIGNAL_LAYERS, 'roads']
const NONE = -1
const HIT_PX = 6 // click tolerance
const DRAG_PX = 4 // movement before a press becomes a drag

const hitBox = ({ x, y }: maplibregl.Point): [maplibregl.PointLike, maplibregl.PointLike] => [
  [x - HIT_PX, y - HIT_PX],
  [x + HIT_PX, y + HIT_PX],
]

interface Props {
  state: ScenarioState
  selection: Selection | null
  mode: Mode
  onSelect: (s: Selection | null) => void
  onPlace: (at: LngLat) => void
  onMoveSignal: (key: string, from: LngLat, to: LngLat) => void
  area: BBox | null
  onArea: (bbox: BBox) => void
  onReady: (map: maplibregl.Map) => void
  label: string
}

const bboxOf = (a: LngLat, b: LngLat): BBox => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
]

type GeoJSONData = Parameters<maplibregl.GeoJSONSource['setData']>[0]

const areaData = (b: BBox | null): GeoJSONData => ({
  type: 'FeatureCollection',
  features: b
    ? [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]],
          },
        },
      ]
    : [],
})

function toSelection(f: maplibregl.MapGeoJSONFeature): Selection {
  const p = f.properties
  if (f.layer.id === 'roads') {
    const oneway = p.oneway === 'yes'
    return {
      kind: 'road',
      wayId: p.osm_id,
      name: p.name ?? '',
      highway: p.highway,
      lanes: Number(p.lanes) || (oneway ? 1 : 2),
      oneway,
    }
  }
  const at = (f.geometry as { coordinates: number[] }).coordinates as LngLat
  const key = f.layer.id === 'signals' ? `osm:${p.osm_id}` : p.key
  return { kind: 'signal', key, at }
}

export default function MapView({ state, selection, mode, onSelect, onPlace, onMoveSignal, area, onArea, onReady, label }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Latest props for map event handlers registered once.
  const live = useRef({ mode, onSelect, onPlace, onMoveSignal, onArea, onReady, area })
  useEffect(() => {
    live.current = { mode, onSelect, onPlace, onMoveSignal, onArea, onReady, area }
  })

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: mapStyle,
      center: [-75.715, 45.42],
      zoom: 14,
      maxBounds: [[-76.1, 45.1], [-75.25, 45.65]],
      canvasContextAttributes: { preserveDrawingBuffer: true }, // for the proposal snapshot
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => {
      setLoaded(true)
      live.current.onReady(map)
    })

    map.on('click', (e) => {
      const { mode, onSelect, onPlace } = live.current
      if (mode === 'select-area') return
      if (mode !== 'select') return onPlace([e.lngLat.lng, e.lngLat.lat])
      const [f] = map.queryRenderedFeatures(hitBox(e.point), { layers: CLICKABLE })
      onSelect(f ? toSelection(f) : null)
    })

    // Keyboard: Enter acts on the map centre (crosshair shown while the map has focus).
    map.getCanvas().addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const { mode, onSelect, onPlace } = live.current
      const c = map.getCenter()
      if (mode === 'select-area') return
      if (mode !== 'select') return onPlace([c.lng, c.lat])
      const [f] = map.queryRenderedFeatures(hitBox(map.project(c)), { layers: CLICKABLE })
      onSelect(f ? toSelection(f) : null)
    })

    // Drag and drop signals.
    let drag: { key: string; from: LngLat; start: maplibregl.Point; moved: boolean } | null = null
    const setGhost = (at: LngLat | null) =>
      (map.getSource('drag-ghost') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: at ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at } }] : [],
      })
    const cursor = (c: string) => (map.getCanvas().style.cursor = c)
    const setArea = (b: BBox | null) => (map.getSource('area') as maplibregl.GeoJSONSource).setData(areaData(b))

    // Drag a rectangle to select the simulation area.
    let areaDrag: { start: LngLat; startPx: maplibregl.Point } | null = null

    map.on('mousedown', (e) => {
      if (live.current.mode === 'select-area') {
        e.preventDefault()
        areaDrag = { start: [e.lngLat.lng, e.lngLat.lat], startPx: e.point }
        return
      }
      if (live.current.mode !== 'select') return
      const [f] = map.queryRenderedFeatures(hitBox(e.point), { layers: SIGNAL_LAYERS })
      if (!f) return
      e.preventDefault() // keep the map from panning
      const sel = toSelection(f) as Extract<Selection, { kind: 'signal' }>
      drag = { key: sel.key, from: sel.at, start: e.point, moved: false }
      cursor('grabbing')
    })
    map.on('mousemove', (e) => {
      if (areaDrag) return void setArea(bboxOf(areaDrag.start, [e.lngLat.lng, e.lngLat.lat]))
      if (drag) {
        drag.moved ||= drag.start.dist(e.point) > DRAG_PX
        if (drag.moved) setGhost([e.lngLat.lng, e.lngLat.lat])
        return
      }
      if (live.current.mode !== 'select') return
      if (map.queryRenderedFeatures(hitBox(e.point), { layers: SIGNAL_LAYERS }).length) cursor('grab')
      else if (map.queryRenderedFeatures(hitBox(e.point), { layers: ['roads'] }).length) cursor('pointer')
      else cursor('')
    })
    // Finish drags on window mouseup: the pointer may be released over the sidebar or chat.
    const onUp = (ev: MouseEvent) => {
      if (!areaDrag && !drag) return
      const rect = map.getCanvas().getBoundingClientRect()
      const point = new maplibregl.Point(ev.clientX - rect.left, ev.clientY - rect.top)
      const ll = map.unproject(point)
      if (areaDrag) {
        const a = areaDrag
        areaDrag = null
        if (a.startPx.dist(point) > DRAG_PX * 4) live.current.onArea(bboxOf(a.start, [ll.lng, ll.lat]))
        else setArea(live.current.area) // a click, not a drag: keep the previous area
        return
      }
      const d = drag!
      drag = null
      setGhost(null)
      cursor('grab')
      if (d.moved) live.current.onMoveSignal(d.key, d.from, [ll.lng, ll.lat])
    }
    window.addEventListener('mouseup', onUp)

    return () => {
      window.removeEventListener('mouseup', onUp)
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = mode === 'select' ? '' : 'crosshair'
  }, [mode])

  useEffect(() => {
    const map = mapRef.current
    if (map && loaded) (map.getSource('area') as maplibregl.GeoJSONSource).setData(areaData(area))
  }, [area, loaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const ids = (xs: number[]) => ['literal', xs.length ? xs : [NONE]]
    const removedOsm = Object.keys(state.removed).map((k) => Number(k.slice(4)))

    map.setFilter('roads-blocked', ['in', ['get', 'osm_id'], ids(state.blocked)] as never)
    map.setFilter('roads-lanes', ['in', ['get', 'osm_id'], ids(Object.keys(state.lanes).map(Number))] as never)
    map.setFilter('signals', ['!', ['in', ['get', 'osm_id'], ids(removedOsm)]] as never)
    ;(map.getSource('user-signals') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: Object.entries(state.added).map(([key, at]) => ({
        type: 'Feature',
        properties: { key },
        geometry: { type: 'Point', coordinates: at },
      })),
    })

    const road = selection?.kind === 'road' ? selection.wayId : NONE
    const sig = selection?.kind === 'signal' ? selection.key : ''
    map.setFilter('roads-selected', ['==', ['get', 'osm_id'], road])
    map.setFilter('signal-selected', ['==', ['get', 'osm_id'], sig.startsWith('osm:') && !(sig in state.added) ? Number(sig.slice(4)) : NONE])
    map.setFilter('user-signal-selected', ['==', ['get', 'key'], sig])
  }, [state, selection, loaded])

  useEffect(() => {
    mapRef.current?.getCanvas().setAttribute('aria-label', label)
  }, [label, loaded])

  return (
    <div id="map" className="map-root">
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <div className="crosshair" aria-hidden />
    </div>
  )
}
