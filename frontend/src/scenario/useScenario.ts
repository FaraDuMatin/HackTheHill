import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { fold } from './fold'
import type { Edit } from './types'

interface History {
  past: Edit[][]
  present: Edit[]
  future: Edit[][]
}

type Action =
  | { type: 'apply'; edit: Edit }
  | { type: 'remove'; index: number }
  | { type: 'undo' }
  | { type: 'redo' }

function commit(h: History, next: Edit[]): History {
  return { past: [...h.past, h.present], present: next, future: [] }
}

function reducer(h: History, a: Action): History {
  switch (a.type) {
    case 'apply':
      return commit(h, [...h.present, a.edit])
    case 'remove':
      return commit(h, h.present.filter((_, i) => i !== a.index))
    case 'undo':
      if (!h.past.length) return h
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
    case 'redo':
      if (!h.future.length) return h
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
  }
}

export function useScenario() {
  const [h, dispatch] = useReducer(reducer, { past: [], present: [], future: [] })
  const state = useMemo(() => fold(h.present), [h.present])

  const apply = useCallback((edit: Edit) => dispatch({ type: 'apply', edit }), [])
  const remove = useCallback((index: number) => dispatch({ type: 'remove', index }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    edits: h.present,
    state,
    apply,
    remove,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  }
}
