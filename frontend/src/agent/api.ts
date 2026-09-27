import type { Edit } from '../scenario/types'
import type { BBox } from '../sim/api'

export type AgentAction =
  | { type: 'edit'; edit: Edit }
  | { type: 'select_area'; bbox: BBox }
  | { type: 'run_simulation' }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function askAgent(
  message: string,
  history: ChatMessage[],
  bbox: BBox | null,
  edits: string[],
): Promise<{ reply: string; actions: AgentAction[] }> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, bbox, edits }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `AI error (${res.status})`)
  }
  return res.json()
}
