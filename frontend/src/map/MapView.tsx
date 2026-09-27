import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { mapStyle } from './style'
import type { LngLat, Mode, ScenarioState, Selection } from '../scenario/types'

maplibregl.setWorkerUrl(workerUrl)
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

const CLICKABLE = ['user-signals', 'signals', 'roads']
const NONE = -1
const HIT_PX = 6 // click tolerance

interface Props {
  state: ScenarioState
  selection: Selection | null
  mode: Mode
  onSelect: (s: Selection | null) => void
  onPlace: (at: LngLat) => void
}

function toSelection(f: maplibregl.MapGeoJSONFeature): Selection {
  const p = f.properties
  if (f.layer.id === 'roads') {
    const oneway = p.oneway === 'yes'
    return {
      kind: 'road',
      wayId: p.osm_id,
      name: p.name ?? 'Unnamed road',
      highway: p.highway,
      lanes: Number(p.lanes) || (oneway ? 1 : 2),
      oneway,
    }
  }
  const at = (f.geometry as { coordinates: number[] }).coordinates as LngLat
  const key = f.layer.id === 'signals' ? `osm:${p.osm_id}` : p.key
  return { kind: 'signal', key, at }
}

export default function MapView({ state, selection, mode, onSelect, onPlace }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Latest props for map event handlers registered once.
  const live = useRef({ mode, onSelect, onPlace })
  useEffect(() => {
    live.current = { mode, onSelect, onPlace }
  })

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: mapStyle,
      center: [-75.715, 45.42],
      zoom: 14,
      maxBounds: [[-76.1, 45.1], [-75.25, 45.65]],
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => setLoaded(true))

    map.on('click', (e) => {
      const { mode, onSelect, onPlace } = live.current
      if (mode !== 'select') return onPlace([e.lngLat.lng, e.lngLat.lat])
      const { x, y } = e.point
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [[x - HIT_PX, y - HIT_PX], [x + HIT_PX, y + HIT_PX]]
      const [f] = map.queryRenderedFeatures(box, { layers: CLICKABLE })
      onSelect(f ? toSelection(f) : null)
    })
    for (const layer of CLICKABLE) {
      map.on('mouseenter', layer, () => {
        if (live.current.mode === 'select') map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        if (live.current.mode === 'select') map.getCanvas().style.cursor = ''
      })
    }

    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = mode === 'select' ? '' : 'crosshair'
  }, [mode])

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

  return (
    <div
      ref={container}
      role="application"
      aria-label="Map of Ottawa-Gatineau roads"
      style={{ position: 'absolute', inset: 0 }}
    />
  )
}
