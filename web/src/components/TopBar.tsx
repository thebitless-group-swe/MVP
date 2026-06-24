import type { ReactNode } from 'react'
import {
  Languages,
  Sparkles,
  Wand2,
  FileText,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useLlmStream } from '@/hooks/useLlmStream'
import { useCurrentNote } from '@/store/notes'
import {
  useAiModal,
  useEditorStore,
  useErrorMessage,
  useIsGenerating,
} from '@/store/useEditorStore'

type AiAction = {
  label: string
  icon: ReactNode
}

const disabledActions: AiAction[] = [
  { label: 'Migliora', icon: <Wand2 aria-hidden="true" /> },
  { label: 'Traduci', icon: <Languages aria-hidden="true" /> },
  {
    label: 'Analisi',
    icon: (
      <span aria-hidden="true" className="grayscale brightness-0 opacity-100">
        🧢
      </span>
    ),
  },
]

export interface TopBarProps {
  /** Override esplicito del titolo; se assente usa la nota corrente dello store. */
  noteTitle?: string
}

export function TopBar({ noteTitle }: TopBarProps) {
  const { abort } = useLlmStream()
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const aiModal = useAiModal()
  const currentNote = useCurrentNote()
  const showStreamingUi = isGenerating && aiModal === null

  // Titolo reattivo: prop esplicita > nota corrente > fallback.
  const displayTitle = noteTitle ?? currentNote?.title ?? 'Nota senza titolo'

  const openModal = (modal: 'summarize' | 'generate') => {
    useEditorStore.setState({
      streamedOutput: '',
      errorMessage: null,
      aiModal: modal,
    })
  }
  const onSummarize = () => openModal('summarize')
  const onGenerate = () => openModal('generate')

  return (
    <header className="flex flex-col gap-2 border-b border-border bg-background px-4 py-3">
      {/* Titolo della nota: da solo in cima, in evidenza. */}
      <div
        role="heading"
        aria-level={1}
        className="truncate text-lg font-semibold tracking-tight text-foreground"
      >
        {displayTitle}
      </div>

      {/* Riga azioni AI, sotto il titolo. */}
      <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onGenerate}
            disabled={isGenerating}
            aria-disabled={isGenerating}
            aria-label="Genera"
          >
            <Sparkles aria-hidden="true" />
            Genera
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onSummarize}
            disabled={isGenerating}
            aria-disabled={isGenerating}
            aria-label="Riassumi"
          >
            <FileText aria-hidden="true" />
            Riassumi
          </Button>

          {disabledActions.map(({ label, icon }) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              size="sm"
              disabled
              aria-disabled="true"
              title={`${label} (non disponibile)`}
            >
              {icon}
              {label}
            </Button>
          ))}

          {showStreamingUi && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={abort}
              aria-label="Interrompi generazione in corso"
            >
              Interrompi
            </Button>
          )}

          {showStreamingUi && (
            <span
              role="status"
              aria-label="Generazione in corso"
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground"
            />
          )}
        </div>

      <div aria-live="polite">
        {errorMessage && aiModal === null && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
      </div>
    </header>
  )
}

export default TopBar
