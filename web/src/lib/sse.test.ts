import { describe, expect, it } from 'vitest'
import { parseSseStream, STREAM_INTERRUPTED_MESSAGE, type SseEvent } from '@/lib/sse'

/** Reader finto che emette le stringhe fornite come chunk Uint8Array. */
function fakeReader(
  chunks: string[],
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return {
    read: async () =>
      i < chunks.length
        ? { done: false, value: encoder.encode(chunks[i++]) }
        : { done: true, value: undefined },
    cancel: async () => {},
    releaseLock: () => {},
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const out: SseEvent[] = []
  for await (const event of parseSseStream(fakeReader(chunks))) out.push(event)
  return out
}

/** Solo il testo, per le asserzioni che non riguardano gli errori. */
async function collectText(chunks: string[]): Promise<string[]> {
  const events = await collect(chunks)
  return events.filter((e) => e.type === 'chunk').map((e) => e.data)
}

/**
 * Formatta un chunk come lo emette il backend: una riga `data:` per ogni riga
 * del contenuto, evento chiuso da una riga vuota. Tenere qui la stessa formula
 * di `_format_sse` rende il round-trip verificabile su entrambi i lati.
 */
const sse = (chunk: string) =>
  chunk
    .split('\n')
    .map((line) => `data: ${line}\n`)
    .join('') + '\n'

const DONE = 'data: [DONE]\n\n'

describe('parseSseStream — contenuto', () => {
  it('riunisce le righe data: di un evento in un solo chunk', async () => {
    const out = await collectText([sse('# Titolo\n\n- uno\n- due'), DONE])

    expect(out).toEqual(['# Titolo\n\n- uno\n- due'])
  })

  // Il caso che riproponeva la perdita in forma piu' sottile: un chunk con
  // `\n\n` produce una riga `data:` VUOTA, che non va confusa con l'assenza
  // di dati.
  it('conserva una riga vuota interna al chunk', async () => {
    const out = await collectText([sse('prima\n\nseconda'), DONE])

    expect(out).toEqual(['prima\n\nseconda'])
  })

  it('un evento con una sola riga data: vuota produce la stringa vuota', async () => {
    const out = await collectText(['data: \n\n', sse('dopo'), DONE])

    expect(out).toEqual(['', 'dopo'])
  })

  it('un evento senza righe data: non produce nulla', async () => {
    const out = await collectText(['event: ping\n\n', sse('testo'), DONE])

    expect(out).toEqual(['testo'])
  })

  it('mantiene distinti eventi consecutivi', async () => {
    const out = await collectText([sse('alfa'), sse('beta'), DONE])

    expect(out).toEqual(['alfa', 'beta'])
  })

  it('riassembla una riga spezzata fra due chunk di rete', async () => {
    const out = await collectText(['data: Ciao ', 'mondo\n\n', DONE])

    expect(out).toEqual(['Ciao mondo'])
  })

  it('gestisce le terminazioni CRLF', async () => {
    const out = await collectText(['data: a\r\n\r\n', 'data: [DONE]\r\n\r\n'])

    expect(out).toEqual(['a'])
  })

  it('accetta il prefisso data: senza spazio', async () => {
    const out = await collectText(['data:x\n\n', DONE])

    expect(out).toEqual(['x'])
  })

  it('ignora le righe di commento SSE', async () => {
    const out = await collectText([': heartbeat\n\n', sse('testo'), DONE])

    expect(out).toEqual(['testo'])
  })
})

describe('parseSseStream — i tre terminatori', () => {
  it('[DONE]: successo, nessun evento di errore', async () => {
    const events = await collect([sse('testo'), DONE])

    expect(events).toEqual([{ type: 'chunk', data: 'testo' }])
  })

  it('event: error: fallimento, con il messaggio del backend', async () => {
    const events = await collect([
      sse('parziale'),
      'event: error\ndata: Servizio temporaneamente non disponibile\n\n',
    ])

    expect(events).toEqual([
      { type: 'chunk', data: 'parziale' },
      { type: 'error', message: 'Servizio temporaneamente non disponibile' },
    ])
  })

  // E' il difetto §6.11: prima di questa correzione una chiusura senza
  // terminatore era indistinguibile da un completamento riuscito.
  it('chiusura senza terminatore: fallimento, non successo', async () => {
    const events = await collect([sse('parziale')])

    expect(events).toEqual([
      { type: 'chunk', data: 'parziale' },
      { type: 'error', message: STREAM_INTERRUPTED_MESSAGE },
    ])
  })

  it('chiusura a meta di un evento: il testo gia arrivato non va perso', async () => {
    const events = await collect(['data: meta ri'])

    expect(events).toEqual([
      { type: 'chunk', data: 'meta ri' },
      { type: 'error', message: STREAM_INTERRUPTED_MESSAGE },
    ])
  })

  it('non emette nulla dopo [DONE]', async () => {
    const events = await collect([sse('testo'), DONE, sse('mai visto')])

    expect(events).toEqual([{ type: 'chunk', data: 'testo' }])
  })
})

describe('parseSseStream — disambiguazione campo/contenuto', () => {
  // Il parser fa dispatch sul NOME del campo, non con un match sulla riga. Su
  // un'app che genera Markdown arbitrario un contenuto del genere e' possibile.
  it('un chunk il cui contenuto e letteralmente "event: error" arriva come testo', async () => {
    const events = await collect([sse('event: error'), DONE])

    expect(events).toEqual([{ type: 'chunk', data: 'event: error' }])
  })

  it('un chunk multiriga che contiene "event: error" resta testo', async () => {
    const events = await collect([sse('prima\nevent: error\ndopo'), DONE])

    expect(events).toEqual([
      { type: 'chunk', data: 'prima\nevent: error\ndopo' },
    ])
  })
})
