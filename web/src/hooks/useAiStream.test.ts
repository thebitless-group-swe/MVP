// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAiStream } from '@/hooks/useAiStream'
import { useEditorStore } from '@/store/useEditorStore'

const ENDPOINT = '/api/test'
const encoder = new TextEncoder()

function makeStream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    },
  })
}

function okFetch(stream: ReadableStream) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    json: async () => ({}),
  })
}

beforeEach(() => {
  useEditorStore.setState({
    streamedOutput: '',
    isGenerating: false,
    errorMessage: null,
    _abortController: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useAiStream', () => {
  // Happy path: i chunk arrivano, vengono accumulati, status diventa done
  it('happy path: accumula chunk e arriva a done', async () => {
    const stream = makeStream([
      'data: ciao \n\n',
      'data: mondo\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', okFetch(stream))

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('done')
    expect(useEditorStore.getState().streamedOutput).toBe('ciao mondo')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })

  // Abort a metà: fetch rimane pending, l'abort la fa rifiutare con AbortError
  // → stato idle, nessun errore, nessun chunk aggiunto dopo l'abort
  it('abort a metà: stato idle, nessun messaggio di errore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, options: RequestInit) =>
        new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      ),
    )

    const { result } = renderHook(() => useAiStream())

    act(() => {
      void result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    await act(async () => {
      result.current.abort()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('idle')
    })

    expect(useEditorStore.getState().errorMessage).toBeNull()
    expect(useEditorStore.getState().streamedOutput).toBe('')
  })

  // 503 con detail: il campo detail della risposta finisce in errorMessage
  it('risposta 503 con detail: errorMessage riceve il detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        body: makeStream([]),
        json: async () => ({ detail: 'Servizio non disponibile' }),
      }),
    )

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('error')
    expect(useEditorStore.getState().errorMessage).toBe('Servizio non disponibile')
  })

  // Errore di rete (fetch rigetta): errorMessage è la stringa fissa
  it('errore di rete: errorMessage è Errore di connessione', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('error')
    expect(useEditorStore.getState().errorMessage).toBe('Errore di connessione')
  })

  // SSE malformato: le righe senza prefisso data: vengono silenziosamente
  // ignorate da parseSseStream, i chunk buoni passano, nessun throw
  it('SSE malformato: i chunk buoni passano, nessun throw', async () => {
    const stream = makeStream([
      'data: primo\n\n',
      'spazzatura-senza-prefisso\n',
      ': commento-sse-ignorato\n\n',
      'data: secondo\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', okFetch(stream))

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('done')
    expect(useEditorStore.getState().streamedOutput).toBe('primosecondo')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })
})