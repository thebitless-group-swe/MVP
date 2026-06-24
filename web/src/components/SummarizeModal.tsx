import { useState } from 'react'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import { Dialog } from 'radix-ui'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useLlmStream } from '@/hooks/useLlmStream'
import { useTypewriter } from '@/hooks/useTypewriter'
import { getActiveText } from '@/lib/aiActions'
import { cn } from '@/lib/utils'
import {
  useAiModal,
  useCurrentText,
  useEditorStore,
  useErrorMessage,
  useIsGenerating,
  useStreamedOutput,
} from '@/store/useEditorStore'

type Length = 'breve' | 'medio' | 'dettagliato'

const LENGTHS: { value: Length; label: string }[] = [
  { value: 'breve', label: 'Breve' },
  { value: 'medio', label: 'Medio' },
  { value: 'dettagliato', label: 'Dettagliato' },
]

type SummarizeParams = { text: string; length: Length }

export function SummarizeModal() {
  const aiModal = useAiModal()
  const open = aiModal === 'summarize'

  const [length, setLength] = useState<Length>('medio')
  const [lastParams, setLastParams] = useState<SummarizeParams | null>(null)

  const { start, abort } = useLlmStream()
  const streamedOutput = useStreamedOutput()
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const currentText = useCurrentText()
  const displayed = useTypewriter(streamedOutput, isGenerating)

  const sameAsLast =
    lastParams !== null &&
    lastParams.text === currentText &&
    lastParams.length === length

  const handleGenerate = () => {
    abort()
    const snapshot: SummarizeParams = { text: getActiveText(), length }
    setLastParams(snapshot)
    useEditorStore.setState({ streamedOutput: '', errorMessage: null })
    start(snapshot.text, snapshot.length)
  }

  const handleCancel = () => {
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
        if (!next) handleCancel()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-background p-5 shadow-xl"
        >
          <Dialog.Title asChild>
            <div className="text-base font-semibold text-foreground">
              Riassumi nota
            </div>
          </Dialog.Title>

          <div
            role="radiogroup"
            aria-label="Lunghezza riassunto"
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

          <div
            aria-label="Anteprima riassunto"
            className={cn(
              'min-h-[180px] flex-1 overflow-auto rounded-md border border-border bg-card p-3',
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
                disabled={isGenerating}
                aria-disabled={isGenerating}
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
                onClick={handleCancel}
              >
                Annulla
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

export default SummarizeModal
