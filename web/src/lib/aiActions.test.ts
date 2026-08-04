import { describe, it, expect } from 'vitest'
import { AI_ACTIONS } from '@/lib/aiActions'
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

const FULL_PARAMS = {
  length: 'medio',
  target_language: 'en',
  style: 'formal',
  hat: 'red',
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

describe('AI_ACTIONS — invariante insertMode / source', () => {
  it.each(ALL_ACTION_IDS)(
    '%s: insertMode coerente con source',
    (id) => {
      const { source, insertMode } = AI_ACTIONS[id]
      if (source === 'text') {
        expect(insertMode).toBe('replace')
      } else {
        expect(insertMode).toBe('append')
      }
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