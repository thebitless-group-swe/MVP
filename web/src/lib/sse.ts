const DONE_MARKER = '[DONE]'
const ERROR_EVENT_NAME = 'error'

/**
 * Messaggio mostrato quando lo stream si chiude senza alcun terminatore.
 *
 * E' l'unico messaggio che nasce lato client: negli altri casi di errore il
 * testo arriva dal backend nel payload dell'evento `error`. Qui il server non
 * ha detto nulla — la connessione e' semplicemente caduta — quindi il testo va
 * prodotto qui. Indica causa e azione correttiva senza dettagli tecnici
 * (R-110-F-Ob).
 */
export const STREAM_INTERRUPTED_MESSAGE =
  'La generazione si è interrotta prima di completarsi. Riprova.'

/**
 * Esito di un evento SSE consumato dal parser.
 *
 * I due casi sono distinguibili per asserzione e non per implicazione: prima
 * di questa correzione uno stream chiuso a meta' era indistinguibile da uno
 * completato, e l'utente riceveva un testo troncato spacciato per completo.
 */
export type SseEvent =
  | { type: 'chunk'; data: string }
  | { type: 'error'; message: string }

type SseField = { name: string; value: string }

/**
 * Scompone una riga SSE nel nome del campo e nel suo valore.
 *
 * Il dispatch avviene sul NOME del campo, non con un match sul testo della
 * riga: e' questo che permette a un chunk il cui contenuto e' letteralmente
 * `event: error` di arrivare all'utente come testo invece di essere scambiato
 * per un errore. Su un'applicazione che genera Markdown arbitrario non e' un
 * caso di scuola.
 *
 * Ritorna null per le righe di commento (`: ...`), che la specifica SSE
 * prevede e che vanno ignorate.
 */
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
 * Il parser e' costruito sulla struttura dell'EVENTO e non sulla singola riga:
 * nella specifica SSE un evento e' un `event:` opzionale piu' una o piu' righe
 * `data:`, chiuse da una riga vuota. Le righe `data:` di uno stesso evento
 * vengono accumulate e riunite con `\n`.
 *
 * Prima di questa correzione ogni riga era un evento a se': un chunk contenente
 * un a capo produceva righe prive del prefisso `data:`, che venivano scartate.
 * Non si perdeva il solo carattere `\n`, si perdeva tutto il testo che lo
 * seguiva — sistematico su ogni risposta Markdown non banale.
 *
 * Tre terminatori distinti:
 *   - `data: [DONE]`  -> successo, il generatore termina senza eventi di errore
 *   - `event: error`  -> fallimento, con il messaggio fornito dal backend
 *   - chiusura senza nessuno dei due -> fallimento (stream troncato)
 *
 * Gestisce anche il buffering delle righe (un chunk di rete puo' spezzare una
 * riga a meta') e le terminazioni CRLF. Pure function: nessuna dipendenza da
 * React o dallo store.
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

  /**
   * Chiude l'evento corrente sulla riga vuota.
   *
   * I tre casi da NON collassare:
   *   - nessuna riga `data:`      -> l'evento non produce nulla
   *   - una riga `data:` vuota    -> l'evento produce la stringa vuota
   *   - riga non riconosciuta     -> ignorata, non tocca l'accumulatore
   * Confondere i primi due riproporrebbe la perdita di contenuto in forma piu'
   * sottile, perche' un chunk contenente `\n\n` genera proprio una riga vuota.
   */
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

  // Lo stream si e' chiuso senza terminatore. Emettiamo comunque l'ultimo
  // evento incompleto — il testo gia' arrivato resta visibile — e subito dopo
  // l'errore, cosi' che il troncamento non passi per completamento.
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
