// lib/id.ts

/**
 * Genera l'identificativo di una nota, nella forma di un UUID versione 4.
 *
 * **Perche' questo modulo esiste.** I punti di generazione sono due — la
 * creazione di una nota (`store/notes.ts`) e l'import da file
 * (`lib/fileSystem.ts`) — e chiamavano entrambi `crypto.randomUUID()` diretto.
 * La ricaduta va scritta una volta sola: due copie sarebbero la stessa
 * duplicazione attraverso un confine che il backlog corregge altrove.
 *
 * **Perche' serve una ricaduta.** `crypto.randomUUID` e' disponibile **solo in
 * secure context**: su HTTP non-localhost e' `undefined`. La' non mancava la
 * gestione dell'errore, si rompevano del tutto due requisiti obbligatori —
 * R-82-F-Ob (creazione nota) e R-85-F-Ob (caricamento da file locale).
 *
 * `crypto.getRandomValues` invece **e' disponibile anche fuori da secure
 * context**: la ricaduta conserva quindi la stessa qualita' di casualita' e
 * non ripiega su `Math.random`.
 *
 * **Non c'e' un terzo ramo per «`crypto` del tutto assente».** Nessuno dei tre
 * browser che R-1-V-Ob impone si comporta cosi', e un ramo il cui unico
 * esecutore possibile sarebbe uno stub di test non e' codice di produzione.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // versione 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
