// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAiStream } from '@/hooks/useAiStream'
import { useEditorStore } from '@/store/useEditorStore'

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
})

/**
 * Crea un async iterable che produce i chunk specificati.
 */
async function* iterableFrom(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('useAiStream', () => {
  it('happy path: accumula chunk e arriva a done', async () => {
    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start(() => iterableFrom(['ciao ', 'mondo']))
    })

    expect(result.current.status).toBe('done')
    expect(useEditorStore.getState().streamedOutput).toBe('ciao mondo')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })

  it('abort a metà: stato idle, nessun messaggio di errore', async () => {
    const { result } = renderHook(() => useAiStream())

    async function* infiniteIterable(): AsyncIterable<string> {
      while (true) {
        yield 'chunk'
        await new Promise((r) => setTimeout(r, 10))
      }
    }

    act(() => {
      void result.current.start(infiniteIterable)
    })

    await waitFor(() => {
      expect(result.current.status).toBe('streaming')
    })

    act(() => {
      result.current.abort()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('idle')
    })

    expect(useEditorStore.getState().errorMessage).toBeNull()
  })

  it('errore dall iterable: status error e messaggio', async () => {
    const { result } = renderHook(() => useAiStream())
    const errorMsg = 'Errore interno'

    async function* failingIterable(): AsyncIterable<string> {
      throw new Error(errorMsg)
      yield // per evitare il warning "no yield"
    }

    await act(async () => {
      await result.current.start(failingIterable)
    })

    expect(result.current.status).toBe('error')
    expect(useEditorStore.getState().errorMessage).toBe(errorMsg)
  })

  it('un chunk con "event: error" è solo testo', async () => {
    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start(() => iterableFrom(['event: error']))
    })

    expect(result.current.status).toBe('done')
    expect(useEditorStore.getState().streamedOutput).toBe('event: error')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })
})