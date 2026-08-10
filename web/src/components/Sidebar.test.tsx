// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
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

// L'azione originale, per rimetterla a posto dopo i test che la sostituiscono
// con una che fallisce: senza, resterebbe rotta per tutti i test successivi.
const createEmptyOriginale = useNotesStore.getState().createEmpty

beforeEach(() => {
  vi.clearAllMocks()
  // Nota corrente nello store per abilitare il bottone Salva
  useNotesStore.setState({
    list: [{ id: '1', title: 'Nota', content: 'testo', createdAt: 0, updatedAt: 0 }],
    currentId: '1',
    createEmpty: createEmptyOriginale,
  })
  useEditorStore.setState({ currentText: 'testo', errorMessage: null })
})

afterEach(() => {
  // Un test fa fallire `localStorage` con uno spy: `clearAllMocks` non lo
  // rimuove, e senza questo il `setState` del beforeEach successivo
  // solleverebbe a sua volta, facendo cadere test che non c'entrano nulla.
  vi.restoreAllMocks()
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
 * R-84-F-Ob / UC75 — «Il Sistema deve gestire eventuali errori durante la
 * creazione di una nota, informando l'Utente e preservando lo stato
 * precedente». Era l'unica delle tre operazioni della sidebar senza percorso
 * d'errore: apri e salva ce l'hanno gia' (i due describe qui sopra e sotto).
 *
 * Il fallimento si provoca sostituendo l'azione dello store con una che
 * solleva. Questo prova **il percorso d'errore del componente**, non che una
 * particolare avaria di runtime arrivi fin qui: quali eccezioni propaghino
 * attraverso il middleware `persist` di zustand e' un'altra domanda, e non e'
 * questa la sede in cui rispondervi.
 */
describe('Sidebar — creazione nota', () => {
  function createEmptyChefallisce() {
    useNotesStore.setState({
      createEmpty: () => {
        throw new Error('memoria esaurita')
      },
    })
  }

  it('errore in creazione → messaggio mostrato, stato precedente preservato', async () => {
    createEmptyChefallisce()

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile creare la nota')
    })
    // Post-condizione di UC75: nessuna perdita di dati.
    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(useNotesStore.getState().currentId).toBe('1')
    expect(useEditorStore.getState().currentText).toBe('testo')
  })

  it('il messaggio non espone dettagli tecnici', async () => {
    // R-110-F-Ob: causa e azione correttiva, senza stack trace ne' dettagli
    // interni. «memoria esaurita» e' il messaggio dell'eccezione, e non deve
    // arrivare all'utente.
    createEmptyChefallisce()

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))

    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Impossibile creare la nota. Riprova.')
    expect(avviso.textContent).not.toContain('memoria esaurita')
  })

  it('guasto reale (localStorage pieno) → messaggio a video e nessuna nota in piu', async () => {
    // Gli altri due test sostituiscono l'azione dello store, quindi provano il
    // componente in isolamento. Questo invece percorre la catena intera con
    // un'avaria vera: QuotaExceededError → `set` → `createEmpty` rilancia dopo
    // aver ripristinato → `handleCreate` intercetta → avviso. E' la prova che
    // R-84-F-Ob e' coperto sul percorso che l'utente incontrerebbe davvero.
    //
    // Si parte da elenco vuoto di proposito: con una nota corrente il guasto
    // colpirebbe il primo `set` (quello che salva il contenuto in corso) e la
    // nota nuova non nascerebbe comunque, quindi l'asserzione passerebbe anche
    // senza ripristino. Senza nota corrente il guasto colpisce proprio il `set`
    // che aggiunge, che e' il caso in cui il ripristino serve davvero.
    useNotesStore.setState({ list: [], currentId: null })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota superata', 'QuotaExceededError')
    })

    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile creare la nota')
    })
    expect(useNotesStore.getState().list).toHaveLength(0)
    expect(useNotesStore.getState().currentId).toBeNull()
  })

  it('creazione riuscita → nessun messaggio di errore', async () => {
    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))

    expect(useNotesStore.getState().list).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
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