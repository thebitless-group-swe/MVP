const DONE_MARKER = '[DONE]'
const ERROR_EVENT_NAME = 'error'

// L'unico messaggio d'errore che nasce lato client, negli altri casi arriva dal backend.
export const STREAM_INTERRUPTED_MESSAGE =
  'La generazione si è interrotta prima di completarsi. Riprova.'

export type SseEvent =
  | { type: 'chunk'; data: string }
  | { type: 'error'; message: string }

type SseField = { name: string; value: string }

// Si smista sul NOME del campo e non sul testo della riga, altrimenti un chunk
// che contiene `event: error` verrebbe scambiato per un errore.
function parseField(line: string): SseField | null {
  if (line.startsWith(':')) return null

  const separator = line.indexOf(':')
  if (separator === -1) return { name: line, value: '' }

  const name = line.slice(0, separator)
  const raw = line.slice(separator + 1)
  // La specifica prevede la rimozione di un solo spazio dopo i due punti.
  return { name, value: raw.startsWith(' ') ? raw.slice(1) : raw }
}

/**
 * Trasforma un ReadableStream SSE in un flusso di eventi.
 *
 * Lavora sull'EVENTO, non sulla riga. Se lo fate andare per riga, un chunk con
 * un a capo dentro perde tutto il testo dopo il primo \n.
 */
export async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<SseEvent> {
  const decoder = new TextDecoder()
  let buffer = ''

  // Accumulatore dell'evento in costruzione.
  let eventName = ''
  let dataLines: string[] = []
  let terminated = false

  // Non collassate «nessuna riga data» con «una riga data vuota», un chunk con
  // \n\n dentro genera proprio una riga vuota e confonderli fa sparire testo.
  const closeEvent = (): SseEvent | null => {
    const name = eventName
    const hasData = dataLines.length > 0
    const data = dataLines.join('\n')
    eventName = ''
    dataLines = []

    if (name === ERROR_EVENT_NAME) {
      terminated = true
      return { type: 'error', message: data || STREAM_INTERRUPTED_MESSAGE }
    }
    if (!hasData) return null
    if (data === DONE_MARKER) {
      terminated = true
      return null
    }
    return { type: 'chunk', data }
  }

  const consumeLine = (raw: string): SseEvent | null => {
    const line = raw.replace(/\r$/, '')
    if (line === '') return closeEvent()

    const field = parseField(line)
    if (field === null) return null
    if (field.name === 'data') dataLines.push(field.value)
    else if (field.name === 'event') eventName = field.value
    return null
  }

  while (!terminated) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      const event = consumeLine(rawLine)
      if (event !== null) yield event
      if (terminated) return
    }
  }

  if (terminated) return

  // Si manda l'ultimo testo arrivato e poi l'errore, cosi' il troncamento si vede.
  if (buffer.length > 0) {
    const event = consumeLine(buffer)
    if (event !== null) yield event
  }
  if (dataLines.length > 0) {
    yield { type: 'chunk', data: dataLines.join('\n') }
  }
  if (!terminated) {
    yield { type: 'error', message: STREAM_INTERRUPTED_MESSAGE }
  }
}
