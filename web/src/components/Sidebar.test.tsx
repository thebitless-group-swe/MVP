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

/*
 * R-114-F-Ob / UC74.3 — «Il sistema richiede all'utente un titolo per la nuova
 * nota; l'utente inserisce il titolo e conferma».
 *
 * I tre percorsi sono qui e non in `notes.test.ts` perche' due dei tre sono
 * interazione, non stato: l'annullamento in particolare non e' esprimibile
 * nello store, dato che «annullato» significa proprio che `createEmpty` non e'
 * mai stata chiamata.
 */
describe('Sidebar — creazione nota con titolo', () => {
  /** Apre la richiesta del titolo e restituisce il campo. */
  async function chiediTitolo(): Promise<HTMLElement> {
    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))
    return screen.getByLabelText('Titolo della nuova nota')
  }

  it('il pulsante chiede il titolo invece di creare subito la nota', async () => {
    const campo = await chiediTitolo()

    expect(campo).toBeInTheDocument()
    // Nessuna nota e' nata al solo click: la creazione attende la conferma.
    expect(useNotesStore.getState().list).toHaveLength(1)
  })

  it('conferma con Invio → nota creata con quel titolo e resa corrente', async () => {
    const campo = await chiediTitolo()
    await userEvent.type(campo, 'Appunti di algebra{Enter}')

    const { list, currentId } = useNotesStore.getState()
    expect(list).toHaveLength(2)
    expect(list[1].title).toBe('Appunti di algebra')
    // UC74.1 passo 3: il sistema «vi sposta il focus», cioe' la nota nuova
    // diventa quella corrente.
    expect(currentId).toBe(list[1].id)
    expect(screen.getByText('Appunti di algebra')).toBeInTheDocument()
  })

  it('conferma con titolo vuoto → ricade su «Senza titolo»', async () => {
    const campo = await chiediTitolo()
    await userEvent.type(campo, '{Enter}')

    const { list } = useNotesStore.getState()
    expect(list).toHaveLength(2)
    expect(list[1].title).toBe('Senza titolo')
  })

  it('annullamento con Esc → nessuna nota creata', async () => {
    const campo = await chiediTitolo()
    await userEvent.type(campo, 'Ripensamento{Escape}')

    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(screen.queryByLabelText('Titolo della nuova nota')).toBeNull()
    // Il pulsante torna disponibile: l'annullamento non lascia la UI a meta'.
    expect(screen.getByText('Nuova nota')).toBeInTheDocument()
  })

  /*
   * UC74.3 prevede due uscite, conferma e annullamento, e uscire dal campo non
   * e' nessuna delle due: il titolo scritto non va perso e la nota non va
   * creata. Il campo resta aperto in attesa che l'utente decida.
   */
  it('uscire dal campo non crea la nota e non scarta il titolo scritto', async () => {
    const campo = await chiediTitolo()
    await userEvent.type(campo, 'Ancora indeciso')
    await userEvent.click(screen.getByText('Apri file…'))

    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(screen.getByLabelText('Titolo della nuova nota')).toHaveValue(
      'Ancora indeciso',
    )
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