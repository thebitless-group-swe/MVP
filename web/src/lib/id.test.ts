// @vitest-environment jsdom

/**
 * Test del generatore di identificativi.
 *
 * La giuntura e' la presenza di `crypto.randomUUID`, che esiste **solo in
 * secure context**: c'e' su `localhost` e in HTTPS, manca su HTTP
 * non-localhost. jsdom la definisce, quindi il ramo di ricaduta va abilitato
 * togliendola con `vi.stubGlobal` — la stessa tecnica con cui
 * `fileSystem.test.ts` esercita il ramo Firefox.
 *
 * Perche' serve: senza ricaduta, fuori da secure context si rompono del tutto
 * R-82-F-Ob (creazione nota) e R-85-F-Ob (caricamento da file locale).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { newId } from '@/lib/id'

const cryptoReale = globalThis.crypto

/** UUID versione 4, variante RFC 4122. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

type Riempitore = (arr: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>

/** Casualita' vera del browser, che fuori da secure context resta disponibile. */
const casualitaReale: Riempitore = (arr) => cryptoReale.getRandomValues(arr)

/** Contesto non sicuro: `randomUUID` sparisce, `getRandomValues` resta. */
function fuoriDaSecureContext(getRandomValues: Riempitore = casualitaReale): void {
  vi.stubGlobal('crypto', { getRandomValues })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newId — secure context', () => {
  it('usa crypto.randomUUID quando e disponibile', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', {
      randomUUID,
      // Se venisse toccato, il ramo scelto sarebbe quello sbagliato.
      getRandomValues: () => {
        throw new Error('ramo di ricaduta usato a torto')
      },
    })

    expect(newId()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })
})

describe('newId — fuori da secure context (randomUUID assente)', () => {
  it('non solleva e produce comunque un identificativo', () => {
    fuoriDaSecureContext()

    expect(() => newId()).not.toThrow()
    expect(newId()).not.toBe('')
  })

  it('produce un UUID versione 4 ben formato', () => {
    fuoriDaSecureContext()

    expect(newId()).toMatch(UUID_V4)
  })

  it('marca versione e variante anche con byte tutti a 1', () => {
    // Caso limite deterministico: senza le due maschere l'esito sarebbe
    // 'ffffffff-ffff-ffff-ffff-ffffffffffff', che non e' un UUID v4.
    fuoriDaSecureContext((arr) => arr.fill(0xff))

    expect(newId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('attinge alla casualita del browser, non a Math.random', () => {
    const getRandomValues = vi.fn(casualitaReale)
    fuoriDaSecureContext(getRandomValues)

    newId()

    expect(getRandomValues).toHaveBeenCalledTimes(1)
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16)
  })

  it('produce identificativi distinti', () => {
    fuoriDaSecureContext()

    const ids = new Set(Array.from({ length: 200 }, () => newId()))

    expect(ids.size).toBe(200)
  })
})
