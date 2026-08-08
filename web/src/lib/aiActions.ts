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
import {
  MAX_PROMPT_LENGTH,
  MAX_TEXT_LENGTH,
  MIN_PROMPT_LENGTH,
  MIN_TEXT_LENGTH,
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

/**
 * Parametri raccolti dalla modale, tipizzati sul contratto invece che come
 * `Record<string, unknown>`.
 *
 * E' questo che rende definitiva la rimozione delle asserzioni di tipo verso
 * Language, Style e Hat: con `unknown` in ingresso ogni campo andava
 * riasserito a mano, e un valore fuori contratto passava inosservato fino al
 * 422 restituito dal backend.
 */
export type AiParams = {
  length?: Length
  target_language?: Language
  style?: Style
  hat?: Hat
}

/**
 * Guardia di programmazione per i campi che il contratto dichiara obbligatori.
 *
 * Solleva invece di sostituire un default: lingua, stile e cappello vanno
 * scelti esplicitamente dall'utente (vedi il commento in `schemas.py`), e un
 * default inventato qui reintrodurrebbe proprio il difetto che questa
 * correzione chiude. La modale valida prima di costruire il body, quindi
 * questo ramo non e' un percorso vivo.
 */
function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Parametro obbligatorio mancante: ${field}`)
  }
  return value
}

export type AiActionDef = {
  label: string
  endpoint: string
  source: 'text' | 'prompt' | 'url'
  buildBody: (params: AiParams, input: string) => AiRequestBody
  insertMode: 'replace' | 'append'
  minLength: number
  maxLength: number | null
}

export const AI_ACTIONS: Record<AiActionId, AiActionDef> = {
  summarize: {
    label: 'Riassumi',
    endpoint: `${API_BASE_URL}/api/summarize`,
    source: 'text',
    buildBody: (params, text): TextRequest => ({
      text,
      length: params.length ?? 'medio',
    }),
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  translate: {
    label: 'Traduci',
    endpoint: `${API_BASE_URL}/api/translate`,
    source: 'text',
    buildBody: (params, text): TranslateRequest => ({
      text,
      target_language: required(params.target_language, 'target_language'),
    }),
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  rewrite: {
    label: 'Riscrivi',
    endpoint: `${API_BASE_URL}/api/rewrite`,
    source: 'text',
    buildBody: (params, text): RewriteRequest => ({
      text,
      style: required(params.style, 'style'),
    }),
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  grammar: {
    label: 'Grammatica',
    endpoint: `${API_BASE_URL}/api/grammar`,
    source: 'text',
    buildBody: (_, text): GrammarRequest => ({ text }),
    insertMode: 'replace',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  critique: {
    label: 'Analisi',
    endpoint: `${API_BASE_URL}/api/critique`,
    source: 'text',
    buildBody: (params, text): CritiqueRequest => ({
      text,
      hat: required(params.hat, 'hat'),
    }),
    insertMode: 'append',
    minLength: MIN_TEXT_LENGTH,
    maxLength: MAX_TEXT_LENGTH,
  },
  generate: {
    label: 'Genera',
    endpoint: `${API_BASE_URL}/api/generate`,
    source: 'prompt',
    buildBody: (params, prompt): GenerateRequest => ({
      prompt,
      length: params.length ?? 'medio',
    }),
    insertMode: 'append',
    minLength: MIN_PROMPT_LENGTH,
    maxLength: MAX_PROMPT_LENGTH,
  },
  'generate-link': {
    label: 'Genera da link',
    endpoint: `${API_BASE_URL}/api/generate-from-link`,
    source: 'url',
    buildBody: (params, url): LinkRequest => ({
      url,
      length: params.length ?? 'medio',
    }),
    insertMode: 'append',
    minLength: 1,
    maxLength: null,
  },
}

export function getActiveText(): string {
  const { selectedText, currentText } = useEditorStore.getState()
  return selectedText.trim() !== '' ? selectedText : currentText
}