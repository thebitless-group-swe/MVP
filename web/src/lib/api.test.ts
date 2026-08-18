// @vitest-environment jsdom

/**
 * Test della Facade verso il backend.
 *
 * **Perche' non esisteva.** `AiActionDialog.test.tsx` fa `vi.mock('@/lib/api')`:
 * il modulo reale non viene mai caricato, quindi il file che incapsula l'intero
 * trasporto HTTP stava a 0% — ed era anche del tutto **fuori** dal report di
 * copertura, perche' il provider v8 strumenta solo cio' che i test caricano.
 * E' la stessa struttura per cui `fileSystem.ts` era invisibile prima di #32.
 *
 * **Perche' qui `parseSseStream` non e' mockato.** Mockare il livello
 * sottostante riprodurrebbe lo stesso difetto un piano piu' in basso: si
 * verificherebbe la Facade contro un doppio del parser invece che contro il
 * parser. I test alimentano quindi un `ReadableStream` vero e passano dalla
 * giuntura reale Facade -> parser.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { STREAM_INTERRUPTED_MESSAGE } from '@/lib/sse'

/** Corpo SSE come lo emetterebbe il backend, in un unico chunk di rete. */
function corpoSse(testo: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(testo))
      controller.close()
    },
  })
}

function rispostaOk(testoSse: string): Response {
  return { ok: true, body: corpoSse(testoSse) } as unknown as Response
}

/** Risposta d'errore: `json()` decide quale ramo del recupero del dettaglio si prende. */
function rispostaErrore(json: () => Promise<unknown>): Response {
  return { ok: false, json } as unknown as Response
}

function intercettaFetch(risposta: Response) {
  const chiamata = vi.fn().mockResolvedValue(risposta)
  vi.stubGlobal('fetch', chiamata)
  return chiamata
}

/** Raccoglie tutto cio' che la Facade produce. */
async function raccogli(flusso: AsyncIterable<string>): Promise<string[]> {
  const pezzi: string[] = []
  for await (const p of flusso) pezzi.push(p)
  return pezzi
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('api — percorso felice', () => {
  it('restituisce i chunk di testo dello stream', async () => {
    intercettaFetch(rispostaOk('data: Ciao\n\ndata: mondo\n\ndata: [DONE]\n\n'))

    await expect(raccogli(api.grammar('testo'))).resolves.toEqual(['Ciao', 'mondo'])
  })

  it('ricompone un chunk multiriga in un solo pezzo', async () => {
    // Righe `data:` consecutive sono UN evento: e' il punto che #03 ha corretto,
    // e la Facade non deve disfarlo.
    intercettaFetch(rispostaOk('data: # Titolo\ndata: \ndata: - uno\n\ndata: [DONE]\n\n'))

    await expect(raccogli(api.summarize('testo'))).resolves.toEqual(['# Titolo\n\n- uno'])
  })
})

describe('api — le sette azioni parlano col proprio endpoint', () => {
  // Il registry e' gia' coperto altrove: qui interessa che ogni metodo della
  // Facade componga URL e corpo giusti, perche' e' l'unico punto in cui quei
  // nomi di campo esistono.
  const casi: Array<[string, () => AsyncIterable<string>, string, unknown]> = [
    ['summarize', () => api.summarize('t', 'breve'), '/api/summarize', { text: 't', length: 'breve' }],
    ['translate', () => api.translate('t', 'inglese'), '/api/translate', { text: 't', target_language: 'inglese' }],
    ['rewrite', () => api.rewrite('t', 'formale'), '/api/rewrite', { text: 't', style: 'formale' }],
    ['grammar', () => api.grammar('t'), '/api/grammar', { text: 't' }],
    ['critique', () => api.critique('t', 'nero'), '/api/critique', { text: 't', hat: 'nero' }],
    ['generate', () => api.generate('p', 'dettagliato'), '/api/generate', { prompt: 'p', length: 'dettagliato' }],
    ['generateFromLink', () => api.generateFromLink('https://x.it'), '/api/generate-from-link', { url: 'https://x.it', length: 'medio' }],
  ]

  it.each(casi)('%s', async (_nome, invoca, endpoint, corpo) => {
    const chiamata = intercettaFetch(rispostaOk('data: [DONE]\n\n'))

    await raccogli(invoca())

    expect(chiamata).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(corpo) }),
    )
  })

  it('summarize e generate hanno «medio» come lunghezza predefinita', async () => {
    const chiamata = intercettaFetch(rispostaOk('data: [DONE]\n\n'))

    await raccogli(api.summarize('t'))

    expect(chiamata.mock.calls[0][1].body).toBe(JSON.stringify({ text: 't', length: 'medio' }))
  })
})

describe('api — risposta non ok', () => {
  it('usa il dettaglio del backend quando e una stringa', async () => {
    intercettaFetch(rispostaErrore(async () => ({ detail: 'Servizio non disponibile' })))

    await expect(raccogli(api.grammar('t'))).rejects.toThrow('Servizio non disponibile')
  })

  it('serializza il dettaglio quando non e una stringa', async () => {
    // I 422 di FastAPI hanno `detail` di tipo lista: assegnarlo tale e quale a
    // un campo dichiarato `string` e' il difetto che #04 ha corretto a monte.
    intercettaFetch(rispostaErrore(async () => ({ detail: [{ msg: 'campo assente' }] })))

    await expect(raccogli(api.grammar('t'))).rejects.toThrow('campo assente')
  })

  it('ricade su un messaggio generico se il corpo non e JSON', async () => {
    intercettaFetch(rispostaErrore(async () => {
      throw new SyntaxError('non e JSON')
    }))

    await expect(raccogli(api.grammar('t'))).rejects.toThrow('Errore durante la richiesta')
  })

  it('ricade su un messaggio generico se manca il campo detail', async () => {
    intercettaFetch(rispostaErrore(async () => ({})))

    await expect(raccogli(api.grammar('t'))).rejects.toThrow('Errore durante la richiesta')
  })
})

describe('api — risposta ok ma inutilizzabile', () => {
  it('solleva se il server non restituisce un corpo', async () => {
    intercettaFetch({ ok: true, body: null } as unknown as Response)

    await expect(raccogli(api.grammar('t'))).rejects.toThrow('Il server non ha restituito un corpo')
  })

  it('trasforma un evento error dello stream in un errore, non in testo', async () => {
    // R-80-F-Ob: un guasto del provider a meta' stream non deve arrivare
    // all'utente travestito da contenuto della nota.
    intercettaFetch(rispostaOk('data: parziale\n\nevent: error\ndata: Provider non raggiungibile\n\n'))

    const flusso = api.grammar('t')[Symbol.asyncIterator]()
    await expect(flusso.next()).resolves.toEqual({ value: 'parziale', done: false })
    await expect(flusso.next()).rejects.toThrow('Provider non raggiungibile')
  })

  it('uno stream chiuso senza terminatore e un errore, non un successo', async () => {
    intercettaFetch(rispostaOk('data: meta testo\n\n'))

    await expect(raccogli(api.grammar('t'))).rejects.toThrow(STREAM_INTERRUPTED_MESSAGE)
  })
})

describe('api — annullamento (UC71)', () => {
  it('inoltra il signal alla fetch', async () => {
    const chiamata = intercettaFetch(rispostaOk('data: ciao\n\ndata: [DONE]\n\n'))
    const controller = new AbortController()

    await raccogli(api.summarize('testo di prova', 'medio', controller.signal))

    expect(chiamata.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
  })

  it('interrompere il consumo cancella il corpo della risposta', async () => {
    let cancellato = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: uno\n\n'))
      },
      cancel() {
        cancellato = true
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body } as unknown as Response),
    )

    for await (const pezzo of api.summarize('testo di prova')) {
      expect(pezzo).toBe('uno')
      break
    }

    expect(cancellato).toBe(true)
  })
})
