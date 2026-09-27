import type { LngLat } from '../scenario/types'

export type BBox = [number, number, number, number] // west, south, east, north

export interface Metrics {
  trips: number
  throughput: number
  not_completed: number
  avg_travel_time_s: number | null
  total_delay_s: number
  max_queue_vehicles: number
  avg_queue_vehicles: number
  teleports: number
}

export interface Skipped {
  kind: 'block' | 'lanes' | 'add_signal' | 'remove_signal'
  way_id?: number
  key?: string
  code: 'not_in_area' | 'no_junction' | 'no_signal' | 'has_signal'
  reason: string
}

export interface SimResult {
  baseline: Metrics
  scenario: Metrics
  applied: { skipped: Skipped[]; affected_ways: number[] } | null
  area_km2: number
}

export interface Job {
  id: string
  status: 'running' | 'done' | 'error'
  stage: number
  stages: string[]
  elapsed_s: number
  result: SimResult | null
  error: string | null
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `Server error (${res.status})`)
  }
  return res.json()
}

export async function startSimulation(bbox: BBox, scenario: unknown): Promise<string> {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bbox, scenario }),
  })
  return (await json<{ job_id: string }>(res)).job_id
}

export async function getJob(id: string): Promise<Job> {
  return json(await fetch(`/api/jobs/${id}`))
}

/** Nearest road intersection within 30 m, or null. */
export async function snap([lng, lat]: LngLat): Promise<LngLat | null> {
  return (await json<{ at: LngLat | null }>(await fetch(`/api/snap?lng=${lng}&lat=${lat}`))).at
}
