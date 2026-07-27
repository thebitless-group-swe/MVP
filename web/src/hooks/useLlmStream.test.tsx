import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLlmStream } from '@/hooks/useLlmStream'

// Store mockato: getState() restituisce spy, così l'hook e testabile senza
// le slice reali (di un altro task) e senza render dello store.
const actions = {
  appendChunk: vi.fn(),
  startStreaming: vi.fn(),
  finishStreaming: vi.fn(),
  setError: vi.fn(),
}

vi.mock('@/store/useEditorStore', () => ({
  useEditorStore: Object.assign(() => actions, { getState: () => actions }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const LONG_TEXT = 'testo abbastanza lungo da superare la soglia'

/** Reader finto che emette le stringhe come chunk Uint8Array. */
function fakeReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return {
    read: async () =>
      i < chunks.length
        ? { done: false, value: encoder.encode(chunks[i++]) }
        : { done: true, value: undefined },
    cancel: async () => {},
    releaseLock: () => {},
  } as unknown as ReadableStreamDefaultReader<Uint8Array>
}

/** Response finta con corpo SSE leggibile da parseSseStream. */
function sseResponse(lines: string[]) {
  return {
    ok: true,
    status: 200,
    body: { getReader: () => fakeReader(lines) },
  } as unknown as Response
}

const okFetch = (lines: string[]) => vi.fn().mockResolvedValue(sseResponse(lines))

describe('useLlmStream — scheletro (#30)', () => {
  it('parte dallo stato idle', () => {
    const { result } = renderHook(() => useLlmStream(okFetch([])))
    expect(result.current.status).toBe('idle')
  })

  it('start notifica startStreaming e completa a done', async () => {
    const fetchImpl = okFetch(['data: [DONE]\n\n'])
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    expect(actions.startStreaming).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(actions.finishStreaming).toHaveBeenCalledTimes(1)
  })

  it('abort riporta a idle', async () => {
    const { result } = renderHook(() => useLlmStream(okFetch(['data: [DONE]\n\n'])))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    act(() => result.current.abort())
    await waitFor(() => expect(result.current.status).toBe('idle'))
  })
})

describe('useLlmStream — pre-validation (#31)', () => {
  it('testo piu corto di 10 caratteri: setError e nessun fetch', async () => {
    const fetchImpl = vi.fn()
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start('ciao')
    })
    expect(actions.setError).toHaveBeenCalledWith('Testo troppo corto')
    expect(fetchImpl).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('conta i caratteri dopo trim (solo spazi: troppo corto)', async () => {
    const fetchImpl = vi.fn()
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start('          ')
    })
    expect(actions.setError).toHaveBeenCalledWith('Testo troppo corto')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('useLlmStream — fetch e stream (#32)', () => {
  const line = (content: string) =>
    `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`

  it('POST /api/summarize con il testo nel body', async () => {
    const fetchImpl = okFetch(['data: [DONE]\n\n'])
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/api/summarize'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: LONG_TEXT, length: 'medio' }),
      }),
    )
  })

  it('appendChunk per ogni chunk dello stream', async () => {
    const fetchImpl = okFetch([line('Ciao'), line(' mondo'), 'data: [DONE]\n\n'])
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    expect(actions.appendChunk).toHaveBeenNthCalledWith(1, 'Ciao')
    expect(actions.appendChunk).toHaveBeenNthCalledWith(2, ' mondo')
    await waitFor(() => expect(result.current.status).toBe('done'))
  })

  it('risposta non ok: setError con il detail e stato error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Servizio temporaneamente non disponibile' }),
    } as unknown as Response)
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    expect(actions.setError).toHaveBeenCalledWith(
      'Servizio temporaneamente non disponibile',
    )
    expect(actions.appendChunk).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('errore di rete: setError generico e stato error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'))
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    expect(actions.setError).toHaveBeenCalledWith('Errore di connessione')
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('AbortError durante il fetch: torna a idle senza setError', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const { result } = renderHook(() => useLlmStream(fetchImpl))
    await act(async () => {
      await result.current.start(LONG_TEXT)
    })
    expect(actions.setError).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.status).toBe('idle'))
  })
})
