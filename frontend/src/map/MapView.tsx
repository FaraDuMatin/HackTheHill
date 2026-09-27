import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { mapStyle } from './style'

maplibregl.setWorkerUrl(workerUrl)
const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

const CLICKABLE = ['roads', 'signals']

function describe(f: maplibregl.MapGeoJSONFeature) {
  const p = f.properties
  if (f.layer.id === 'signals') return `<b>Traffic signal</b><br>OSM node ${p.osm_id}`
  return [
    `<b>${p.name ?? 'Unnamed road'}</b>`,
    `Type: ${p.highway}`,
    `Lanes: ${p.lanes ?? 'unknown'}`,
    p.oneway === 'yes' ? 'One-way' : null,
    p.maxspeed ? `Speed: ${p.maxspeed}` : null,
    `OSM way ${p.osm_id}`,
  ].filter(Boolean).join('<br>')
}

export default function MapView() {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: mapStyle,
      center: [-75.715, 45.42],
      zoom: 14,
      maxBounds: [[-76.1, 45.1], [-75.25, 45.65]],
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('click', (e) => {
      const [f] = map.queryRenderedFeatures(e.point, { layers: CLICKABLE })
      if (!f) return
      new maplibregl.Popup().setLngLat(e.lngLat).setHTML(describe(f)).addTo(map)
    })
    for (const layer of CLICKABLE) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }

    return () => map.remove()
  }, [])

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />
}
