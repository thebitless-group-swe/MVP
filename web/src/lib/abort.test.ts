import { describe, expect, it } from 'vitest'

import { isAbortError } from '@/lib/abort'

describe('isAbortError', () => {
  it('riconosce un errore di annullamento dal nome, non dalla classe', () => {
    const err = new Error('The user aborted a request.')
    err.name = 'AbortError'

    expect(isAbortError(err)).toBe(true)
  })

  it('riconosce una DOMException di annullamento', () => {
    expect(isAbortError(new DOMException('annullato', 'AbortError'))).toBe(true)
  })

  it('non scambia per annullamento un errore qualunque', () => {
    expect(isAbortError(new Error('rete non raggiungibile'))).toBe(false)
  })

  it('regge null e undefined', () => {
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
})
