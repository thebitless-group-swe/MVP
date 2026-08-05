import { useEditorStore, type AiActionId } from '@/store/useEditorStore'
import type {
  TextRequest,
  GenerateRequest,
  LinkRequest,
  TranslateRequest,
  RewriteRequest,
  GrammarRequest,
  CritiqueRequest,
  Length,
  Language,
  Style,
  Hat,
} from '@/types/models'

export type { AiActionId }

type AiRequestBody =
  | TextRequest
  | GenerateRequest
  | LinkRequest
  | TranslateRequest
  | RewriteRequest
  | GrammarRequest
  | CritiqueRequest

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export type AiActionDef = {
  label: string
  endpoint: string
  source: 'text' | 'prompt' | 'url'
  buildBody: (params: Record<string, unknown>, input: string) => AiRequestBody
  insertMode: 'replace' | 'append'
  minLength: number
}

export const AI_ACTIONS: Record<AiActionId, AiActionDef> = {
  summarize: {
    label: 'Riassumi',
    endpoint: `${API_BASE_URL}/api/summarize`,
    source: 'text',
    buildBody: (params, text): TextRequest => ({
      text,
      length: (params.length as Length) ?? 'medio',
    }),
    insertMode: 'replace',
    minLength: 10,
  },
  translate: {
    label: 'Traduci',
    endpoint: `${API_BASE_URL}/api/translate`,
    source: 'text',
    buildBody: (params, text): TranslateRequest => ({
      text,
      target_language: params.target_language as Language,
    }),
    insertMode: 'replace',
    minLength: 10,
  },
  rewrite: {
    label: 'Riscrivi',
    endpoint: `${API_BASE_URL}/api/rewrite`,
    source: 'text',
    buildBody: (params, text): RewriteRequest => ({
      text,
      style: params.style as Style,
    }),
    insertMode: 'replace',
    minLength: 10,
  },
  grammar: {
    label: 'Grammatica',
    endpoint: `${API_BASE_URL}/api/grammar`,
    source: 'text',
    buildBody: (_, text): GrammarRequest => ({ text }),
    insertMode: 'replace',
    minLength: 10,
  },
  critique: {
    label: 'Analisi',
    endpoint: `${API_BASE_URL}/api/critique`,
    source: 'text',
    buildBody: (params, text): CritiqueRequest => ({
      text,
      hat: params.hat as Hat,
    }),
    insertMode: 'append',
    minLength: 10,
  },
  generate: {
    label: 'Genera',
    endpoint: `${API_BASE_URL}/api/generate`,
    source: 'prompt',
    buildBody: (params, prompt): GenerateRequest => ({
      prompt,
      length: (params.length as Length) ?? 'medio',
    }),
    insertMode: 'append',
    minLength: 3,
  },
  'generate-link': {
    label: 'Genera da link',
    endpoint: `${API_BASE_URL}/api/generate-from-link`,
    source: 'url',
    buildBody: (params, url): LinkRequest => ({
      url,
      length: (params.length as Length) ?? 'medio',
    }),
    insertMode: 'append',
    minLength: 1,
  },
}

export function getActiveText(): string {
  const { selectedText, currentText } = useEditorStore.getState()
  return selectedText.trim() !== '' ? selectedText : currentText
}