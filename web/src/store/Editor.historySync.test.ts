import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState, Transaction, Annotation } from '@codemirror/state'
import { history, undo, undoDepth } from '@codemirror/commands'
import { useEditorStore } from '@/store/useEditorStore'

const StoreSync = Annotation.define<boolean>()

// Riproduce la decisione presa dal secondo effect di Editor.tsx, senza
// montare un vero EditorView + React: usa lo useEditorStore reale, quindi
// esercita la logica vera di loadDocument/_loadVersion.
function makeSyncHarness() {
  let lastSeenVersion = useEditorStore.getState()._loadVersion
  let cmState = EditorState.create({
    doc: useEditorStore.getState().currentText,
    extensions: [history()],
  })

  function applyStoreSync() {
    const currentText = useEditorStore.getState().currentText
    const current = cmState.doc.toString()
    if (current === currentText) return

    const loadVersion = useEditorStore.getState()._loadVersion
    const isLoad = loadVersion !== lastSeenVersion
    lastSeenVersion = loadVersion

    cmState = cmState.update({
      changes: { from: 0, to: current.length, insert: currentText },
      annotations: isLoad
        ? [StoreSync.of(true), Transaction.addToHistory.of(false)]
        : StoreSync.of(true),
    }).state
  }

  function typeAtEnd(insertText: string) {
    cmState = cmState.update({
      changes: { from: cmState.doc.length, to: cmState.doc.length, insert: insertText },
    }).state
  }

  function tryUndo() {
    const view = { state: cmState, dispatch: (tr: Transaction) => { cmState = tr.state } }
    return undo(view)
  }

  return {
    applyStoreSync,
    typeAtEnd,
    tryUndo,
    get doc() { return cmState.doc.toString() },
    get undoDepth() { return undoDepth(cmState) },
  }
}

describe('#24 — history al cambio nota', () => {
  beforeEach(() => {
    useEditorStore.setState({ currentText: '', _loadVersion: 0 })
  })

  it('Ctrl+Z dopo un cambio nota non riporta il contenuto della nota precedente', () => {
    const harness = makeSyncHarness()

    useEditorStore.getState().loadDocument('NOTA A')
    harness.applyStoreSync()

    harness.typeAtEnd(' modificata')
    expect(harness.undoDepth).toBe(1)

    useEditorStore.getState().loadDocument('NOTA B')
    harness.applyStoreSync()

    expect(harness.undoDepth).toBe(0)
    expect(harness.tryUndo()).toBe(false)
    expect(harness.doc).toBe('NOTA B')
  })

  it('una modifica fatta dopo il caricamento resta annullabile', () => {
    const harness = makeSyncHarness()

    useEditorStore.getState().loadDocument('NOTA B')
    harness.applyStoreSync()

    harness.typeAtEnd(' modificata di nuovo')
    expect(harness.undoDepth).toBe(1)

    expect(harness.tryUndo()).toBe(true)
    expect(harness.doc).toBe('NOTA B')
  })

  it('caricare due volte la stessa nota non introduce drift nel contatore', () => {
    const harness = makeSyncHarness()

    useEditorStore.getState().loadDocument('NOTA A')
    harness.applyStoreSync()
    useEditorStore.getState().loadDocument('NOTA A') // stesso testo, no-op atteso
    harness.applyStoreSync()

    harness.typeAtEnd(' scritta dopo doppio load')
    expect(harness.undoDepth).toBe(1)
    expect(harness.tryUndo()).toBe(true)
  })
})