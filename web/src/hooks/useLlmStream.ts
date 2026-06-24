import { useCallback, useRef, useState } from 'react'
import { useEditorStore } from '@/store/useEditorStore'
import { parseSseStream } from '@/lib/sse'
import type { TextRequest } from '@/types/models'

export type LlmStreamStatus = 'idle' | 'streaming' | 'done' | 'error'

// La lunghezza ammessa è quella definita dal contratto: un'unica fonte di verità.
export type SummaryLength = TextRequest['length']

const MIN_TEXT_LENGTH = 10
const DEFAULT_LENGTH: SummaryLength = 'medio'

// Base URL assoluta del backend: la chiamata e cross-origin diretta su :8000
// (motivo per cui esiste CORS_ORIGINS lato API). In assenza della variabile si
// ricade su path relativo, utile nei test dove non c'e backend da contattare.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const SUMMARIZE_ENDPOINT = `${API_BASE_URL}/api/summarize`

/**
 * Azioni dello store di cui l'hook ha bisogno. Contratto minimo implementato
 * dalle slice dello store (streaming/errore). Disaccoppia l'hook dalla forma
 * completa dello store: quando le slice lo soddisferanno, il cast in
 * `getActions` potra essere rimosso.
 */
export type EditorActions = {
  appendChunk: (chunk: string) => void
  startStreaming: () => void
  finishStreaming: () => void
  setError: (message: string) => void
}

export type LlmStreamHandle = {
  start: (text: string, length?: SummaryLength) => Promise<void>
  abort: () => void
  status: LlmStreamStatus
}

function getActions(): EditorActions {
  return useEditorStore.getState() as unknown as EditorActions
}

export function useLlmStream(
  fetchImpl: typeof fetch = globalThis.fetch,
): LlmStreamHandle {
  const [status, setStatus] = useState<LlmStreamStatus>('idle')
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    setStatus('idle')
  }, [])

  const start = useCallback(
    async (text: string, length: SummaryLength = DEFAULT_LENGTH) => {
      const actions = getActions()

      // Pre-validazione: stessa soglia del backend (Field min_length=10).
      if (text.trim().length < MIN_TEXT_LENGTH) {
        actions.setError('Testo troppo corto')
        setStatus('error')
        return
      }

      const controller = new AbortController()
      controllerRef.current = controller
      setStatus('streaming')
      actions.startStreaming()

      try {
        // L'oggetto inviato è il contratto TextRequest: lo tipizziamo per avere
        // il controllo a compile-time. Ordine delle chiavi { text, length }
        // invariato per non cambiare l'output JSON.
        const requestBody: TextRequest = { text, length }

        const response = await fetchImpl(SUMMARIZE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          actions.setError(body?.detail ?? `Errore ${response.status}`)
          setStatus('error')
          return
        }

        const reader = response.body!.getReader()
        for await (const chunk of parseSseStream(reader)) {
          // Dopo un abort, scarta i chunk già bufferizzati: eviterebbero
          // di ri-popolare streamedOutput appena azzerato (discardOutput).
          if (controller.signal.aborted) break
          actions.appendChunk(chunk)
        }

        setStatus('done')
        actions.finishStreaming()
      } catch (error) {
        // L'abort dell'utente non e un errore: torna a idle senza alert.
        if (error instanceof DOMException && error.name === 'AbortError') {
          actions.finishStreaming()
          setStatus('idle')
          return
        }
        actions.setError('Errore di connessione')
        setStatus('error')
      }
    },
    [fetchImpl],
  )

  return { start, abort, status }
}
