import { create } from 'zustand'
import { EditorView } from '@codemirror/view'
import type { AiParams } from '@/lib/aiActions'

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

export type LastCall = {
  input: string
  params: AiParams
  mode?: 'prompt' | 'link'
  actionId: AiActionId
  //Il signal arriva per parametro a ogni esecuzione, e non catturato nella
  //chiusura: «Rigenera» riesegue questa stessa funzione, e un signal catturato
  //alla creazione sarebbe gia' annullato al secondo giro.
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
  // callback form: su chunk consecutivi rapidi evita la race sullo stato letto fuori
  appendChunk: (chunk) =>
    set((s) => ({ streamedOutput: s.streamedOutput + chunk })),
  finishStreaming: () => set({ isGenerating: false }),
  errorMessage: null,
  lastCall: null,
  setLastCall: (call) => set({ lastCall: call }),
  clearLastCall: () => set({ lastCall: null }),
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

  //Sorella di `discardOutput`, e la differenza e' l'ultima riga: quella chiude
  //la modale perche' l'utente ha finito, questa la lascia aperta perche'
  //l'utente sta riformulando la richiesta — cambia sorgente, lingua, stile,
  //cappello o lunghezza.
  //
  //Perche' e' un'azione dello store e non `set({ streamedOutput: '' })`
  //scritto nei sei punti che ne hanno bisogno: quei sei punti dimenticherebbero
  //l'annullamento. `streamedOutput` non e' l'unica cosa da azzerare — c'e' una
  //richiesta HTTP aperta che continua a produrre, e `useAiStream` continua a
  //chiamare `appendChunk`. Pulire senza chiudere fa ricomparire nell'anteprima
  //appena svuotata i chunk della richiesta che l'utente ha appena abbandonato.
  //
  //L'annullamento passa per `abortStream` invece di ripeterne il corpo: come
  //si chiude una richiesta in corso e' deciso li' (UC71), e deve restare una
  //decisione sola.
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
    //L'indicatore di attesa si spegne qui, non «quando il loop se ne accorge».
    //R-109-F-De parla della durata percepita dall'utente, e i due comandi di
    //annullamento — quello della TopBar, che passa di qui, e quello della
    //modale, che passa dall'hook — devono comportarsi allo stesso modo.
    set({ _abortController: null, isGenerating: false })
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
