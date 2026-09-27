import { useEffect, useRef, useState } from 'react'
import { Bot, ChevronDown, Loader2, Send } from 'lucide-react'
import { askAgent, type AgentAction, type ChatMessage } from '../agent/api'
import { describeEdit } from '../scenario/fold'
import { useI18n, type T } from '../i18n'
import type { BBox } from '../sim/api'


interface Entry extends ChatMessage {
  actions?: string[]
  error?: boolean
}

interface Props {
  area: BBox | null
  edits: string[]
  onActions: (actions: AgentAction[]) => void
}

function actionLabel(a: AgentAction, t: T) {
  if (a.type === 'edit') return describeEdit(a.edit, t)
  if (a.type === 'select_area') return t('actSelectArea')
  return t('actRun')
}

export default function ChatPanel({ area, edits, onActions }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const [log, setLog] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [log, busy])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = log.filter((e) => !e.error).map(({ role, content }) => ({ role, content }))
    setLog((l) => [...l, { role: 'user', content: message }])
    setInput('')
    setBusy(true)
    try {
      const { reply, actions } = await askAgent(message, history, area, edits)
      onActions(actions)
      setLog((l) => [...l, { role: 'assistant', content: reply || t('done'), actions: actions.map((a) => actionLabel(a, t)) }])
    } catch (e) {
      setLog((l) => [...l, { role: 'assistant', content: e instanceof Error ? e.message : String(e), error: true }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="chat-toggle" onClick={() => setOpen(true)} aria-label={t('openAi')}>
        <Bot size={18} /> {t('aiAssistant')}
      </button>
    )
  }

  return (
    <section className="chat" aria-labelledby="chat-h">
      <header>
        <Bot size={16} />
        <h2 id="chat-h">{t('aiAssistant')}</h2>
        <span className="muted small">{t('aiLocal')}</span>
        <button className="icon" onClick={() => setOpen(false)} aria-label={t('minimizeAi')}>
          <ChevronDown size={16} />
        </button>
      </header>

      <ol className="chat-log" ref={listRef} aria-live="polite">
        {!log.length && (
          <li className="chat-empty">
            <p className="muted small">{t('aiIntro')}</p>
            {[t('aiEx1'), t('aiEx2'), t('aiEx3')].map((ex) => (
              <button key={ex} className="chip" onClick={() => send(ex)}>
                {ex}
              </button>
            ))}
          </li>
        )}
        {log.map((e, i) => (
          <li key={i} className={`msg ${e.role}${e.error ? ' error' : ''}`}>
            <span className="sr-label">{e.role === 'user' ? t('you') : t('assistant')}</span>
            <p>{e.content}</p>
            {!!e.actions?.length && (
              <ul className="msg-actions">
                {e.actions.map((a, j) => (
                  <li key={j}>{a}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {busy && (
          <li className="msg assistant muted">
            <Loader2 size={14} className="spin" /> {t('thinking')}
          </li>
        )}
      </ol>

      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          send(input)
        }}
      >
        <label htmlFor="chat-input" className="sr-label">
          {t('aiInputLabel')}
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('aiPlaceholder')}
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label={t('send')}>
          <Send size={16} />
        </button>
      </form>
    </section>
  )
}
