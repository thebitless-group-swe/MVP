import { useEditorStore, type AiActionId } from '@/store/useEditorStore'

export type { AiActionId }

export type AiParams = {
  length?: 'breve' | 'medio' | 'dettagliato'
  target_language?: 'inglese' | 'francese' | 'tedesco' | 'spagnolo'
  style?: 'formale' | 'informale' | 'accademico'
  hat?: 'bianco' | 'rosso' | 'giallo' | 'nero' | 'verde' | 'blu'
}

export type AiActionDef = {
  label: string
  source: 'text' | 'prompt' | 'url'
  insertMode: 'replace' | 'append'
  minLength: number
  maxLength: number | null
}

export const AI_ACTIONS: Record<AiActionId, AiActionDef> = {
  summarize: {
    label: 'Riassumi',
    source: 'text',
    insertMode: 'replace',
    minLength: 10,
    maxLength: 12000,
  },
  translate: {
    label: 'Traduci',
    source: 'text',
    insertMode: 'replace',
    minLength: 10,
    maxLength: 12000,
  },
  rewrite: {
    label: 'Riscrivi',
    source: 'text',
    insertMode: 'replace',
    minLength: 10,
    maxLength: 12000,
  },
  grammar: {
    label: 'Grammatica',
    source: 'text',
    insertMode: 'replace',
    minLength: 10,
    maxLength: 12000,
  },
  critique: {
    label: 'Analisi',
    source: 'text',
    insertMode: 'append',
    minLength: 10,
    maxLength: 12000,
  },
  generate: {
    label: 'Genera',
    source: 'prompt',
    insertMode: 'append',
    minLength: 3,
    maxLength: 2000,
  },
  'generate-link': {
    label: 'Genera da link',
    source: 'url',
    insertMode: 'append',
    minLength: 1,
    maxLength: null,
  },
}

export function getActiveText(): string {
  const { selectedText, currentText } = useEditorStore.getState()
  return selectedText.trim() !== '' ? selectedText : currentText
}