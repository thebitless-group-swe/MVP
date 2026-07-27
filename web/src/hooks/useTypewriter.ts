import { useEffect, useRef, useState } from 'react'

/**
 * Consumer progressivo che trasforma un testo in arrivo (streamedText) in un
 * output visualizzato carattere-per-carattere (displayedOutput), creando
 * l'effetto typewriter.
 *
 * Usa requestAnimationFrame per sincronizzarsi con il refresh del browser:
 * ad ogni frame avanza di CHARS_PER_FRAME caratteri, bilanciando fluidità
 * visiva e costo di re-render del parser Markdown a valle.
 *
 * Il loop RAF è stabile: NON viene distrutto/ricreato ad ogni chunk SSE.
 * Il testo sorgente è letto tramite ref, così l'effect dipende solo da
 * isGenerating (transizione idle↔streaming), evitando cleanup continui
 * che causerebbero micro-stutter nell'animazione.
 *
 * @param streamedText  Il testo accumulato dal backend (cresce ad ogni chunk SSE).
 * @param isGenerating  Flag di streaming attivo dallo store Zustand.
 * @returns displayedOutput  Il testo da renderizzare, che cresce gradualmente.
 */

const CHARS_PER_FRAME = 3

export function useTypewriter(
  streamedText: string,
  isGenerating: boolean,
): string {
  const [displayedOutput, setDisplayedOutput] = useState('')

  //Ref aggiornato tramite useEffect per evitare accesso durante il render
  const streamedTextRef = useRef(streamedText)
  useEffect(() => {
    streamedTextRef.current = streamedText
  }, [streamedText])

  const cursorRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  /*
   * Reset quando la sorgente si accorcia o si azzera (es. apertura di una
   * modale che pulisce streamedOutput, o scarto dell'output). Senza questo,
   * l'output visualizzato resterebbe "appiccicato" all'ultima generazione:
   * il reset su isGenerating scatta solo all'avvio di una NUOVA generazione,
   * non quando si riapre una modale senza ancora rigenerare.
   */
  useEffect(() => {
    if (streamedText.length < cursorRef.current) {
      cursorRef.current = streamedText.length
      setDisplayedOutput(streamedText)
    }
  }, [streamedText])


  

  /*
   * Reset quando parte una nuova generazione: il testo visualizzato torna
   * vuoto e il cursore riparte da zero.
   */
 useEffect(() => {
    if (isGenerating) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedOutput('')
      cursorRef.current = 0
    }
  }, [isGenerating])
  /*
   * Loop RAF stabile: si avvia quando isGenerating diventa true e si ferma
   * quando lo streaming è finito E tutto il testo è stato visualizzato.
   * NON dipende da streamedText → niente cleanup/restart ad ogni chunk.
   */
 useEffect(() => {
    const tick = () => {
      const cursor = cursorRef.current
      const target = streamedTextRef.current.length

      if (cursor < target) {
        const next = Math.min(cursor + CHARS_PER_FRAME, target)
        cursorRef.current = next
        setDisplayedOutput(streamedTextRef.current.slice(0, next))
        rafRef.current = requestAnimationFrame(tick)
      } else if (isGenerating) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    if (isGenerating || cursorRef.current < streamedTextRef.current.length) {
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isGenerating])

  return displayedOutput
}
