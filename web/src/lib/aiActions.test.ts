import { describe, it, expect } from 'vitest'
import { AI_ACTIONS, type AiActionId } from '@/lib/aiActions'

const ALL_ACTION_IDS: AiActionId[] = [
  'summarize',
  'translate',
  'rewrite',
  'grammar',
  'critique',
  'generate',
  'generate-link',
]

describe('AI_ACTIONS — metadati UI', () => {
  it.each(ALL_ACTION_IDS)('%s: ha label, source, insertMode e minLength', (id) => {
    const action = AI_ACTIONS[id]
    expect(action.label).toBeTruthy()
    expect(['text', 'prompt', 'url']).toContain(action.source)
    expect(['replace', 'append']).toContain(action.insertMode)
    expect(action.minLength).toBeGreaterThan(0)
  })
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