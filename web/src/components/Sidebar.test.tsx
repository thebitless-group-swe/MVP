// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '@/components/Sidebar'
import { useNotesStore } from '@/store/notes'
import { useEditorStore } from '@/store/useEditorStore'

// Mocka il modulo fileSystem: controlliamo noi cosa lanciano le funzioni
vi.mock('@/lib/fileSystem', () => ({
  openNoteFromFile: vi.fn(),
  saveNoteToFile: vi.fn(),
  renameNote: vi.fn(),
}))

import { openNoteFromFile, saveNoteToFile } from '@/lib/fileSystem'

const mockOpen = vi.mocked(openNoteFromFile)
const mockSave = vi.mocked(saveNoteToFile)

beforeEach(() => {
  vi.clearAllMocks()
  // Nota corrente nello store per abilitare il bottone Salva
  useNotesStore.setState({
    list: [{ id: '1', title: 'Nota', content: 'testo', createdAt: 0, updatedAt: 0 }],
    currentId: '1',
  })
  useEditorStore.setState({ currentText: 'testo', errorMessage: null })
})

describe('Sidebar — handleOpenFile', () => {
  it('AbortError → nessun messaggio di errore', async () => {
    mockOpen.mockRejectedValue(new DOMException('cancelled', 'AbortError'))

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Apri file…'))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('errore generico → mostra messaggio, stato invariato', async () => {
    mockOpen.mockRejectedValue(new Error('disco pieno'))

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Apri file…'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile aprire il file')
    })
    // Lo store non è stato modificato
    expect(useNotesStore.getState().currentId).toBe('1')
  })
})

describe('Sidebar — handleSaveFile', () => {
  it('AbortError → nessun messaggio di errore', async () => {
    mockSave.mockRejectedValue(new DOMException('cancelled', 'AbortError'))

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Salva file'))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('errore generico → mostra messaggio, currentText invariato', async () => {
    mockSave.mockRejectedValue(new Error('permesso negato'))

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Salva file'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile salvare il file')
    })
    // Il contenuto dell'editor non è stato toccato
    expect(useEditorStore.getState().currentText).toBe('testo')
  })
})