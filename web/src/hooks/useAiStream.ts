import { useCallback, useRef, useState } from 'react'
import { useEditorStore } from '@/store/useEditorStore'
import { parseSseStream } from '@/lib/sse'

export type AiStreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export type AiStreamParams = {
  endpoint: string
  body: Record<string, unknown>
}

export type AiStreamHandle = {
  start: (params: AiStreamParams) => Promise<void>
  abort: () => void
  status: AiStreamStatus
}

export function useAiStream(): AiStreamHandle {
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async ({ endpoint, body }: AiStreamParams) => {
    // Annulla eventuale stream precedente prima di iniziarne uno nuovo
    controllerRef.current?.abort()

    const controller = new AbortController()
    controllerRef.current = controller

    // Registra il controller nello store: TopBar può abortire qualunque stream
    useEditorStore.getState()._setAbortController(controller)

    setStatus('streaming')
    useEditorStore.getState().startStreaming()

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const resBody = await response.json().catch(() => null)
        useEditorStore.getState().setError(resBody?.detail ?? `Errore ${response.status}`)
        setStatus('error')
        return
      }

      const reader = response.body!.getReader()
      for await (const chunk of parseSseStream(reader)) {
        if (controller.signal.aborted) break
        useEditorStore.getState().appendChunk(chunk)
      }

      setStatus('done')
      useEditorStore.getState().finishStreaming()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        useEditorStore.getState().finishStreaming()
        setStatus('idle')
        return
      }
      useEditorStore.getState().setError('Errore di connessione')
      setStatus('error')
    } finally {
      useEditorStore.getState()._setAbortController(null)
    }
  }, [])

  return { start, abort, status }
}