import { useCallback, useRef, useState } from 'react'
import { isAbortError } from '@/lib/abort'
import { useEditorStore } from '@/store/useEditorStore'

export type AiStreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export type AiStreamHandle = {
  //Il signal e' un PARAMETRO di fn, non una cattura. LastCall.execute viene
  //rieseguita da Rigenera, e un signal catturato sarebbe gia' annullato.
  start: <T>(fn: (signal: AbortSignal) => AsyncIterable<T>) => Promise<void>
  abort: () => void
  status: AiStreamStatus
}

export function useAiStream(): AiStreamHandle {
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const abortControllerRef = useRef<AbortController | null>(null)
  const isAbortedRef = useRef(false)

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    isAbortedRef.current = true
    setStatus('idle')
    useEditorStore.getState()._setAbortController(null)
    useEditorStore.getState().finishStreaming()
  }, [])

  const start = useCallback(
    async <T>(fn: (signal: AbortSignal) => AsyncIterable<T>): Promise<void> => {
      abortControllerRef.current?.abort()

      const controller = new AbortController()
      abortControllerRef.current = controller
      isAbortedRef.current = false

      useEditorStore.getState()._setAbortController(controller)
      setStatus('streaming')
      useEditorStore.getState().startStreaming()

      try {
        for await (const chunk of fn(controller.signal)) {
          if (controller.signal.aborted) {
            isAbortedRef.current = true
            break
          }
          useEditorStore.getState().appendChunk(String(chunk))
        }

        if (isAbortedRef.current) {
          setStatus('idle')
          useEditorStore.getState().finishStreaming()
          return
        }

        setStatus('done')
        useEditorStore.getState().finishStreaming()
      } catch (error) {
        //Percorso normale dell'annullamento, va riconosciuto per nome (lib/abort.ts).
        if (isAbortError(error)) {
          setStatus('idle')
          useEditorStore.getState().finishStreaming()
          return
        }
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto'
        useEditorStore.getState().setError(msg)
        setStatus('error')
      } finally {
        useEditorStore.getState()._setAbortController(null)
        abortControllerRef.current = null
      }
    },
    []
  )

  return { start, abort, status }
}
