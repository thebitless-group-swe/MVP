import { create } from 'zustand'
import { EditorView } from '@codemirror/view'

// V4: layout dell'area di lavoro — solo editor, solo render, o affiancati.
export type ViewMode = 'editor' | 'render' | 'split'
// V4: quale modale AI è aperta (null = nessuna).
export type AiActionId = 
| 'summarize'
| 'translate'
| 'rewrite'
| 'grammar'
| 'critique'
| 'generate'
| 'generate-link'

export type AiModal = null | AiActionId

interface EditorState {
  currentText: string
  setCurrentText: (text: string) => void
  selectedText: string
  setSelectedText: (text: string) => void
  reset: () => void
  streamedOutput: string
  isGenerating: boolean
  startStreaming: () => void
  appendChunk: (chunk: string) => void
  finishStreaming: () => void
  errorMessage: string | null
  setError: (msg: string) => void
  clearError: () => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  aiModal: AiModal
  setAiModal: (modal: AiModal) => void
  insertOutputIntoNote: (insertMode?: 'replace' | 'append') => void
  discardOutput: () => void
  editorView: EditorView | null
  setEditorView: (view: EditorView | null) => void
  _abortController: AbortController | null
  _setAbortController: (c: AbortController | null) => void
  abortStream: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentText: '',
  setCurrentText: (text) => set({ currentText: text }),
  selectedText: '',
  setSelectedText: (text) => set({ selectedText: text }),
  reset: () => set({ currentText: '', selectedText: '' }),
  streamedOutput: '',
  isGenerating: false,
  startStreaming: () => set({ streamedOutput: '', isGenerating: true }),
  // callback form: su chunk consecutivi rapidi evita la race sullo stato letto fuori
  appendChunk: (chunk) =>
    set((s) => ({ streamedOutput: s.streamedOutput + chunk })),
  finishStreaming: () => set({ isGenerating: false }),
  errorMessage: null,
  // su errore fermiamo anche lo spinner: niente generazione in corso con errore a video
  setError: (msg) => set({ errorMessage: msg, isGenerating: false }),
  clearError: () => set({ errorMessage: null }),
  viewMode: 'split',
  setViewMode: (mode) => set({ viewMode: mode }),
  aiModal: null,
  setAiModal: (modal) => set({ aiModal: modal }),
  insertOutputIntoNote: (insertMode?: 'replace' | 'append') => {
    const { currentText, streamedOutput, selectedText} = get()
    const output = streamedOutput.trim()
    if (!output) return

    // La semantica di inserimento dipende dal TIPO di azione, non dalla
    // presenza di una selezione:
    //  - "genera" produce contenuto nuovo da input esterni (prompt/link):
    //    nella nota non c'è nulla da sostituire, quindi si ACCODA.
    //  - "riassumi" (e le altre trasformazioni del testo della nota)
    //    SOSTITUISCE il sorgente, coerente con getActiveText(): ciò che è
    //    stato dato in pasto al modello viene rimpiazzato dall'output.
    if (insertMode === 'append') {
      const sep =
        currentText.length > 0 && !currentText.endsWith('\n') ? '\n\n' : ''
      set({
        currentText: currentText + sep + output,
        streamedOutput: '',
        aiModal: null,
      })
      return
    }

    // Trasformazione (riassumi): se c'è una selezione ancora presente nel
    // testo sostituisce solo quella, altrimenti l'output sostituisce
    // l'intera nota (il riassunto della nota intera diventa la nota).
    if (selectedText.length > 0) {
      const idx = currentText.indexOf(selectedText)
      if (idx !== -1) {
        set({
          currentText:
            currentText.slice(0, idx) +
            output +
            currentText.slice(idx + selectedText.length),
          streamedOutput: '',
          selectedText: '',
          aiModal: null,
        })
        return
      }
    }

    set({
      currentText: output,
      streamedOutput: '',
      selectedText: '',
      aiModal: null,
    })
  },
  discardOutput: () =>
    set({
      streamedOutput: '',
      errorMessage: null,
      aiModal: null,
    }),
  editorView: null,
  setEditorView: (view) => set({ editorView: view }),

  _abortController: null,
  _setAbortController: (c) => set({ _abortController: c }),
  abortStream: () => {
    get()._abortController?.abort()
    set({_abortController: null})
  },
}))

// V9: selettore atomico — non esporre mai oggetti compositi
export const useSelectedText = () => useEditorStore((s) => s.selectedText)
export const useCurrentText = () => useEditorStore((s) => s.currentText)
export const useStreamedOutput = () => useEditorStore((s) => s.streamedOutput)
export const useIsGenerating = () => useEditorStore((s) => s.isGenerating)
export const useErrorMessage = () => useEditorStore((s) => s.errorMessage)
export const useViewMode = () => useEditorStore((s) => s.viewMode)
export const useAiModal = () => useEditorStore((s) => s.aiModal)
