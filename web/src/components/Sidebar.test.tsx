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

/*
 * R-91-F-De (UC80.1) e R-93-F-De (UC81) — eliminazione di una nota.
 *
 * La logica di `deleteNote` era gia' implementata e testata, ma
 * `grep -rn "deleteNote" web/src --include="*.tsx"` non trovava nulla: nessun
 * punto della UI la raggiungeva, quindi il requisito era «irraggiungibile
 * dall'interfaccia», che per l'AdR equivale a non soddisfatto.
 *
 * UC80.1 colloca la conferma al passo 3, **prima** dell'azione: da cui i due
 * tempi, e da cui il fatto che annullare non debba eliminare nulla — non
 * ripristinare qualcosa di gia' eliminato.
 */
describe('Sidebar — eliminazione nota', () => {
  const ALTRA = { id: '2', title: 'Altra nota', content: 'altro', createdAt: 0, updatedAt: 0 }

  /** Apre la conferma sulla nota indicata e restituisce l'utente virtuale. */
  async function chiediEliminazione(titolo: string) {
    render(<Sidebar />)
    await userEvent.click(screen.getByLabelText(`Elimina «${titolo}»`))
  }

  it('il cestino chiede conferma invece di eliminare subito', async () => {
    await chiediEliminazione('Nota')

    expect(screen.getByText('Eliminare «Nota»?')).toBeInTheDocument()
    // UC80.1: al passo 3 la nota c'e' ancora.
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
    // La riga torna disponibile: l'annullamento non lascia la UI a meta'.
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
    // Catena intera con un'avaria vera: QuotaExceededError -> `set` ->
    // `deleteNote` ripristina e rilancia -> `confirmDelete` intercetta ->
    // avviso. Le tre post-condizioni di UC81 in un test solo.
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
    // Post-condizione di UC75: nessuna perdita di dati.
    expect(useNotesStore.getState().list).toHaveLength(1)
    expect(useNotesStore.getState().currentId).toBe('1')
    expect(useEditorStore.getState().currentText).toBe('testo')
    // Con la creazione in due tempi «stato precedente» comprende anche il
    // titolo appena digitato: il campo resta aperto e lo conserva, altrimenti
    // si chiederebbe all'utente di riprovare dopo avergli buttato via quello
    // che aveva scritto.
    expect(screen.getByLabelText('Titolo della nuova nota')).toHaveValue('Bozza')
  })

  it('il messaggio non espone dettagli tecnici', async () => {
    // R-110-F-Ob: causa e azione correttiva, senza stack trace ne' dettagli
    // interni. «memoria esaurita» e' il messaggio dell'eccezione, e non deve
    // arrivare all'utente.
    createEmptyChefallisce()

    await creaNota()

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
    // Contraltare del test qui sopra: a creazione avvenuta il campo si chiude.
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
    // Il contenuto dell'editor non è stato toccato
    expect(useEditorStore.getState().currentText).toBe('testo')
  })
})