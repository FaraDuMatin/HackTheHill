import type { StyleSpecification } from 'maplibre-gl'
import { SPEED_STOPS } from '../sim/replay'

const ROAD_COLOR = [
  'match', ['get', 'highway'],
  ['motorway', 'motorway_link'], '#e8923a',
  ['trunk', 'trunk_link'], '#f0b04a',
  ['primary', 'primary_link'], '#f6d36b',
  ['secondary', 'secondary_link'], '#ffffff',
  '#ffffff',
] as const

const roadWidth = (k: number) => [
  'interpolate', ['exponential', 1.6], ['zoom'],
  10, ['match', ['get', 'highway'], ['motorway', 'trunk'], 2 * k, ['primary', 'secondary'], 1.2 * k, 0.4 * k],
  16, ['match', ['get', 'highway'], ['motorway', 'trunk'], 14 * k, ['primary', 'secondary'], 10 * k, ['service'], 3 * k, 6 * k],
] as never

const SIGNAL_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 6] as never,
  'circle-color': '#d7263d',
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 1.5,
}

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    city: {
      type: 'vector',
      url: 'pmtiles:///tiles/ottawa.pmtiles',
      attribution: '© OpenStreetMap contributors',
    },
    signals: { type: 'geojson', data: '/tiles/signals.geojson' },
    'user-signals': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    'drag-ghost': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    area: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    vehicles: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eceae4' } },
    {
      id: 'water', type: 'fill', source: 'city', 'source-layer': 'water',
      paint: { 'fill-color': '#a9cbe6' },
    },
    {
      id: 'area-fill', type: 'fill', source: 'area',
      paint: { 'fill-color': '#1f78b4', 'fill-opacity': 0.06 },
    },
    {
      id: 'roads-selected', type: 'line', source: 'city', 'source-layer': 'roads',
      filter: ['==', ['get', 'osm_id'], -1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1f78b4', 'line-width': roadWidth(2.4), 'line-opacity': 0.55 },
    },
    {
      id: 'roads-casing', type: 'line', source: 'city', 'source-layer': 'roads',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#b3aca0', 'line-width': roadWidth(1.3) },
    },
    {
      id: 'roads', type: 'line', source: 'city', 'source-layer': 'roads',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROAD_COLOR as never, 'line-width': roadWidth(1) },
    },
    {
      id: 'roads-lanes', type: 'line', source: 'city', 'source-layer': 'roads',
      filter: ['==', ['get', 'osm_id'], -1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1f78b4', 'line-width': roadWidth(1) },
    },
    {
      id: 'roads-blocked', type: 'line', source: 'city', 'source-layer': 'roads',
      filter: ['==', ['get', 'osm_id'], -1],
      paint: { 'line-color': '#b2182b', 'line-width': roadWidth(1), 'line-dasharray': [1, 1] },
    },
    {
      id: 'signals', type: 'circle', source: 'signals', minzoom: 12,
      paint: SIGNAL_PAINT,
    },
    {
      id: 'user-signals', type: 'circle', source: 'user-signals',
      paint: { ...SIGNAL_PAINT, 'circle-stroke-color': '#1f78b4', 'circle-stroke-width': 3 },
    },
    {
      id: 'vehicles', type: 'circle', source: 'vehicles',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 14, 4, 17, 7],
        'circle-color': ['interpolate', ['linear'], ['get', 'speed'], ...SPEED_STOPS.flat()] as never,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 15, 1.5],
      },
    },
    {
      id: 'signal-selected', type: 'circle', source: 'signals',
      filter: ['==', ['get', 'osm_id'], -1],
      paint: { 'circle-radius': 12, 'circle-color': 'transparent', 'circle-stroke-color': '#1f78b4', 'circle-stroke-width': 3 },
    },
    {
      id: 'user-signal-selected', type: 'circle', source: 'user-signals',
      filter: ['==', ['get', 'key'], ''],
      paint: { 'circle-radius': 12, 'circle-color': 'transparent', 'circle-stroke-color': '#1f78b4', 'circle-stroke-width': 3 },
    },
    {
      id: 'area-line', type: 'line', source: 'area',
      paint: { 'line-color': '#1f78b4', 'line-width': 2, 'line-dasharray': [3, 2] },
    },
    {
      id: 'drag-ghost', type: 'circle', source: 'drag-ghost',
      paint: { 'circle-radius': 9, 'circle-color': '#d7263d', 'circle-opacity': 0.7, 'circle-stroke-color': '#1f78b4', 'circle-stroke-width': 3 },
    },
  ],
}
