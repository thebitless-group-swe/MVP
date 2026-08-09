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
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  translate: {
    label: 'Traduci',
    source: 'text',
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  rewrite: {
    label: 'Riscrivi',
    source: 'text',
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  grammar: {
    label: 'Grammatica',
    source: 'text',
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  critique: {
    label: 'Analisi',
    source: 'text',
    insertMode: 'append',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  generate: {
    label: 'Genera',
    source: 'prompt',
    insertMode: 'append',
    minLength: MIN_PROMPT_LENGTH,
    maxLength: MAX_PROMPT_LENGTH,
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