/**
 * Riconosce l'errore con cui il browser segnala «operazione annullata».
 *
 * Si controlla il name e non `instanceof DOMException`, che su un abort vero
 * vale false perche' la classe sta in un altro realm.
 */
export function isAbortError(err: unknown): boolean {
  return err != null && (err as { name?: string }).name === 'AbortError'
}
