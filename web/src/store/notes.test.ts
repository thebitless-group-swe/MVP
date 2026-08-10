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

/*
 * R-114-F-Ob (UC74.3) — il titolo lo fornisce l'utente.
 *
 * L'asserzione `expect(title).toBe('Senza titolo')` che stava qui non
 * verificava un comportamento: ratificava il difetto, cioe' il titolo
 * assegnato d'ufficio. Per questo e' stata riscritta e non adattata. Il
 * valore di ripiego sopravvive in un test solo, quello che ne descrive
 * l'unica occasione legittima: la stringa vuota.
 */
describe('useNotesStore — createEmpty', () => {
  it('crea la nota con il titolo indicato dall utente', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty('Appunti di algebra') })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.currentId).toBe(result.current.list[0].id)
    expect(result.current.list[0].title).toBe('Appunti di algebra')
    expect(result.current.list[0].content).toBe('')
  })

  it('un titolo vuoto ricade su "Senza titolo"', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty('') })

    expect(result.current.list[0].title).toBe('Senza titolo')
  })

  it('un titolo di soli spazi ricade su "Senza titolo"', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty('   ') })

    expect(result.current.list[0].title).toBe('Senza titolo')
  })

  it('scarta gli spazi ai bordi del titolo', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty('  Bozza capitolo 3  ') })

    expect(result.current.list[0].title).toBe('Bozza capitolo 3')
  })

  it('salva il contenuto editor sulla nota corrente prima di creare', () => {
    const existingNote = { id: 'a', title: 'A', content: '', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [existingNote], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty('Nuova') })

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
    act(() => { result.current.createEmpty('Nuova') })
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

  /*
   * I tre test qui sopra guardano lista e `currentId`, mai l'editor — ed e' il
   * motivo per cui il difetto seguente e' sopravvissuto finche' nessun punto
   * della UI raggiungeva `deleteNote`.
   *
   * Misurato prima della correzione: eliminando la nota corrente, il suo testo
   * restava nell'editor mentre `currentId` passava a un'altra nota. Al primo
   * cambio nota quel testo veniva salvato **sopra** la nota di destinazione:
   * eliminando A (contenuto 'AAA') e poi selezionando B, il contenuto di B
   * diventava 'AAA'. Perdita di dati silenziosa.
   */
  it('eliminando la nota corrente, l editor carica quella che subentra', () => {
    const noteA = { id: 'a', title: 'A', content: 'AAA', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: 'BBB', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.deleteNote('a') })

    expect(mockLoadDocument).toHaveBeenCalledWith('BBB')
  })

  it('eliminando l ultima nota, l editor si svuota', () => {
    const note = { id: 'a', title: 'A', content: 'AAA', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [note], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.deleteNote('a') })

    expect(mockLoadDocument).toHaveBeenCalledWith('')
  })

  it('eliminando una nota NON corrente, l editor non viene toccato', () => {
    // Il documento aperto non c'entra nulla con la nota rimossa: ricaricarlo
    // sarebbe un salto visibile e ingiustificato.
    const noteA = { id: 'a', title: 'A', content: 'AAA', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: 'BBB', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.deleteNote('b') })

    expect(result.current.currentId).toBe('a')
    expect(mockLoadDocument).not.toHaveBeenCalled()
  })

  /*
   * UC81, post-condizioni: «L'integrita' del dato viene preservata. La nota
   * non viene eliminata. L'utente riceve un feedback sull'errore». Le prime
   * due si verificano qui, la terza in `Sidebar.test.tsx`.
   *
   * Le asserzioni leggono `useNotesStore.getState()` e non `result.current`:
   * quando l'eccezione interrompe l'`act` il componente non si ri-renderizza,
   * quindi `result.current` resterebbe lo snapshot precedente e il test
   * passerebbe anche senza ripristino.
   */
  it('persistenza fallita → la nota NON viene eliminata e l errore propaga', () => {
    const noteA = { id: 'a', title: 'A', content: 'AAA', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: 'BBB', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })
    persistenzaRotta()

    expect(() => useNotesStore.getState().deleteNote('a')).toThrow()

    expect(useNotesStore.getState().list).toEqual([noteA, noteB])
    expect(useNotesStore.getState().currentId).toBe('a')
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