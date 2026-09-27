import type { StyleSpecification } from 'maplibre-gl'

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

export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    city: {
      type: 'vector',
      url: 'pmtiles:///tiles/ottawa.pmtiles',
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#eceae4' } },
    {
      id: 'water', type: 'fill', source: 'city', 'source-layer': 'water',
      paint: { 'fill-color': '#a9cbe6' },
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
      id: 'signals', type: 'circle', source: 'city', 'source-layer': 'signals',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 6],
        'circle-color': '#d7263d',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    },
  ],
}
