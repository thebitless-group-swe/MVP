import { parseSseStream } from './sse'
import type { Length, Language, Style, Hat } from '@/types/models'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const api = {
  summarize: (text: string, length: Length = 'medio', signal?: AbortSignal) =>
    stream('/api/summarize', { text, length }, signal),

  translate: (text: string, target_language: Language, signal?: AbortSignal) =>
    stream('/api/translate', { text, target_language }, signal),

  rewrite: (text: string, style: Style, signal?: AbortSignal) =>
    stream('/api/rewrite', { text, style }, signal),

  grammar: (text: string, signal?: AbortSignal) =>
    stream('/api/grammar', { text }, signal),

  critique: (text: string, hat: Hat, signal?: AbortSignal) =>
    stream('/api/critique', { text, hat }, signal),

  generate: (prompt: string, length: Length = 'medio', signal?: AbortSignal) =>
    stream('/api/generate', { prompt, length }, signal),

  generateFromLink: (url: string, length: Length = 'medio', signal?: AbortSignal) =>
    stream('/api/generate-from-link', { url, length }, signal),
}

async function* stream(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    //Senza, annullare lascia la richiesta aperta e il backend produce fino in fondo (UC71).
    signal,
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

  try {
    for await (const event of parseSseStream(reader)) {
      if (event.type === 'error') {
        throw new Error(event.message)
      }
      yield event.data
    }
  } finally {
    //Il catch vuoto serve perche' su uno stream gia' annullato cancel() rifiuta.
    await reader.cancel().catch(() => {})
  }
}
