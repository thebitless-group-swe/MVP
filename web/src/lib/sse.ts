const SSE_DATA_PREFIX = 'data:'
const SSE_DONE_MARKER = '[DONE]'

/**
 * Estrae `choices[0].delta.content` da una riga `data:` SSE openai-compatibile.
 * Ritorna null per le righe da ignorare (delta senza content, JSON malformato).
 * Lato browser i payload malformati vengono saltati, non sollevati: il backend
 * ha gia validato lo stream.
 */
function extractContent(data: string): string | null {
  try {
    const payload = JSON.parse(data)
    const content = payload?.choices?.[0]?.delta?.content
    return typeof content === 'string' ? content : null
  } catch {
    // Il backend emette testo puro (non JSON OpenAI): il chunk SSE è
    // già il contenuto da visualizzare. Restituiamo la stringa grezza.
    return data.length > 0 ? data : null
  }
}

/**
 * Trasforma un ReadableStream SSE in un flusso di chunk testuali.
 *
 * Gestisce il buffering delle righe (un chunk di rete puo spezzare una riga
 * a meta), il prefisso `data:` con o senza spazio, le terminazioni CRLF e il
 * marcatore `[DONE]` che chiude lo stream. Pure function: nessuna dipendenza
 * da React o dallo store.
 */
export async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  const DONE = Symbol('done')

  const handleLine = (raw: string): string | typeof DONE | null => {
    const line = raw.replace(/\r$/, '').trimStart()
    if (!line.startsWith(SSE_DATA_PREFIX)) return null
    const data = line.slice(SSE_DATA_PREFIX.length).replace(/^ /, '')
    if (data === SSE_DONE_MARKER) return DONE
    return extractContent(data)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      const result = handleLine(rawLine)
      if (result === DONE) return
      if (result !== null) yield result
    }
  }

  // Eventuale ultima riga senza newline finale.
  if (buffer.length > 0) {
    const result = handleLine(buffer)
    if (result !== null && result !== DONE) yield result
  }
}
