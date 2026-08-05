import type { ReactNode } from 'react'
import {
  Languages,
  Sparkles,
  Wand2,
  FileText,
  SpellCheck,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useCurrentNote } from '@/store/notes'
import {
  useAiModal,
  useEditorStore,
  useErrorMessage,
  useIsGenerating,
  type AiActionId,  
} from '@/store/useEditorStore'

type AiAction = {
  label: string
  icon: ReactNode
}



export interface TopBarProps {
  /** Override esplicito del titolo; se assente usa la nota corrente dello store. */
  noteTitle?: string
}

export function TopBar({ noteTitle }: TopBarProps) {
  const isGenerating = useIsGenerating()
  const errorMessage = useErrorMessage()
  const aiModal = useAiModal()
  const currentNote = useCurrentNote()
  const showStreamingUi = isGenerating

  const handleAbort = () => useEditorStore.getState().abortStream()

  // Titolo reattivo: prop esplicita > nota corrente > fallback.
  const displayTitle = noteTitle ?? currentNote?.title ?? 'Nota senza titolo'

  const openModal = (modal: AiActionId) => {
    useEditorStore.setState({
      streamedOutput: '',
      errorMessage: null,
      aiModal: modal,
    })
  }

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
          <Button type="button" size="sm" variant="secondary"
          onClick={() => openModal('generate')} disabled={isGenerating} aria-label="Genera">
          <Sparkles aria-hidden="true" /> Genera
        </Button>

        <Button type="button" size="sm" variant="secondary"
          onClick={() => openModal('summarize')} disabled={isGenerating} aria-label="Riassumi">
          <FileText aria-hidden="true" /> Riassumi
        </Button>

        <Button type="button" size="sm" variant="secondary"
          onClick={() => openModal('rewrite')} disabled={isGenerating} aria-label="Riscrivi">
          <Wand2 aria-hidden="true" /> Riscrivi
        </Button>

        <Button type="button" size="sm" variant="secondary"
          onClick={() => openModal('translate')} disabled={isGenerating} aria-label="Traduci">
          <Languages aria-hidden="true" /> Traduci
        </Button>

        <Button type="button" size="sm" variant="secondary"
          onClick={() => openModal('grammar')} disabled={isGenerating} aria-label="Grammatica">
          <SpellCheck aria-hidden="true" /> Grammatica
        </Button>

        {/* Analisi fuori scope */}
        <Button type="button" variant="outline" size="sm" disabled aria-disabled="true"
          title="Analisi (non disponibile)">
          <span aria-hidden="true" className="grayscale brightness-0 opacity-100">🧢</span>
          Analisi
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
              onClick={handleAbort}
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
