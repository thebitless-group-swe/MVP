import { useEffect, useRef } from 'react'
import { Annotation, EditorState, Transaction } from '@codemirror/state'
import { EditorView, lineNumbers, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap } from '@codemirror/search'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'

import { useCurrentText, useEditorStore } from '@/store/useEditorStore'
import { toggleLinkCommand } from '@/lib/editorCommands'

/*
 * Annotation per marcare le transazioni che originiamo NOI dal sync
 * store → editor. L'updateListener le riconosce e NON re-setta lo store
 * (eviterebbe un loop). Tutte le altre transazioni — digitazione, paste,
 * cancellazioni, undo, redo, drag — propagano allo store normalmente.
 */
const StoreSync = Annotation.define<boolean>()

export function Editor() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const currentText = useCurrentText()

  /*
   * Tiene traccia dell'ultimo _loadVersion visto, per distinguere un
   * caricamento di nota (notes.ts::loadDocument) da una modifica AI o
   * utente. Inizializzato dal valore reale allo store al mount, non da 0:
   * se la rehydration di notes.ts scattasse prima del mount, 0 sarebbe
   * già disallineato dal valore vero.
   */
  const prevLoadVersionRef = useRef(useEditorStore.getState()._loadVersion)

  /*
   * 1) Mount/unmount: crea l'EditorView UNA SOLA volta.
   *    Deps vuote per evitare ricreazione su cambi di store (CRITICO V9).
   *    Leggiamo il doc iniziale via getState() per non agganciare l'effect
   *    ai cambi di currentText.
   */
  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: useEditorStore.getState().currentText,
      extensions: [
        lineNumbers(),
        history(),
        markdown(),
        closeBrackets(),
        EditorView.lineWrapping,
        search({ top: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          ...searchKeymap,
          { key: 'Mod-k', run: toggleLinkCommand, preventDefault: true }
        ]),
        /*
         * Aggiorna lo store su QUALSIASI cambio del documento, tranne
         * le transazioni che abbiamo originato noi dal sync store→editor
         * (marcate con StoreSync). Così copriamo input, delete, paste,
         * undo, redo, drag, senza loop.
         */
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const mainSelection = update.state.selection.main
            const selectedText = mainSelection.empty
              ? ''
              : update.state.sliceDoc(mainSelection.from, mainSelection.to)

            // Evita dispatch superflui se il testo selezionato è identico
            const store = useEditorStore.getState()
            if (store.selectedText !== selectedText) {
              store.setSelectedText(selectedText)
            }
          }

          if (!update.docChanged) return
          const isOurSync = update.transactions.some(
            (tr) => tr.annotation(StoreSync) === true,
          )
          if (isOurSync) return
          useEditorStore
            .getState()
            .setCurrentText(update.state.doc.toString())
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    // Salva l'istanza nello store al mount
    useEditorStore.getState().setEditorView(view)

    return () => {
      view.destroy()
      viewRef.current = null
      useEditorStore.getState().setEditorView(null) // Pulizia al dismount
    }
  }, [])

  /*
   * 2) Sync programmatico: store → editor.
   *    Triggerato dai cambi di currentText. Il check sul delta evita
   *    dispatch superflui quando il cambio è già stato applicato (es. è
   *    arrivato dall'utente attraverso l'updateListener).
   *
   *    Un caricamento nota (notes.ts::loadDocument) incrementa
   *    _loadVersion; un inserimento AI o una digitazione utente no.
   *    Confrontando il valore con l'ultimo visto distinguiamo le due
   *    origini e, solo nel caso di caricamento, marchiamo la transazione
   *    con Transaction.addToHistory.of(false) così che la history di
   *    CodeMirror non registri lo scambio di nota (issue #24).
   *
   *    Passiamo sempre da dispatch(), mai da setState(): setState non
   *    produce una vera transazione, quindi non può portare annotation e
   *    non fa scattare updateListener — perderemmo la sincronizzazione di
   *    selectedText verso lo store a ogni cambio nota, oltre al rischio di
   *    perdere le estensioni se non tenute esplicitamente allineate.
   */
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const current = view.state.doc.toString()
    if (current === currentText) {
      view.focus()
      return
    }

    const currentLoadVersion = useEditorStore.getState()._loadVersion
    const isLoad = currentLoadVersion !== prevLoadVersionRef.current
    prevLoadVersionRef.current = currentLoadVersion

    view.dispatch({
      changes: { from: 0, to: current.length, insert: currentText },
      annotations: isLoad
        ? [StoreSync.of(true), Transaction.addToHistory.of(false)]
        : StoreSync.of(true),
    })
    view.focus()
  }, [currentText])

  return <div ref={containerRef} className="h-full min-h-0" />
}