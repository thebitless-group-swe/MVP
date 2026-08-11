/**
 * Riconosce l'errore con cui il browser segnala «operazione annullata».
 *
 * Duck typing e non `instanceof DOMException`: quella classe appartiene al
 * realm del browser, e `instanceof` fallisce attraversando i confini di realm
 * — iframe, worker e l'ambiente di test. E' la stessa convenzione gia' adottata
 * da `lib/fileSystem.ts` per il medesimo controllo, dove era stata scelta
 * esattamente per questo motivo.
 *
 * **Non e' una precauzione teorica: e' misurata.** Un abort reale nell'ambiente
 * di test del progetto produce un errore con `name === 'AbortError'` e
 * `constructor.name === 'DOMException'`, per cui pero' `instanceof DOMException`
 * vale `false` — mentre `instanceof Error` vale `true`.
 *
 * Da qui la conseguenza che rende questo modulo necessario e non ornamentale:
 * il ramo che lo consuma in `hooks/useAiStream.ts` era quasi irraggiungibile
 * finche' il signal non arrivava alla `fetch`, e da quando ci arriva (UC71) e'
 * il percorso *normale* dell'annullamento. Con il controllo per classe l'abort
 * sarebbe caduto nel ramo d'errore generico, e il messaggio tecnico del browser
 * — «This operation was aborted», in inglese — sarebbe finito nell'interfaccia,
 * contro R-110-F-Ob.
 */
export function isAbortError(err: unknown): boolean {
  return err != null && (err as { name?: string }).name === 'AbortError'
}
