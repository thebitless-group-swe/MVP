import { describe, expect, it } from 'vitest'
import { parseSseStream } from '@/lib/sse'

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

async function collect(chunks: string[]): Promise<string[]> {
  const out: string[] = []
  for await (const chunk of parseSseStream(fakeReader(chunks))) out.push(chunk)
  return out
}

const line = (content: string) =>
  `data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n\n`

describe('parseSseStream', () => {
  it('estrae i content e ignora [DONE]', async () => {
    const out = await collect([line('Ciao'), line(' mondo'), 'data: [DONE]\n\n'])
    expect(out).toEqual(['Ciao', ' mondo'])
  })

  it('riassembla una riga JSON spezzata fra due chunk di rete', async () => {
    const out = await collect([
      'data: {"choices":[{"delta":{"content":"Ciao ',
      'mondo"}}]}\n\ndata: [DONE]\n\n',
    ])
    expect(out).toEqual(['Ciao mondo'])
  })

  it('gestisce le terminazioni CRLF', async () => {
    const out = await collect([
      'data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n',
      'data: [DONE]\r\n\r\n',
    ])
    expect(out).toEqual(['a'])
  })

  it('accetta il prefisso data: senza spazio', async () => {
    const out = await collect(['data:{"choices":[{"delta":{"content":"x"}}]}\n\n'])
    expect(out).toEqual(['x'])
  })

  it('salta i chunk senza content (es. chunk finale con finish_reason)', async () => {
    const out = await collect([
      line('testo'),
      'data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    expect(out).toEqual(['testo'])
  })

  it('tratta le righe non-JSON come testo puro (formato backend)', async () => {
    const out = await collect(['data: {non-json}\n\n', line('ok')])
    expect(out).toEqual(['{non-json}', 'ok'])
  })

  it('emette una riga finale priva di newline conclusiva', async () => {
    const out = await collect(['data: {"choices":[{"delta":{"content":"coda"}}]}'])
    expect(out).toEqual(['coda'])
  })

  it('preserva un content stringa vuota', async () => {
    const out = await collect([line(''), line('dopo')])
    expect(out).toEqual(['', 'dopo'])
  })
})
