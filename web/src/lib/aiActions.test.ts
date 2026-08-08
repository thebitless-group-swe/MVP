import { describe, it, expect } from 'vitest'
import { AI_ACTIONS, type AiParams } from '@/lib/aiActions'
import {
  MAX_PROMPT_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_PROMPT_LENGTH,
  MIN_TEXT_LENGTH,
} from '@/types/models'
import type { AiActionId } from '@/store/useEditorStore'

const ALL_ACTION_IDS: AiActionId[] = [
  'summarize',
  'translate',
  'rewrite',
  'grammar',
  'critique',
  'generate',
  'generate-link',
]

// Valori del CONTRATTO, non etichette di interfaccia. Prima di #02 questa
// costante conteneva 'en', 'formal' e 'red': il test verificava che buildBody
// copiasse i valori, non che fossero validi, e nel passare certificava il
// difetto che faceva rispondere 422 «Traduci» e «Riscrivi».
//
// L'annotazione `: AiParams` e' cio' che impedisce il ritorno del difetto: da
// qui in avanti un valore fuori contratto non compila.
const FULL_PARAMS: AiParams = {
  length: 'medio',
  target_language: 'inglese',
  style: 'formale',
  hat: 'rosso',
}

describe('AI_ACTIONS — buildBody', () => {
  it.each(ALL_ACTION_IDS)(
    '%s: buildBody include il campo input corretto per la source',
    (id) => {
      const action = AI_ACTIONS[id]
      const input = 'valore di test'
      const body = action.buildBody(FULL_PARAMS, input) as Record<string, unknown>

      if (action.source === 'text') {
        expect(body.text).toBe(input)
      } else if (action.source === 'prompt') {
        expect(body.prompt).toBe(input)
      } else {
        expect(body.url).toBe(input)
      }
    },
  )
})

describe('AI_ACTIONS — insertMode per azione', () => {
  it.each([
    ['summarize', 'replace'],
    ['translate', 'replace'],
    ['rewrite', 'replace'],
    ['grammar', 'replace'],
    ['critique', 'append'],
    ['generate', 'append'],
    ['generate-link', 'append'],
  ] as [AiActionId, 'replace' | 'append'][])(
    '%s: insertMode è %s',
    (id, expected) => {
      expect(AI_ACTIONS[id].insertMode).toBe(expected)
    },
  )
})

describe('AI_ACTIONS — proprietà obbligatorie', () => {
  it.each(ALL_ACTION_IDS)(
    '%s: ha label, endpoint e minLength validi',
    (id) => {
      const action = AI_ACTIONS[id]
      expect(action.label).toBeTruthy()
      expect(action.endpoint).toContain('/api/')
      expect(action.minLength).toBeGreaterThan(0)
    },
  )
})

describe('AI_ACTIONS — minLength deriva dal contratto', () => {
  it.each([
    ['summarize', MIN_TEXT_LENGTH],
    ['translate', MIN_TEXT_LENGTH],
    ['rewrite', MIN_TEXT_LENGTH],
    ['grammar', MIN_TEXT_LENGTH],
    ['critique', MIN_TEXT_LENGTH],
    ['generate', MIN_PROMPT_LENGTH],
  ] as [AiActionId, number][])(
    '%s: minLength è la soglia del contratto',
    (id, atteso) => {
      expect(AI_ACTIONS[id].minLength).toBe(atteso)
    },
  )

  it('generate-link: resta un controllo di UI senza corrispettivo nel contratto', () => {
    expect(AI_ACTIONS['generate-link'].minLength).toBe(1)
  })
})

describe('AI_ACTIONS — maxLength deriva dal contratto', () => {
  it.each([
    ['summarize', MAX_TEXT_LENGTH],
    ['translate', MAX_TEXT_LENGTH],
    ['rewrite', MAX_TEXT_LENGTH],
    ['grammar', MAX_TEXT_LENGTH],
    ['critique', MAX_TEXT_LENGTH],
    ['generate', MAX_PROMPT_LENGTH],
  ] as [AiActionId, number][])(
    '%s: maxLength è il massimo del contratto',
    (id, atteso) => {
      expect(AI_ACTIONS[id].maxLength).toBe(atteso)
    },
  )

  it('generate-link: nessun massimo di testo', () => {
    expect(AI_ACTIONS['generate-link'].maxLength).toBeNull()
  })

  it.each(ALL_ACTION_IDS)('%s: il massimo supera il minimo', (id) => {
    const { minLength, maxLength } = AI_ACTIONS[id]
    if (maxLength !== null) expect(maxLength).toBeGreaterThan(minLength)
  })
})