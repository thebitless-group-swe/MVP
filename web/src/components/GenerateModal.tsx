import { useRef, useState } from 'react'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import { Dialog } from 'radix-ui'
import { Link, MessageSquare } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTypewriter } from '@/hooks/useTypewriter'
import { parseSseStream } from '@/lib/sse'
import { cn } from '@/lib/utils'
import type { GenerateRequest, LinkRequest } from '@/types/models'
import {
  useAiModal,
  useEditorStore,
  useErrorMessage,
  useIsGenerating,
  useStreamedOutput,
} from '@/store/useEditorStore'

// Stessa union del contratto: la deriviamo invece di riscriverla.
type Length = GenerateRequest['length']
type Mode = 'prompt' | 'link'

const LENGTHS: { value: Length; label: string }[] = [
  { value: 'breve', label: 'Breve' },
  { value: 'medio', label: 'Medio' },
  { value: 'dettagliato', label: 'Dettagliato' },
]

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const GENERATE_ENDPOINT = `${API_BASE_URL}/api/generate`
const GENERATE_LINK_ENDPOINT = `${API_BASE_URL}/api/generate-from-link`

export function GenerateModal() {
  const aiModal = useAiModal()
  const open = aiModal === 'generate'

  const [mode, setMode] = useState<Mode>('prompt')
  const [prompt, setPrompt] = useState('')
  const [url, setUrl] = useState('')
  const [length, setLength] = useState<Length>('medio')

  type GenerateParams =
    | { mode: 'prompt'; prompt: string; length: Length }
    | { mode: 'link'; url: string; length: Length }
  const [lastParams, setLastParams] = useState<GenerateParams | null>(null)

  const streamedOutput = useStreamedOutput()
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const displayed = useTypewriter(streamedOutput, isGenerating)

  const controllerRef = useRef<AbortController | null>(null)

  const abort = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }

  const currentSnapshot = (): GenerateParams =>
    mode === 'link'
      ? { mode: 'link', url: url.trim(), length }
      : { mode: 'prompt', prompt: prompt.trim(), length }

  const paramsEqual = (a: GenerateParams, b: GenerateParams) =>
    a.mode === b.mode &&
    a.length === b.length &&
    (a.mode === 'link' && b.mode === 'link'
      ? a.url === b.url
      : a.mode === 'prompt' && b.mode === 'prompt'
        ? a.prompt === b.prompt
        : false)

  const sameAsLast =
    lastParams !== null && paramsEqual(lastParams, currentSnapshot())

  const runStream = async (snapshot: GenerateParams) => {
    abort()
    const controller = new AbortController()
    controllerRef.current = controller

    const store = useEditorStore.getState()
    store.startStreaming()
    useEditorStore.setState({ errorMessage: null })

    const endpoint =
      snapshot.mode === 'link' ? GENERATE_LINK_ENDPOINT : GENERATE_ENDPOINT
    // In modalità link il body è un LinkRequest, altrimenti un GenerateRequest.
    // Ordine delle chiavi invariato per non cambiare l'output JSON.
    const body: LinkRequest | GenerateRequest =
      snapshot.mode === 'link'
        ? { url: snapshot.url, length: snapshot.length }
        : { prompt: snapshot.prompt, length: snapshot.length }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => null)
        useEditorStore
          .getState()
          .setError(errBody?.detail ?? `Errore ${response.status}`)
        return
      }

      const reader = response.body!.getReader()
      for await (const chunk of parseSseStream(reader)) {
        // Dopo un abort, scarta i chunk già bufferizzati per non ri-popolare
        // streamedOutput appena azzerato.
        if (controller.signal.aborted) break
        useEditorStore.getState().appendChunk(chunk)
      }
      useEditorStore.getState().finishStreaming()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        useEditorStore.getState().finishStreaming()
        return
      }
      useEditorStore.getState().setError('Errore di connessione')
    }
  }

  const canGenerate =
    !isGenerating &&
    (mode === 'link' ? url.trim().length > 0 : prompt.trim().length >= 3)

  const handleGenerate = () => {
    const snapshot = currentSnapshot()
    setLastParams(snapshot)
    void runStream(snapshot)
  }

  const handleDiscard = () => {
    abort()
    setLastParams(null)
    useEditorStore.getState().discardOutput()
  }

  const handleInsert = () => {
    setLastParams(null)
    useEditorStore.getState().insertOutputIntoNote()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDiscard()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-auto rounded-lg border border-border bg-background p-5 shadow-xl"
        >
          <Dialog.Title asChild>
            <div className="text-base font-semibold text-foreground">
              Genera contenuto
            </div>
          </Dialog.Title>

          <div
            role="tablist"
            aria-label="Modalita di input"
            className="flex items-center gap-1 rounded-md border border-border bg-muted p-1"
          >
            {(
              [
                {
                  value: 'prompt' as Mode,
                  label: 'Istruzioni',
                  icon: MessageSquare,
                },
                { value: 'link' as Mode, label: 'Da link', icon: Link },
              ] satisfies {
                value: Mode
                label: string
                icon: typeof Link
              }[]
            ).map(({ value, label, icon: Icon }) => {
              const active = mode === value
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(value)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </button>
              )
            })}
          </div>

          {mode === 'prompt' ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                Istruzioni / Contesto
              </span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Descrivi cosa generare..."
                className="min-h-[88px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">URL</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-foreground">
              Lunghezza output
            </legend>
            <div
              role="radiogroup"
              aria-label="Lunghezza output"
              className="flex items-center gap-1 rounded-md border border-border bg-muted p-1"
            >
              {LENGTHS.map(({ value, label }) => {
                const active = length === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLength(value)}
                    className={cn(
                      'flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div
            aria-label="Anteprima output"
            className={cn(
              'min-h-[200px] flex-1 overflow-auto rounded-md border border-border bg-card p-3',
              isGenerating && 'typing-active',
            )}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {displayed}
              </ReactMarkdown>
            </div>
          </div>

          <div aria-live="polite">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={!canGenerate}
                aria-disabled={!canGenerate}
              >
                {sameAsLast ? 'Rigenera' : 'Genera'}
              </Button>
              {isGenerating && (
                <span
                  role="status"
                  aria-label="Generazione in corso"
                  className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDiscard}
              >
                {isGenerating ? 'Annulla' : 'Scarta'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleInsert}
                disabled={isGenerating || displayed.length === 0}
                aria-disabled={isGenerating || displayed.length === 0}
              >
                Inserisci nella Nota
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default GenerateModal
