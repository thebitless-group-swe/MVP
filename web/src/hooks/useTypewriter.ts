import { useEffect, useRef, useState } from 'react'

/** Mostra il testo in arrivo carattere per carattere. */

const CHARS_PER_FRAME = 3

export function useTypewriter(
  streamedText: string,
  isGenerating: boolean,
): string {
  const [displayedOutput, setDisplayedOutput] = useState('')

  //Il testo si legge da un ref, se l'effect dipendesse da streamedText verrebbe
  //ricreato a ogni chunk e l'animazione scatterebbe.
  const streamedTextRef = useRef(streamedText)
  useEffect(() => {
    streamedTextRef.current = streamedText
  }, [streamedText])

  const cursorRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  //Senza questo, riaprendo una modale senza rigenerare resta l'output di prima.
  useEffect(() => {
    if (streamedText.length < cursorRef.current) {
      cursorRef.current = streamedText.length
      setDisplayedOutput(streamedText)
    }
  }, [streamedText])




 useEffect(() => {
    if (isGenerating) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedOutput('')
      cursorRef.current = 0
    }
  }, [isGenerating])
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
