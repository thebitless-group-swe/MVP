// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { Sidebar } from '@/components/Sidebar'
import { useNotesStore } from '@/store/notes'
import { useEditorStore } from '@/store/useEditorStore'

vi.mock('@/lib/fileSystem', () => ({
  openNoteFromFile: vi.fn(),
  saveNoteToFile: vi.fn(),
  renameNote: vi.fn(),
}))

import { openNoteFromFile, saveNoteToFile } from '@/lib/fileSystem'

const mockOpen = vi.mocked(openNoteFromFile)
const mockSave = vi.mocked(saveNoteToFile)

// Da rimettere a posto dopo i test che la sostituiscono con una che fallisce
const createEmptyOriginale = useNotesStore.getState().createEmpty

beforeEach(() => {
  vi.clearAllMocks()
    useNotesStore.setState({
    list: [{ id: '1', title: 'Nota', content: 'testo', createdAt: 0, updatedAt: 0 }],
    currentId: '1',
    createEmpty: createEmptyOriginale,
  })
  useEditorStore.setState({ currentText: 'testo', errorMessage: null })
})

afterEach(() => {
  // clearAllMocks non toglie lo spy che fa fallire localStorage, e senza questo
  // il setState del beforeEach successivo salterebbe trascinandosi altri test.
  vi.restoreAllMocks()
})

// R-91-F-De (UC80.1) e R-93-F-De (UC81). La conferma sta al passo 3, PRIMA
// dell'azione, quindi annullare non deve eliminare e poi ripristinare.
describe('Sidebar — eliminazione nota', () => {
  const ALTRA = { id: '2', title: 'Altra nota', content: 'altro', createdAt: 0, updatedAt: 0 }

    async function chiediEliminazione(titolo: string) {
    render(<Sidebar />)
    await userEvent.click(screen.getByLabelText(`Elimina «${titolo}»`))
  }

  it('il cestino chiede conferma invece di eliminare subito', async () => {
    await chiediEliminazione('Nota')

    expect(screen.getByText('Eliminare «Nota»?')).toBeInTheDocument()
      expect(useNotesStore.getState().list).toHaveLength(1)
  })

  it('conferma → la nota viene rimossa', async () => {
    useNotesStore.setState({
      list: [useNotesStore.getState().list[0], ALTRA],
      currentId: '1',
    })

    await chiediEliminazione('Nota')
    await userEvent.click(screen.getByText('Sì, elimina'))

    const { list, currentId } = useNotesStore.getState()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('2')
    expect(currentId).toBe('2')
  })

  it('annullamento → lista invariata', async () => {
    await chiediEliminazione('Nota')
    await userEvent.click(screen.getByText('Annulla'))

    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(screen.queryByText('Eliminare «Nota»?')).toBeNull()
    expect(screen.getByLabelText('Elimina «Nota»')).toBeInTheDocument()
  })

  it('Esc → lista invariata', async () => {
    await chiediEliminazione('Nota')
    await userEvent.keyboard('{Escape}')

    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(screen.queryByText('Eliminare «Nota»?')).toBeNull()
  })

  it('la conferma si apre su una riga sola', async () => {
    useNotesStore.setState({
      list: [useNotesStore.getState().list[0], ALTRA],
      currentId: '1',
    })

    await chiediEliminazione('Nota')

    expect(screen.getByText('Eliminare «Nota»?')).toBeInTheDocument()
    expect(screen.queryByText('Eliminare «Altra nota»?')).toBeNull()
    expect(screen.getByLabelText('Elimina «Altra nota»')).toBeInTheDocument()
  })

  it('guasto reale → messaggio a video e nota NON eliminata (UC81)', async () => {
    // Catena intera con un'avaria vera, le tre post-condizioni di UC81 insieme.
    await chiediEliminazione('Nota')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota superata', 'QuotaExceededError')
    })

    await userEvent.click(screen.getByText('Sì, elimina'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile eliminare la nota')
    })
    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(useNotesStore.getState().currentId).toBe('1')
  })
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
    expect(useNotesStore.getState().currentId).toBe('1')
  })
})

// R-114-F-Ob (UC74.3). I tre percorsi stanno qui e non in notes.test.ts perche'
// due su tre sono interazione, non stato.
describe('Sidebar — creazione nota con titolo', () => {
    async function chiediTitolo(): Promise<HTMLElement> {
    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))
    return screen.getByLabelText('Titolo della nuova nota')
  }

  it('il pulsante chiede il titolo invece di creare subito la nota', async () => {
    const campo = await chiediTitolo()

    expect(campo).toBeInTheDocument()
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
    expect(screen.getByText('Nuova nota')).toBeInTheDocument()
  })

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

// R-84-F-Ob (UC75), il percorso d'errore della creazione.
describe('Sidebar — creazione nota', () => {
  function createEmptyChefallisce() {
    useNotesStore.setState({
      createEmpty: () => {
        throw new Error('memoria esaurita')
      },
    })
  }

  /**
   * Percorre i due tempi di UC74.3 fino in fondo: apre il campo, scrive il
   * titolo, conferma. Da quando la creazione chiede il titolo (R-114-F-Ob), il
   * solo click su «Nuova nota» non crea piu' nulla, e questi test del percorso
   * d'errore devono arrivare fino alla conferma per provocarlo.
   */
  async function creaNota(titolo = 'Bozza') {
    render(<Sidebar />)
    await userEvent.click(screen.getByText('Nuova nota'))
    await userEvent.type(
      screen.getByLabelText('Titolo della nuova nota'),
      `${titolo}{Enter}`,
    )
  }

  it('errore in creazione → messaggio mostrato, stato precedente preservato', async () => {
    createEmptyChefallisce()

    await creaNota('Bozza')

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile creare la nota')
    })
    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(useNotesStore.getState().currentId).toBe('1')
    expect(useEditorStore.getState().currentText).toBe('testo')
    // «Stato precedente» comprende anche il titolo appena digitato.
    expect(screen.getByLabelText('Titolo della nuova nota')).toHaveValue('Bozza')
  })

  it('il messaggio non espone dettagli tecnici', async () => {
    // «memoria esaurita» e' il messaggio dell'eccezione e non deve uscire (R-110-F-Ob)
    createEmptyChefallisce()

    await creaNota()

    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Impossibile creare la nota. Riprova.')
    expect(avviso.textContent).not.toContain('memoria esaurita')
  })

  it('guasto reale (localStorage pieno) → messaggio a video e nessuna nota in piu', async () => {
    // Si parte da elenco vuoto apposta. Con una nota corrente il guasto
    // colpirebbe il primo set e la nota non nascerebbe comunque, quindi
    // l'asserzione passerebbe anche senza ripristino.
    useNotesStore.setState({ list: [], currentId: null })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota superata', 'QuotaExceededError')
    })

    await creaNota()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Impossibile creare la nota')
    })
    expect(useNotesStore.getState().list).toHaveLength(0)
    expect(useNotesStore.getState().currentId).toBeNull()
  })

  it('creazione riuscita → nessun messaggio di errore', async () => {
    await creaNota()

    expect(useNotesStore.getState().list).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByLabelText('Titolo della nuova nota')).toBeNull()
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
    expect(useEditorStore.getState().currentText).toBe('testo')
  })
})