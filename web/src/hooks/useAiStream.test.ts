// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAiStream } from '@/hooks/useAiStream'
import { STREAM_INTERRUPTED_MESSAGE } from '@/lib/sse'
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

  // Rumore SSE dentro uno stream che poi si chiude regolarmente con [DONE]:
  // resta un successo. Le righe senza `data:` sono campi sconosciuti e quelle
  // che iniziano con `:` sono commenti; la specifica prevede di ignorare
  // entrambi. Da non confondere con la chiusura senza terminatore, che e'
  // invece un errore: vedi i due test qui sotto.
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

  // §6.11: il provider fallisce a meta' stream. Prima di #03 il backend
  // chiudeva senza [DONE] e questo hook interpretava la chiusura come
  // completamento, mostrando un testo troncato senza alcun segnale di errore.
  it('event: error a meta stream: status error e messaggio del backend', async () => {
    const stream = makeStream([
      'data: parziale\n\n',
      'event: error\ndata: Servizio temporaneamente non disponibile\n\n',
    ])
    vi.stubGlobal('fetch', okFetch(stream))

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('error')
    expect(useEditorStore.getState().errorMessage).toBe(
      'Servizio temporaneamente non disponibile',
    )
    // Il messaggio d'errore NON deve finire fra i contenuti: e' esattamente la
    // regressione che l'ordine dei commit (frontend prima) esiste per evitare,
    // e con l'ordine inverso l'utente se lo ritroverebbe dentro la nota.
    expect(useEditorStore.getState().streamedOutput).toBe('parziale')
    // Lo spinner si ferma, ma NON tramite finishStreaming: il percorso di
    // errore non deve essere indistinguibile da quello di successo.
    expect(useEditorStore.getState().isGenerating).toBe(false)
  })

  // Terzo terminatore: nessun [DONE] e nessun event: error. E' il caso della
  // connessione caduta, che il server non ha modo di segnalare.
  it('chiusura senza terminatore: status error, non done', async () => {
    const stream = makeStream(['data: troncato\n\n'])
    vi.stubGlobal('fetch', okFetch(stream))

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('error')
    expect(useEditorStore.getState().errorMessage).toBe(STREAM_INTERRUPTED_MESSAGE)
    // Il testo gia' ricevuto resta visibile: e' l'errore a renderlo leggibile
    // come parziale, non la sua sparizione.
    expect(useEditorStore.getState().streamedOutput).toBe('troncato')
  })

  // Il contenuto generato dall'LLM puo' contenere qualunque testo, compreso
  // qualcosa che somiglia a un campo SSE: deve restare testo.
  it('un chunk il cui contenuto e "event: error" non viene scambiato per errore', async () => {
    const stream = makeStream([
      'data: event: error\n\n',
      'data: [DONE]\n\n',
    ])
    vi.stubGlobal('fetch', okFetch(stream))

    const { result } = renderHook(() => useAiStream())

    await act(async () => {
      await result.current.start({ endpoint: ENDPOINT, body: {} })
    })

    expect(result.current.status).toBe('done')
    expect(useEditorStore.getState().streamedOutput).toBe('event: error')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })
})