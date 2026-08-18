import { useEffect, useRef } from 'react'
import { Annotation, EditorState, Transaction } from '@codemirror/state'
import { EditorView, lineNumbers, keymap } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { search, searchKeymap } from '@codemirror/search'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'

import { useCurrentText, useEditorStore } from '@/store/useEditorStore'
import { toggleLinkCommand } from '@/lib/editorCommands'

// Marca le transazioni che originiamo noi, senza si crea un loop con lo store.
const StoreSync = Annotation.define<boolean>()

export function Editor() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const currentText = useCurrentText()

  // Va inizializzato leggendo lo store e non a 0, altrimenti se la rehydration
  // di notes.ts parte prima del mount siamo gia' disallineati.
  const prevLoadVersionRef = useRef(useEditorStore.getState()._loadVersion)

  // Deps vuote apposta. Il testo iniziale si legge con getState(), agganciare
  // l'effect a currentText ricrea l'editor a ogni battuta.
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
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const mainSelection = update.state.selection.main
            const selectedText = mainSelection.empty
              ? ''
              : update.state.sliceDoc(mainSelection.from, mainSelection.to)

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
    useEditorStore.getState().setEditorView(view)

    return () => {
      view.destroy()
      viewRef.current = null
      useEditorStore.getState().setEditorView(null)
    }
  }, [])

  // Solo sul cambio nota va messo addToHistory.of(false), altrimenti con ctrl+z
  // si torna alla nota di prima.
  // Sempre dispatch(), mai setState(): setState non e' una transazione, non
  // porta annotation e non fa scattare updateListener.
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
