// @vitest-environment jsdom

/**
 * Test dell'effetto typewriter.
 *
 * Il tempo qui e' `requestAnimationFrame`, non `setTimeout`: si finge quello,
 * altrimenti i test dipenderebbero dal refresh reale della macchina e
 * sarebbero intermittenti. Un frame simulato vale 16 ms.
 *
 * Perche' il file non esisteva: nessun test importava `useTypewriter`, quindi
 * il modulo non veniva strumentato e non compariva **affatto** nel report di
 * copertura — non come 0%, proprio assente. E' il difetto che questa issue
 * chiude a livello di configurazione; qui si chiude il buco che quella
 * configurazione rende visibile.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTypewriter } from '@/hooks/useTypewriter'

/** Il passo dell'animazione, fissato in `useTypewriter`. */
const CARATTERI_PER_FRAME = 3
const MS_PER_FRAME = 16

function avanza(frame: number): void {
  act(() => {
    vi.advanceTimersByTime(frame * MS_PER_FRAME)
  })
}

function montaSuTesto(testo: string, generazioneInCorso: boolean) {
  return renderHook(
    ({ t, g }: { t: string; g: boolean }) => useTypewriter(t, g),
    { initialProps: { t: testo, g: generazioneInCorso } },
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useTypewriter — avanzamento', () => {
  it('parte da vuoto', () => {
    const { result } = montaSuTesto('', false)

    expect(result.current).toBe('')
  })

  it(`scopre ${CARATTERI_PER_FRAME} caratteri per frame`, () => {
    const { result, rerender } = montaSuTesto('', false)
    rerender({ t: 'abcdefghi', g: true })

    avanza(1)
    expect(result.current).toBe('abc')
    avanza(1)
    expect(result.current).toBe('abcdef')
  })

  it('arriva a mostrare tutto il testo', () => {
    const { result, rerender } = montaSuTesto('', false)
    rerender({ t: 'abcdefghi', g: true })

    avanza(10)

    expect(result.current).toBe('abcdefghi')
  })

  it('insegue il testo che continua ad arrivare', () => {
    // E' il caso reale: i chunk SSE allungano la sorgente mentre l'animazione
    // corre, e il loop non deve fermarsi al primo raggiungimento.
    const { result, rerender } = montaSuTesto('', false)
    rerender({ t: 'abc', g: true })
    avanza(2)
    expect(result.current).toBe('abc')

    rerender({ t: 'abcdef', g: true })
    avanza(2)

    expect(result.current).toBe('abcdef')
  })
})

describe('useTypewriter — azzeramenti', () => {
  it('una nuova generazione riparte da vuoto', () => {
    const { result, rerender } = montaSuTesto('', false)
    rerender({ t: 'abcdef', g: true })
    avanza(5)
    expect(result.current).toBe('abcdef')

    // Fine generazione, poi un'altra che comincia.
    rerender({ t: 'abcdef', g: false })
    rerender({ t: 'nuovo testo', g: true })

    expect(result.current).toBe('')
  })

  it('se la sorgente si accorcia, l output la segue indietro', () => {
    // Succede riaprendo la modale, che azzera `streamedOutput`: senza questo
    // l'output resterebbe appiccicato alla generazione precedente.
    const { result, rerender } = montaSuTesto('', false)
    rerender({ t: 'abcdef', g: true })
    avanza(5)
    expect(result.current).toBe('abcdef')

    act(() => {
      rerender({ t: '', g: false })
    })

    expect(result.current).toBe('')
  })

  it('a generazione finita completa comunque il testo gia arrivato', () => {
    // Lo streaming si chiude ma l'animazione e' indietro: il resto del testo
    // non va perso, va mostrato.
    const { result, rerender } = montaSuTesto('', false)
    rerender({ t: 'abcdefghi', g: true })
    avanza(1)
    expect(result.current).toBe('abc')

    rerender({ t: 'abcdefghi', g: false })
    avanza(5)

    expect(result.current).toBe('abcdefghi')
  })
})

describe('useTypewriter — pulizia', () => {
  it('smontando annulla il frame in sospeso', () => {
    const annulla = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const { rerender, unmount } = montaSuTesto('', false)
    rerender({ t: 'abcdefghi', g: true })

    unmount()

    expect(annulla).toHaveBeenCalled()
  })
})
