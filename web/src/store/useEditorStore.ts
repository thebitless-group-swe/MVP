import { create } from 'zustand'
import { EditorView } from '@codemirror/view'
import type { AiParams } from '@/lib/aiActions'

export type ViewMode = 'editor' | 'render' | 'split'
export type AiActionId =
| 'summarize'
| 'translate'
| 'rewrite'
| 'grammar'
| 'critique'
| 'generate'
| 'generate-link'

export type AiModal = null | AiActionId

export type LastCall = {
  input: string
  params: AiParams
  mode?: 'prompt' | 'link'
  actionId: AiActionId
  execute: (signal: AbortSignal) => AsyncIterable<string>
}

interface EditorState {
  currentText: string
  setCurrentText: (text: string) => void
  loadDocument: (text: string) => void
  _loadVersion: number
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
  resetPreview: () => void
  editorView: EditorView | null
  setEditorView: (view: EditorView | null) => void
  _abortController: AbortController | null
  _setAbortController: (c: AbortController | null) => void
  abortStream: () => void
  lastCall: LastCall | null
  setLastCall: (call: LastCall) => void
  clearLastCall: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentText: '',
  setCurrentText: (text) => set({ currentText: text }),
  loadDocument: (text) => {
    if (get().currentText === text) return
    set((s) => ({ currentText: text, _loadVersion: s._loadVersion + 1 }))
  },
  _loadVersion: 0,
  selectedText: '',
  setSelectedText: (text) => set({ selectedText: text }),
  reset: () => set({ currentText: '', selectedText: '' }),
  streamedOutput: '',
  isGenerating: false,
  startStreaming: () => set({ streamedOutput: '', isGenerating: true }),
  //Forma a callback, su chunk rapidi evita la race sullo stato
  appendChunk: (chunk) =>
    set((s) => ({ streamedOutput: s.streamedOutput + chunk })),
  finishStreaming: () => set({ isGenerating: false }),
  errorMessage: null,
  lastCall: null,
  setLastCall: (call) => set({ lastCall: call }),
  clearLastCall: () => set({ lastCall: null }),
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

    //Genera accoda perche' crea roba nuova, le trasformazioni sostituiscono.
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

  //Prima si annulla e poi si pulisce. Se pulite e basta, useAiStream continua a
  //chiamare appendChunk e i chunk vecchi ricompaiono nell'anteprima svuotata.
  resetPreview: () => {
    get().abortStream()
    set({ streamedOutput: '', errorMessage: null })
  },
  editorView: null,
  setEditorView: (view) => set({ editorView: view }),

  _abortController: null,
  _setAbortController: (c) => set({ _abortController: c }),
  abortStream: () => {
    get()._abortController?.abort()
    set({ _abortController: null, isGenerating: false })
  },
}))

//Selettori atomici, non esponete oggetti compositi o si ri-renderizza tutto
export const useSelectedText = () => useEditorStore((s) => s.selectedText)
export const useCurrentText = () => useEditorStore((s) => s.currentText)
export const useStreamedOutput = () => useEditorStore((s) => s.streamedOutput)
export const useIsGenerating = () => useEditorStore((s) => s.isGenerating)
export const useErrorMessage = () => useEditorStore((s) => s.errorMessage)
export const useViewMode = () => useEditorStore((s) => s.viewMode)
export const useAiModal = () => useEditorStore((s) => s.aiModal)
