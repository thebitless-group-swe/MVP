// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNotesStore, useNotesList, useCurrentNote } from '@/store/notes'
import { useEditorStore } from '@/store/useEditorStore'

vi.mock('@/store/useEditorStore', () => ({
  useEditorStore: Object.assign(
    () => ({ currentText: '' }),
    {
      getState: vi.fn(() => ({
        currentText: 'testo editor',
        setCurrentText: vi.fn(),
      })),
    }
  ),
}))

const mockSetCurrentText = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(useEditorStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
    currentText: 'testo editor',
    setCurrentText: mockSetCurrentText,
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

  it('imposta il testo editor a stringa vuota dopo la creazione', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.createEmpty() })
    expect(mockSetCurrentText).toHaveBeenCalledWith('')
  })
})

describe('useNotesStore — select', () => {
  it('imposta currentId e sincronizza il testo editor', () => {
    const noteA = { id: 'a', title: 'A', content: 'contenuto A', createdAt: 0, updatedAt: 0 }
    const noteB = { id: 'b', title: 'B', content: 'contenuto B', createdAt: 0, updatedAt: 0 }
    useNotesStore.setState({ list: [noteA, noteB], currentId: 'a' })

    const { result } = renderHook(() => useNotesStore())
    act(() => { result.current.select('b') })

    expect(result.current.currentId).toBe('b')
    expect(mockSetCurrentText).toHaveBeenCalledWith('contenuto B')
  })

  it('salva il contenuto editor sulla nota precedente prima di cambiare', () => {
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
  it('aggiunge la nota se non esiste e la imposta come corrente', () => {
    const { result } = renderHook(() => useNotesStore())
    act(() => {
      result.current.loadNote({ id: 'x', title: 'X', content: 'ciao' })
    })

    expect(result.current.list).toHaveLength(1)
    expect(result.current.currentId).toBe('x')
    expect(mockSetCurrentText).toHaveBeenCalledWith('ciao')
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