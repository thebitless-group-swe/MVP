import { parseSseStream } from './sse'
import type { Length, Language, Style, Hat } from '@/types/models'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * Facade per le operazioni AI.
 * Ogni metodo ritorna un AsyncIterable<string>.
 */
export const api = {
  summarize: (text: string, length: Length = 'medio') =>
    stream('/api/summarize', { text, length }),

  translate: (text: string, target_language: Language) =>
    stream('/api/translate', { text, target_language }),

  rewrite: (text: string, style: Style) =>
    stream('/api/rewrite', { text, style }),

  grammar: (text: string) =>
    stream('/api/grammar', { text }),

  critique: (text: string, hat: Hat) =>
    stream('/api/critique', { text, hat }),

  generate: (prompt: string, length: Length = 'medio') =>
    stream('/api/generate', { prompt, length }),

  generateFromLink: (url: string, length: Length = 'medio') =>
    stream('/api/generate-from-link', { url, length }),
}

async function* stream(endpoint: string, body: unknown): AsyncIterable<string> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = 'Errore durante la richiesta'
    try {
      const errorBody = await response.json()
      if (errorBody?.detail) {
        detail = typeof errorBody.detail === 'string'
          ? errorBody.detail
          : JSON.stringify(errorBody.detail)
      }
    } catch {
      // fallback
    }
    throw new Error(detail)
  }

  if (!response.body) {
    throw new Error('Il server non ha restituito un corpo')
  }

  const reader = response.body.getReader()

  for await (const event of parseSseStream(reader)) {
    if (event.type === 'error') {
      throw new Error(event.message)
    }
    yield event.data
  }
}