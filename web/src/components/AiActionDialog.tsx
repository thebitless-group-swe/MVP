import { useState, useEffect } from 'react'
import { Dialog } from 'radix-ui'

import { MarkdownView } from '@/components/MarkdownView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTypewriter } from '@/hooks/useTypewriter'
import { useAiStream } from '@/hooks/useAiStream'
import { AI_ACTIONS, getActiveText } from '@/lib/aiActions'
import { cn } from '@/lib/utils'
import type { Length, Language, Style, Hat } from '@/types/models'
import {
  useAiModal,
  useEditorStore,
  useErrorMessage,
  useIsGenerating,
  useStreamedOutput,
  type AiActionId,
} from '@/store/useEditorStore'


const LENGTHS: { value: Length; label: string }[] = [
  { value: 'breve', label: 'Breve' },
  { value: 'medio', label: 'Medio' },
  { value: 'dettagliato', label: 'Dettagliato' },
]

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'it' as Language, label: 'Italiano' },
  { value: 'en' as Language, label: 'Inglese' },
  { value: 'fr' as Language, label: 'Francese' },
  { value: 'de' as Language, label: 'Tedesco' },
  { value: 'es' as Language, label: 'Spagnolo' },
]

const STYLES: { value: Style; label: string }[] = [
  { value: 'formal' as Style, label: 'Formale' },
  { value: 'casual' as Style, label: 'Casual' },
  { value: 'technical' as Style, label: 'Tecnico' },
  { value: 'simple' as Style, label: 'Semplice' },
]

const HATS: { value: Hat; label: string }[] = [
  { value: 'white' as Hat, label: 'Informativo' },
  { value: 'red' as Hat, label: 'Emotivo' },
  { value: 'black' as Hat, label: 'Critico' },
  { value: 'yellow' as Hat, label: 'Ottimista' },
  { value: 'green' as Hat, label: 'Creativo' },
  { value: 'blue' as Hat, label: 'Organizzativo' },
]


function getDefaultParams(actionId: AiActionId): Record<string, unknown> {
  switch (actionId) {
    case 'summarize':
    case 'generate':
    case 'generate-link':
      return { length: 'medio' as Length }
    case 'translate':
      return { target_language: LANGUAGES[0].value }
    case 'rewrite':
      return { style: STYLES[0].value }
    case 'critique':
      return { hat: HATS[0].value }
    case 'grammar':
      return {}
  }
}


function PillSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted p-1"
      >
        {options.map(({ value: v, label: optLabel }) => {
          const active = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={cn(
                'flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {optLabel}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}


type LastCall = { input: string; params: Record<string, unknown> }

export function AiActionDialog() {
  const actionId = useAiModal()
  const open = actionId !== null
  const action = actionId ? AI_ACTIONS[actionId] : null

  const [params, setParams] = useState<Record<string, unknown>>({})
  const [input, setInput] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastCall, setLastCall] = useState<LastCall | null>(null)

  const streamedOutput = useStreamedOutput()
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const displayed = useTypewriter(streamedOutput, isGenerating)
  const { start, abort } = useAiStream()

  // Resetta lo stato locale ogni volta che cambia l'azione aperta
  useEffect(() => {
    if (actionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParams(getDefaultParams(actionId))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput('')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValidationError(null)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastCall(null)
    }
  }, [actionId])

  if (!action || !actionId) return null

  // Per source 'text' l'input viene dall'editor, non da un campo UI
  const currentInput =
    action.source === 'text' ? getActiveText() : input.trim()

  const sameAsLast =
    lastCall !== null &&
    lastCall.input === currentInput &&
    JSON.stringify(lastCall.params) === JSON.stringify(params)

  const inputTooShort = currentInput.length < action.minLength


  const handleGenerate = () => {
    setValidationError(null)
    if (inputTooShort) {
      setValidationError(
        `Servono almeno ${action.minLength} caratteri di testo.`,
      )
      return
    }
    const body = action.buildBody(params, currentInput)
    setLastCall({ input: currentInput, params: { ...params } })
    useEditorStore.setState({ streamedOutput: '', errorMessage: null })
    void start({ endpoint: action.endpoint, body })
  }

  const handleAccept = () => {
    setLastCall(null)
    useEditorStore.getState().insertOutputIntoNote(action.insertMode)
  }

  const handleReject = () => {
    abort()
    setLastCall(null)
    useEditorStore.getState().discardOutput()
  }

  const handleStop = () => {
    abort()
    useEditorStore.getState().finishStreaming()
  }


  const renderInputSlot = () => {
    if (action.source === 'prompt') {
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Istruzioni / Contesto
          </span>
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setValidationError(null)
            }}
            rows={4}
            placeholder="Descrivi cosa generare..."
            className="min-h-[88px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )
    }
    if (action.source === 'url') {
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">URL</span>
          <input
            type="url"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setValidationError(null)
            }}
            placeholder="https://..."
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      )
    }
    return null 
  }


  const renderParamSlots = () => {
    switch (actionId) {
      case 'summarize':
      case 'generate':
      case 'generate-link':
        return (
          <PillSelector<Length>
            label="Lunghezza output"
            options={LENGTHS}
            value={(params.length as Length) ?? 'medio'}
            onChange={(v) => setParams((p) => ({ ...p, length: v }))}
          />
        )
      case 'translate':
        return (
          <PillSelector<Language>
            label="Lingua di destinazione"
            options={LANGUAGES}
            value={(params.target_language as Language) ?? LANGUAGES[0].value}
            onChange={(v) => setParams((p) => ({ ...p, target_language: v }))}
          />
        )
      case 'rewrite':
        return (
          <PillSelector<Style>
            label="Stile"
            options={STYLES}
            value={(params.style as Style) ?? STYLES[0].value}
            onChange={(v) => setParams((p) => ({ ...p, style: v }))}
          />
        )
      case 'critique':
        return (
          <PillSelector<Hat>
            label="Cappello"
            options={HATS}
            value={(params.hat as Hat) ?? HATS[0].value}
            onChange={(v) => setParams((p) => ({ ...p, hat: v }))}
          />
        )
      case 'grammar':
        return null
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) handleReject()
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
              {action.label}
            </div>
          </Dialog.Title>

          {renderInputSlot()}
          {renderParamSlots()}

          <div
            aria-label="Anteprima output"
            aria-live="polite"
            className={cn(
              'min-h-[200px] flex-1 overflow-auto rounded-md border border-border bg-card p-3',
              isGenerating && 'typing-active',
            )}
          >
            <MarkdownView className="prose-sm">{displayed}</MarkdownView>
          </div>

          {(validationError !== null || errorMessage !== null) && (
            <div aria-live="assertive">
              <Alert variant="destructive">
                <AlertDescription>
                  {validationError ?? errorMessage}
                </AlertDescription>
              </Alert>
            </div>
          )}

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
                <>
                  <span
                    role="status"
                    aria-label="Generazione in corso"
                    className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleStop}
                    aria-label="Interrompi generazione"
                  >
                    Interrompi
                  </Button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReject}
              >
                Rifiuta
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAccept}
                disabled={isGenerating || displayed.length === 0}
                aria-disabled={isGenerating || displayed.length === 0}
              >
                Accetta
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default AiActionDialog