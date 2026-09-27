import { useCallback, useEffect, useRef, useState } from 'react'
import { getJob, startSimulation, type BBox, type Job } from './api'

const POLL_MS = 1000
const CLIENT_TIMEOUT_S = 15 * 60

export type SimState =
  | { kind: 'idle' }
  | { kind: 'running'; job: Job | null }
  | { kind: 'done'; job: Job; runKey: string }
  | { kind: 'error'; message: string }

/** Runs baseline vs scenario on the backend and polls until done. */
export function useSimulation() {
  const [sim, setSim] = useState<SimState>({ kind: 'idle' })
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false // StrictMode runs cleanup + effect again on mount
    return () => void (cancelled.current = true)
  }, [])

  const run = useCallback(async (bbox: BBox, scenario: unknown) => {
    const runKey = JSON.stringify({ bbox, scenario })
    setSim({ kind: 'running', job: null })
    try {
      const id = await startSimulation(bbox, scenario)
      const started = Date.now()
      while (!cancelled.current) {
        const job = await getJob(id)
        if (job.status === 'done') return setSim({ kind: 'done', job, runKey })
        if (job.status === 'error') return setSim({ kind: 'error', message: job.error ?? 'Simulation failed' })
        if ((Date.now() - started) / 1000 > CLIENT_TIMEOUT_S) throw new Error('Simulation timed out')
        setSim({ kind: 'running', job })
        await new Promise((r) => setTimeout(r, POLL_MS))
      }
    } catch (e) {
      setSim({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  return { sim, run }
}
