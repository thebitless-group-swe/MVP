import { useReducer, useEffect } from 'react'
import { Dialog } from 'radix-ui'
import {
  useAiModal,
  useEditorStore,
  useErrorMessage,
  useIsGenerating,
  useStreamedOutput,
  type AiActionId,
  type LastCall,
} from '@/store/useEditorStore'
import { MarkdownView } from '@/components/MarkdownView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTypewriter } from '@/hooks/useTypewriter'
import { useAiStream } from '@/hooks/useAiStream'
import { api } from '@/lib/api'
import { AI_ACTIONS, getActiveText, type AiParams } from '@/lib/aiActions'
import { cn } from '@/lib/utils'
import type { Length, Language, Style, Hat } from '@/types/models'
import { NO_ERRORS_MARKER } from '@/types/models'


// Usate `satisfies` e non l'annotazione `: T[]`, che allarga i letterali e
// lascia passare un valore fuori contratto (Traduci e Riscrivi hanno risposto
// 422 a ogni click per questo).

const LENGTHS = [
  { value: 'breve', label: 'Breve' },
  { value: 'medio', label: 'Medio' },
  { value: 'dettagliato', label: 'Dettagliato' },
] satisfies { value: Length; label: string }[]

// R-58-F-Ob, UC63.1. L'italiano non c'e' apposta.
const LANGUAGES = [
  { value: 'inglese', label: 'Inglese' },
  { value: 'francese', label: 'Francese' },
  { value: 'tedesco', label: 'Tedesco' },
  { value: 'spagnolo', label: 'Spagnolo' },
] satisfies { value: Language; label: string }[]

// R-60-F-Ob, UC64.1.
const STYLES = [
  { value: 'formale', label: 'Formale' },
  { value: 'informale', label: 'Informale' },
  { value: 'accademico', label: 'Accademico' },
] satisfies { value: Style; label: string }[]

type HatDef = {
  value: Hat
  label: string
  description: string
  color: string
}

// R-65 -> R-70-F-Ob.
const HAT_DEFS = [
  { value: 'bianco', label: 'Informativo', description: 'Fatti, dati e informazioni oggettive', color: 'border-gray-300 bg-gray-50 text-gray-900' },
  { value: 'rosso', label: 'Emotivo', description: 'Intuizioni, emozioni e sensazioni', color: 'border-red-300 bg-red-50 text-red-900' },
  { value: 'nero', label: 'Critico', description: 'Difficoltà, rischi e punti deboli', color: 'border-gray-500 bg-gray-300 text-gray-900' },
  { value: 'giallo', label: 'Ottimista', description: 'Vantaggi, benefici e opportunità', color: 'border-yellow-300 bg-yellow-50 text-yellow-900' },
  { value: 'verde', label: 'Creativo', description: 'Nuove idee, alternative e soluzioni', color: 'border-green-300 bg-green-50 text-green-900' },
  { value: 'blu', label: 'Organizzativo', description: 'Processo, struttura e prossimi passi', color: 'border-blue-300 bg-blue-50 text-blue-900' },
] satisfies HatDef[]

type UiState = {
  params: AiParams
  input: string
  mode: 'prompt' | 'link'
  validationError: string | null
}

type UiAction =
  | { type: 'SET_PARAMS'; payload: AiParams }
  | { type: 'SET_INPUT'; payload: string }
  | { type: 'SET_MODE'; payload: 'prompt' | 'link' }
  | { type: 'SET_VALIDATION_ERROR'; payload: string | null }
  | { type: 'RESTORE_FROM_LAST_CALL'; payload: { params: AiParams; input: string; mode: 'prompt' | 'link' } }
  | { type: 'RESET_DEFAULT'; payload: { actionId: AiActionId } }

  const uiReducer = (state: UiState, action: UiAction): UiState => {
  switch (action.type) {
    case 'SET_PARAMS':
      return { ...state, params: action.payload }
    case 'SET_INPUT':
      return { ...state, input: action.payload }
    case 'SET_MODE':
      return { ...state, mode: action.payload }
    case 'SET_VALIDATION_ERROR':
      return { ...state, validationError: action.payload }
    case 'RESTORE_FROM_LAST_CALL':
      return {
        params: action.payload.params,
        input: action.payload.input,
        mode: action.payload.mode,
        validationError: null,
      }
    case 'RESET_DEFAULT':
      return {
        params: getDefaultParams(action.payload.actionId),
        input: '',
        mode: 'prompt',
        validationError: null,
      }
    default:
      return state
  }
}
// Direzione opposta a `satisfies`, impedisce che il backend aggiunga una
// lingua e il menu la ometta in silenzio.
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
        {HAT_DEFS.map(({ value: v, label, description, color }) => {
          const active = value === v
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                color,
                active
                  ? 'ring-2 ring-offset-2 ring-foreground'
                  : 'opacity-80 hover:opacity-100',
              )}
            >
              <span className="font-medium">{label}</span>
              <span className="text-xs opacity-75">{description}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

// aiModal resta sempre 'generate', e' `mode` a decidere quale funzione della
// Facade chiamare al submit.
function GenerateSourceTabs({
  mode,
  onChange,
}: {
  mode: 'prompt' | 'link'
  onChange: (m: 'prompt' | 'link') => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Sorgente della generazione"
      className="flex gap-1 rounded-md border border-border bg-muted p-1"
    >
      <button
        type="button"
        role="tab"
        id="generate-tab-prompt"
        aria-selected={mode === 'prompt'}
        aria-controls="generate-panel-prompt"
        onClick={() => onChange('prompt')}
        className={cn(
          'flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          mode === 'prompt'
            ? 'bg-background font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Da prompt
      </button>
      <button
        type="button"
        role="tab"
        id="generate-tab-link"
        aria-selected={mode === 'link'}
        aria-controls="generate-panel-link"
        onClick={() => onChange('link')}
        className={cn(
          'flex-1 rounded-sm px-3 py-1.5 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          mode === 'link'
            ? 'bg-background font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Da link
      </button>
    </div>
  )
}


export function AiActionDialog() {
  const actionId = useAiModal()
  const open = actionId !== null
  const action = actionId ? AI_ACTIONS[actionId] : null

  const [uiState, dispatch] = useReducer(uiReducer, {
    params: {},
    input: '',
    mode: 'prompt',
    validationError: null,
  })

  const { params, input, mode, validationError } = uiState

  const lastCall = useEditorStore((s) => s.lastCall)
  const clearLastCall = useEditorStore((s) => s.clearLastCall)

  const streamedOutput = useStreamedOutput()
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const displayed = useTypewriter(streamedOutput, isGenerating)
  const { start, abort } = useAiStream()

  const isNoErrors =
    actionId === 'grammar' &&
    !isGenerating &&
    streamedOutput === NO_ERRORS_MARKER

  useEffect(() => {
    if (actionId) {
      const stored = useEditorStore.getState().lastCall
      if (stored && stored.actionId === actionId) {
        dispatch({
          type: 'RESTORE_FROM_LAST_CALL',
          payload: {
            params: stored.params,
            input: stored.input,
            mode: stored.mode ?? 'prompt',
          },
        })
      } else {
        dispatch({
          type: 'RESET_DEFAULT',
          payload: { actionId },
        })
      }
    }
  }, [actionId])

  if (!action || !actionId) return null

  const currentInput =
    action.source === 'text' ? getActiveText() : input.trim()

  const sameAsLast =
    lastCall !== null &&
    lastCall.actionId === actionId &&
    lastCall.input === currentInput &&
    lastCall.mode === mode &&
    JSON.stringify(lastCall.params) === JSON.stringify(params)

  const effectiveMinLength =
    actionId === 'generate' && mode === 'link'
      ? AI_ACTIONS['generate-link'].minLength
      : action.minLength
  const effectiveMaxLength =
    actionId === 'generate' && mode === 'link'
      ? AI_ACTIONS['generate-link'].maxLength
      : action.maxLength

  const inputTooShort = currentInput.length < effectiveMinLength
  const inputTooLong =
    effectiveMaxLength !== null && currentInput.length > effectiveMaxLength

  const resetPreview = () => useEditorStore.getState().resetPreview()

  // La guardia serve, PillSelector chiama onChange anche quando si ri-clicca la
  // voce gia' attiva e senza si perde l'output cliccando due volte «Medio».
  const handleModeChange = (next: 'prompt' | 'link') => {
    if (next === mode) return
    resetPreview()
    dispatch({ type: 'SET_MODE', payload: next })
    dispatch({ type: 'SET_INPUT', payload: '' })
    dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
  }

  // Ci passano tutti i selettori, cosi' un sesto non si dimentica il reset.
  const handleParamsChange = (next: AiParams) => {
    if (JSON.stringify(next) === JSON.stringify(params)) return
    resetPreview()
    dispatch({ type: 'SET_PARAMS', payload: next })
  }

  const handleGenerate = () => {
    dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
    if (inputTooShort) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        payload: actionId === 'generate' && mode === 'link'
          ? 'Inserisci un URL.'
          : `Servono almeno ${effectiveMinLength} caratteri di testo.`,
      })
      return
    }
    if (inputTooLong) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        payload: `Il testo supera il massimo di ${effectiveMaxLength} caratteri ` +
          `(attuali: ${currentInput.length}). Riducilo o elaboralo in più parti.`,
      })
      return
    }
    if (actionId === 'critique' && !params.hat) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        payload: 'Seleziona un cappello per l\'analisi.',
      })
      return
    }

    useEditorStore.setState({ streamedOutput: '', errorMessage: null })

    if (sameAsLast && lastCall) {
      void start(lastCall.execute)
      return
    }

    let streamFn: (signal: AbortSignal) => AsyncIterable<string>
    switch (actionId) {
      case 'summarize':
        streamFn = (signal) => api.summarize(currentInput, params.length ?? 'medio', signal)
        break
      case 'translate':
        streamFn = (signal) =>
          api.translate(currentInput, params.target_language ?? LANGUAGES[0].value, signal)
        break
      case 'rewrite':
        streamFn = (signal) => api.rewrite(currentInput, params.style ?? STYLES[0].value, signal)
        break
      case 'grammar':
        streamFn = (signal) => api.grammar(currentInput, signal)
        break
      case 'critique':
        streamFn = (signal) => api.critique(currentInput, params.hat!, signal)
        break
      case 'generate':
        streamFn = mode === 'link'
          ? (signal) => api.generateFromLink(currentInput, params.length ?? 'medio', signal)
          : (signal) => api.generate(currentInput, params.length ?? 'medio', signal)
        break
      case 'generate-link':
        streamFn = (signal) => api.generateFromLink(currentInput, params.length ?? 'medio', signal)
        break
      default:
        return
    }

    const newCall: LastCall = {
      actionId,
      input: currentInput,
      params: { ...params },
      mode,
      execute: streamFn,
    }
    useEditorStore.getState().setLastCall(newCall)

    void start(streamFn)
  }

  const handleAccept = () => {
    clearLastCall()
    useEditorStore.getState().insertOutputIntoNote(action.insertMode)
  }

  const handleReject = () => {
    abort()
    clearLastCall()
    useEditorStore.getState().discardOutput()
  }

  const handleStop = () => {
    abort()
  }

  const renderInputSlot = () => {
    if (actionId === 'generate') {
      return (
        <div className="flex flex-col gap-3">
          <GenerateSourceTabs mode={mode} onChange={handleModeChange} />
          {mode === 'prompt' ? (
            <label
              id="generate-panel-prompt"
              role="tabpanel"
              aria-labelledby="generate-tab-prompt"
              className="flex flex-col gap-1.5"
            >
              <span className="text-sm font-medium text-foreground">Istruzioni / Contesto</span>
              <textarea
                value={input}
                onChange={(e) => {
                  dispatch({ type: 'SET_INPUT', payload: e.target.value })
                  dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
                }}
                rows={4}
                placeholder="Descrivi cosa generare..."
                className="min-h-[88px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          ) : (
            <label
              id="generate-panel-link"
              role="tabpanel"
              aria-labelledby="generate-tab-link"
              className="flex flex-col gap-1.5"
            >
              <span className="text-sm font-medium text-foreground">URL</span>
              <input
                type="url"
                value={input}
                onChange={(e) => {
                  dispatch({ type: 'SET_INPUT', payload: e.target.value })
                  dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
                }}
                placeholder="https://..."
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}
        </div>
      )
    }
    if (action.source === 'prompt') {
      return (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Istruzioni / Contesto</span>
          <textarea
            value={input}
            onChange={(e) => {
              dispatch({ type: 'SET_INPUT', payload: e.target.value })
              dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
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
              dispatch({ type: 'SET_INPUT', payload: e.target.value })
              dispatch({ type: 'SET_VALIDATION_ERROR', payload: null })
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
            onChange={(v) => handleParamsChange({ ...params, length: v })}
          />
        )
      case 'translate':
        return (
          <PillSelector<Language>
            label="Lingua di destinazione"
            options={LANGUAGES}
            value={params.target_language ?? LANGUAGES[0].value}
            onChange={(v) => handleParamsChange({ ...params, target_language: v })}
          />
        )
      case 'rewrite':
        return (
          <PillSelector<Style>
            label="Stile"
            options={STYLES}
            value={params.style ?? STYLES[0].value}
            onChange={(v) => handleParamsChange({ ...params, style: v })}
          />
        )
      case 'critique':
        return (
          <HatSelector
            value={params.hat ?? null}
            onChange={(v) => handleParamsChange({ ...params, hat: v })}
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
        if (!next) {
          //Qui passano solo Escape e il clic sull'overlay. Senza l'abort lo
          //stream resta orfano e il provider continua a produrre (UC71).
          if (useEditorStore.getState().isGenerating) {
            abort()
          }
          useEditorStore.getState().setAiModal(null)
        }
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