// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNotesStore, useNotesList, useCurrentNote } from '@/store/notes'
import { useEditorStore } from '@/store/useEditorStore'

// Creiamo i mock delle funzioni prima del mock del modulo
const mockSetCurrentText = vi.fn()
const mockLoadDocument = vi.fn()

vi.mock('@/store/useEditorStore', () => ({
  useEditorStore: Object.assign(
    () => ({ currentText: '' }),
    {
      getState: vi.fn(() => ({
        currentText: 'testo editor',
        setCurrentText: mockSetCurrentText,
        loadDocument: mockLoadDocument,
      })),
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
  ),
}))

afterEach(() => {
  // Alcuni test tolgono `crypto.randomUUID` per esercitare il contesto non
  // sicuro, altri fanno fallire `localStorage`: senza questo, stub e spy
  // resterebbero attivi per i test successivi.
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Simula un `localStorage` pieno: e' il modo realistico in cui `set` fallisce. */
function persistenzaRotta() {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota superata', 'QuotaExceededError')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reimposta i mock per ogni test
  mockSetCurrentText.mockClear()
  mockLoadDocument.mockClear()
  ;(useEditorStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
    currentText: 'testo editor',
    setCurrentText: mockSetCurrentText,
    loadDocument: mockLoadDocument,
  })
  useNotesStore.setState({ list: [], currentId: null })
})

describe('useNotesStore — createEmpty', () => {
  it('crea una nota vuota e la imposta come corrente', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty() })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.currentId).toBe(result.current.list[0].id)
    expect(result.current.list[0].title).toBe('Senza titolo')
    expect(result.current.list[0].content).toBe('')
  })

  it('salva il contenuto editor sulla nota corrente prima di creare', () => {
    const existingNote = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [existingNote], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty() })

    const saved = result.current.list.find((n) => n.id === 'a')
    expect(saved?.content).toBe('testo editor')
  })

  it('crea la nota anche fuori da secure context, dove randomUUID non esiste', () => {
    // R-82-F-Ob su HTTP non-localhost: `crypto.randomUUID` e' definita **solo
    // in secure context**, e `createEmpty` la chiamava diretta. Li' non
    // mancava la gestione dell'errore: la creazione si rompeva del tutto.
    const cryptoReale = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array<ArrayBuffer>) => cryptoReale.getRandomValues(arr),
    })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty() })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.list[0].id).toBeTruthy()
    expect(result.current.currentId).toBe(result.current.list[0].id)
  })

  /*
   * UC75 post-condizione: «Il sistema ripristina lo stato precedente per
   * evitare perdite di dati». Senza il ripristino l'utente vedrebbe insieme il
   * messaggio d'errore e la nota comparire nell'elenco — misurato: il
   * QuotaExceededError propaga da `set` **dopo** che lo stato in memoria e'
   * gia' cambiato.
   */
  /*
   * Nota sulle asserzioni: si legge `useNotesStore.getState()` e non
   * `result.current`. Quando l'eccezione interrompe l'`act` il componente non
   * si ri-renderizza, quindi `result.current` resta lo snapshot precedente e
   * l'asserzione passerebbe **anche senza ripristino**. Verificato per
   * mutazione: con `result.current` la rimozione del ripristino non veniva
   * intercettata da nessun test.
   */
  it('persistenza fallita senza nota corrente → nessuna nota resta nell elenco', () => {
    persistenzaRotta()

    expect(() => useNotesStore.getState().createEmpty()).toThrow()

    expect(useNotesStore.getState().list).toHaveLength(0)
    expect(useNotesStore.getState().currentId).toBeNull()
  })

  it('persistenza fallita con nota corrente → la nota precedente resta intatta', () => {
    const precedente = { id: 'a', title: 'A', content: 'contenuto', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [precedente], currentId: 'a' })
    persistenzaRotta()

    expect(() => useNotesStore.getState().createEmpty()).toThrow()

    expect(useNotesStore.getState().list).toEqual([precedente])
    expect(useNotesStore.getState().currentId).toBe('a')
  })

  it('imposta il testo editor a stringa vuota dopo la creazione (usando loadDocument)', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty() })
    // Ora il codice chiama loadDocument('') invece di setCurrentText('')
    expect(mockLoadDocument).toHaveBeenCalledWith('')
    // Verifica che loadDocument sia stato chiamato una volta
    expect(mockLoadDocument).toHaveBeenCalledTimes(1)
    // setCurrentText non deve essere chiamato
    expect(mockSetCurrentText).not.toHaveBeenCalled()
  })
})

describe('useNotesStore — select', () => {
  it('imposta currentId e sincronizza il testo editor (usando loadDocument)', () => {
    const noteA = { id: 'a', title: 'A', content: 'contenuto A', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: 'contenuto B', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.select('b') })

    expect(result.current.currentId).toBe('b')
    // Ora select chiama loadDocument(note.content)
    expect(mockLoadDocument).toHaveBeenCalledWith('contenuto B')
    expect(mockSetCurrentText).not.toHaveBeenCalled()
  })

  it('salva il contenuto editor sulla nota precedente prima di cambiare (usa updateCurrent)', () => {
    const noteA = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.select('b') })

    const saved = result.current.list.find((n) => n.id === 'a')
    expect(saved?.content).toBe('testo editor')
  })
})

describe('useNotesStore — updateCurrent', () => {
  it('aggiorna title della nota corrente', () => {
    const note = { id: 'a', title: 'Vecchio', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [note], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.updateCurrent({ title: 'Nuovo' }) })

    expect(result.current.list[0].title).toBe('Nuovo')
  })

  it('no-op se currentId è null', () => {
    const note = { id: 'a', title: 'Titolo', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [note], currentId: null })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.updateCurrent({ title: 'Cambiato' }) })

    expect(result.current.list[0].title).toBe('Titolo')
  })
})

describe('useNotesStore — deleteNote', () => {
  it('rimuove la nota dalla lista', () => {
    const noteA = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.deleteNote('a') })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.list[0].id).toBe('b')
  })

  it('se cancella la nota corrente, imposta la prima rimasta come corrente', () => {
    const noteA = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.deleteNote('a') })

    expect(result.current.currentId).toBe('b')
  })

  it('se cancella l ultima nota, currentId diventa null', () => {
    const note = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [note], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.deleteNote('a') })

    expect(result.current.currentId).toBeNull()
    expect(result.current.list).toHaveLength(0)
  })
})

describe('useNotesStore — loadNote', () => {
  it('aggiunge la nota se non esiste e la imposta come corrente (usando loadDocument)', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => {
      result.current.loadNote({ id: 'x', title: 'X', content: 'ciao' })
    })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.currentId).toBe('x')
    // Ora loadNote chiama loadDocument(note.content)
    expect(mockLoadDocument).toHaveBeenCalledWith('ciao')
    expect(mockSetCurrentText).not.toHaveBeenCalled()
  })

  it('aggiorna la nota se esiste già', () => {
    const note = { id: 'x', title: 'Vecchio', content: 'vecchio', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [note], currentId: 'x' })

    const { result } = renderHook(() => useNotesStore())
    act(() => {
      result.current.loadNote({ id: 'x', title: 'Nuovo', content: 'nuovo' })
    })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.list[0].title).toBe('Nuovo')
    // Anche in questo caso loadDocument viene chiamato con 'nuovo'
    expect(mockLoadDocument).toHaveBeenCalledWith('nuovo')
  })
})

describe('selettori', () => {
  it('useNotesList ritorna la lista corrente', () => {
    const note = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [note], currentId: 'a' })

    const { result } = renderHook(() => useNotesList())
    expect(result.current).toHaveLength(1)
  })

  it('useCurrentNote ritorna null se currentId è null', () => {
    useNotesStore.setState({ list: [], currentId: null })

    const { result } = renderHook(() => useCurrentNote())
    expect(result.current).toBeNull()
  })
})