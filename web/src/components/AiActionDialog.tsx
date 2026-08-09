import { useState, useEffect } from 'react'
import { Dialog } from 'radix-ui'

import { MarkdownView } from '@/components/MarkdownView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTypewriter } from '@/hooks/useTypewriter'
import { useAiStream } from '@/hooks/useAiStream'
import { api } from '@/lib/api'
import { AI_ACTIONS, getActiveText, type AiParams } from '@/lib/aiActions'
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
import { NO_ERRORS_MARKER } from '@/types/models'


// I `value` di queste costanti sono valori del CONTRATTO e non testo di
// interfaccia: devono coincidere con i Literal di types/api.ts. Le `label`
// restano invece testo di interfaccia, in italiano.
//
// `satisfies` al posto dell'annotazione `: T[]` e' deliberato: l'annotazione
// allarga i letterali a `Language`/`Style`/`Hat` e permette a un cast di
// nascondere un valore fuori contratto, che e' esattamente come «Traduci» e
// «Riscrivi» sono arrivati a rispondere 422 a ogni click.

const LENGTHS = [
  { value: 'breve', label: 'Breve' },
  { value: 'medio', label: 'Medio' },
  { value: 'dettagliato', label: 'Dettagliato' },
] satisfies { value: Length; label: string }[]

// R-58-F-Ob / UC63.1: quattro lingue di destinazione. L'italiano non e' fra
// queste — tradurre in italiano un testo scritto in italiano non e' un caso
// d'uso previsto.
const LANGUAGES = [
  { value: 'inglese', label: 'Inglese' },
  { value: 'francese', label: 'Francese' },
  { value: 'tedesco', label: 'Tedesco' },
  { value: 'spagnolo', label: 'Spagnolo' },
] satisfies { value: Language; label: string }[]

// R-60-F-Ob / UC64.1: tre registri.
const STYLES = [
  { value: 'formale', label: 'Formale' },
  { value: 'informale', label: 'Informale' },
  { value: 'accademico', label: 'Accademico' },
] satisfies { value: Style; label: string }[]

type HatDef = {
  value: Hat
  emoji: string
  label: string
  description: string
  color: string
}

// R-65 -> R-70-F-Ob: i sei cappelli. Le etichette («Informativo», «Emotivo», …)
// sono di interfaccia; i `value` sono i nomi dei colori attesi dal contratto.
const HAT_DEFS = [
  { value: 'bianco', emoji: '⚪', label: 'Informativo', description: 'Fatti, dati e informazioni oggettive', color: 'border-gray-300 bg-gray-50 text-gray-800' },
  { value: 'rosso', emoji: '🔴', label: 'Emotivo', description: 'Intuizioni, emozioni e sensazioni', color: 'border-red-300 bg-red-50 text-red-800' },
  { value: 'nero', emoji: '⚫', label: 'Critico', description: 'Difficoltà, rischi e punti deboli', color: 'border-gray-700 bg-gray-800 text-gray-100' },
  { value: 'giallo', emoji: '🟡', label: 'Ottimista', description: 'Vantaggi, benefici e opportunità', color: 'border-yellow-300 bg-yellow-50 text-yellow-800' },
  { value: 'verde', emoji: '🟢', label: 'Creativo', description: 'Nuove idee, alternative e soluzioni', color: 'border-green-300 bg-green-50 text-green-800' },
  { value: 'blu', emoji: '🔵', label: 'Organizzativo', description: 'Processo, struttura e prossimi passi', color: 'border-blue-300 bg-blue-50 text-blue-800' },
] satisfies HatDef[]

// Esaustivita' nella direzione opposta a `satisfies`.
//
// `satisfies` garantisce che nessun valore dell'interfaccia sia fuori dal
// contratto (il difetto di oggi). Queste righe garantiscono il contrario: che
// nessun valore del contratto manchi dall'interfaccia (il difetto di domani, se
// il backend aggiunge una lingua e il menu la omette in silenzio). Se `Exclude`
// non collassa a `never`, il vincolo `T extends never` non e' soddisfatto e la
// compilazione fallisce.
type Exhaustive<T extends never> = T

export type LengthsCoverContract = Exhaustive<
  Exclude<Length, (typeof LENGTHS)[number]['value']>
>
export type LanguagesCoverContract = Exhaustive<
  Exclude<Language, (typeof LANGUAGES)[number]['value']>
>
export type StylesCoverContract = Exhaustive<
  Exclude<Style, (typeof STYLES)[number]['value']>
>
export type HatsCoverContract = Exhaustive<
  Exclude<Hat, (typeof HAT_DEFS)[number]['value']>
>

function getDefaultParams(actionId: AiActionId): AiParams {
  switch (actionId) {
    case 'summarize':
    case 'generate':
    case 'generate-link':
      return { length: 'medio' }
    case 'translate':
      return { target_language: LANGUAGES[0].value }
    case 'rewrite':
      return { style: STYLES[0].value }
    case 'critique':
      return {}
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

function HatSelector({
  value,
  onChange,
}: {
  value: Hat | null
  onChange: (v: Hat) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground">
        Prospettiva (cappello)
      </legend>
      <div role="radiogroup" aria-label="Seleziona cappello" className="grid grid-cols-2 gap-2">
        {HAT_DEFS.map(({ value: v, emoji, label, description, color }) => {
          const active = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? color : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              <span className="font-medium">{emoji} {label}</span>
              <span className="text-xs opacity-70">{description}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}


type LastCall = { input: string; params: AiParams }

export function AiActionDialog() {
  const actionId = useAiModal()
  const open = actionId !== null
  const action = actionId ? AI_ACTIONS[actionId] : null

  const [params, setParams] = useState<AiParams>({})
  const [input, setInput] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [lastCall, setLastCall] = useState<LastCall | null>(null)

  const streamedOutput = useStreamedOutput()
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const displayed = useTypewriter(streamedOutput, isGenerating)
  const { start, abort } = useAiStream()

  const isNoErrors = 
    actionId === 'grammar' &&
    !isGenerating &&
    streamedOutput === NO_ERRORS_MARKER

  // Resetta lo stato locale ogni volta che cambia l'azione aperta
  useEffect(() => {
    if (actionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParams(getDefaultParams(actionId))
      setInput('')
      setValidationError(null)
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
    if (actionId === 'critique' && !params.hat) {
      setValidationError('Seleziona un cappello per l\'analisi.')
      return
    }

   setLastCall({ input: currentInput, params: { ...params } })
  useEditorStore.setState({ streamedOutput: '', errorMessage: null })

  let streamFn: () => AsyncIterable<string>
  switch (actionId) {
    case 'summarize':
      streamFn = () => api.summarize(currentInput, params.length ?? 'medio')
      break
    case 'translate':
      streamFn = () => api.translate(currentInput, params.target_language ?? LANGUAGES[0].value)
      break
    case 'rewrite':
      streamFn = () => api.rewrite(currentInput, params.style ?? STYLES[0].value)
      break
    case 'grammar':
      streamFn = () => api.grammar(currentInput)
      break
    case 'critique':
      streamFn = () => api.critique(currentInput, params.hat!)
      break
    case 'generate':
      streamFn = () => api.generate(currentInput, params.length ?? 'medio')
      break
    case 'generate-link':
      streamFn = () => api.generateFromLink(currentInput, params.length ?? 'medio')
      break
    default:
      return
  }

  void start(streamFn)
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
            value={params.length ?? 'medio'}
            onChange={(v) => setParams((p) => ({ ...p, length: v }))}
          />
        )
      case 'translate':
        return (
          <PillSelector<Language>
            label="Lingua di destinazione"
            options={LANGUAGES}
            value={params.target_language ?? LANGUAGES[0].value}
            onChange={(v) => setParams((p) => ({ ...p, target_language: v }))}
          />
        )
      case 'rewrite':
        return (
          <PillSelector<Style>
            label="Stile"
            options={STYLES}
            value={params.style ?? STYLES[0].value}
            onChange={(v) => setParams((p) => ({ ...p, style: v }))}
          />
        )
      case 'critique':
        return (
          <HatSelector
            value={params.hat ?? null}
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
            {isNoErrors ? (
               <p className="text-sm text-muted-foreground">Nessun errore rilevato.</p>
              ) : (
                <MarkdownView className="prose-sm">{displayed}</MarkdownView>
              )}
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
                disabled={isGenerating || displayed.length === 0 || isNoErrors}
                aria-disabled={isGenerating || displayed.length === 0 || isNoErrors}
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