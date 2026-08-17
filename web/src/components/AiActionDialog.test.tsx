// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiActionDialog } from '@/components/AiActionDialog'
import { api } from '@/lib/api'
import { useEditorStore } from '@/store/useEditorStore'
import {
  MAX_PROMPT_LENGTH,
  MAX_TEXT_LENGTH,
  NO_ERRORS_MARKER,
} from '@/types/models'
import { AI_ACTIONS } from '@/lib/aiActions'

// Hoisted: i mock devono essere pronti prima che vi.mock li usi
const { mockStart, mockAbort, capturedFn } = vi.hoisted(() => ({
  mockStart: vi.fn().mockImplementation(async (fn) => {
    // Salva la funzione per poterla ispezionare dopo
    capturedFn.value = fn
  }),
  //Doppio fedele di `abort()`: annulla il controller in corso, lo sgancia e
  //spegne l'indicatore di attesa — cio' che il vero hook fa, osservato da
  //fuori. Un doppio inerte faceva passare il test dell'Interrompi solo perche'
  //il componente chiamava `finishStreaming()` una seconda volta: il doppio
  //mentiva, e il codice di produzione pagava il conto con una riga ridondante.
  mockAbort: vi.fn(() => {
    const stato = useEditorStore.getState()
    stato._abortController?.abort()
    stato._setAbortController(null)
    stato.finishStreaming()
  }),
  capturedFn: {
    value: null as ((signal: AbortSignal) => AsyncIterable<string>) | null,
  },
}))

// Mock di useAiStream con la nuova firma
vi.mock('@/hooks/useAiStream', () => ({
  useAiStream: () => ({ start: mockStart, abort: mockAbort, status: 'idle' }),
}))

// Mock di useTypewriter
vi.mock('@/hooks/useTypewriter', () => ({
  useTypewriter: (text: string) => text,
}))

// Mock di aiActions: getActiveText restituisce un testo lungo
vi.mock('@/lib/aiActions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiActions')>()
  return { ...actual, getActiveText: vi.fn(() => ACTIVE_TEXT) }
})

import { getActiveText } from '@/lib/aiActions'

// Mock della Facade api
vi.mock('@/lib/api', () => ({
  api: {
    summarize: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
    translate: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
    rewrite: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
    grammar: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
    critique: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
    generate: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
    generateFromLink: vi.fn().mockImplementation(() => (async function* () { yield 'chunk' })()),
  }
}))

const ACTIVE_TEXT = 'testo di esempio abbastanza lungo per il test'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActiveText).mockReturnValue(ACTIVE_TEXT)
  // Reset captured function
  capturedFn.value = null
  useEditorStore.setState({
    currentText: 'testo originale',
    selectedText: '',
    streamedOutput: '',
    isGenerating: false,
    errorMessage: null,
    aiModal: null,
    _abortController: null,
    lastCall: null,
  })
})

describe('AiActionDialog — parametri di default', () => {
  it('summarize: apre con lunghezza Medio selezionata', () => {
    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    expect(screen.getByRole('radio', { name: 'Medio' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('mostra il label dell azione nell header', () => {
    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    expect(screen.getByText('Riassumi')).toBeInTheDocument()
  })
})

describe('AiActionDialog — body corretto', () => {
  it('summarize: invia text e length tramite Facade', async () => {
    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    // Verifica che start sia chiamato con una funzione
    expect(mockStart).toHaveBeenCalledTimes(1)
    const fn = mockStart.mock.calls[0][0]
    expect(fn).toBeInstanceOf(Function)

    // Esegui la funzione per verificare che chiami la Facade corretta
    await fn(new AbortController().signal)
    expect(api.summarize).toHaveBeenCalledWith(ACTIVE_TEXT, 'medio', expect.any(AbortSignal))
  })

  it('generate: invia prompt e length tramite Facade', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)

    await userEvent.type(
      screen.getByRole('textbox'),
      'Scrivi un articolo sulla Luna',
    )
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).toHaveBeenCalledTimes(1)
    const fn = mockStart.mock.calls[0][0]
    await fn(new AbortController().signal)
    expect(api.generate).toHaveBeenCalledWith('Scrivi un articolo sulla Luna', 'medio', expect.any(AbortSignal))
  })
})

describe('AiActionDialog — Interrompi', () => {
  it('chiama abort e imposta isGenerating a false', async () => {
    act(() => {
      useEditorStore.setState({ aiModal: 'summarize', isGenerating: true })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /interrompi/i }))

    expect(mockAbort).toHaveBeenCalledTimes(1)
    expect(useEditorStore.getState().isGenerating).toBe(false)
  })
})

describe('AiActionDialog — Accetta', () => {
  it('summarize (replace): currentText diventa lo streamedOutput', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'summarize',
        streamedOutput: 'testo riassunto',
        isGenerating: false,
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: 'Accetta' }))

    expect(useEditorStore.getState().currentText).toBe('testo riassunto')
    expect(useEditorStore.getState().aiModal).toBeNull()
  })

  it('generate (append): accoda lo streamedOutput a currentText', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'generate',
        streamedOutput: 'contenuto generato',
        isGenerating: false,
        currentText: 'testo originale',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: 'Accetta' }))

    expect(useEditorStore.getState().currentText).toBe(
      'testo originale\n\ncontenuto generato',
    )
  })
})

describe('AiActionDialog — Rifiuta', () => {
  it('lascia currentText invariato e chiude la modale', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'summarize',
        streamedOutput: 'output ignorato',
        currentText: 'testo originale',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: 'Rifiuta' }))

    expect(useEditorStore.getState().currentText).toBe('testo originale')
    expect(useEditorStore.getState().aiModal).toBeNull()
  })

  it('chiama abort', async () => {
    act(() => { useEditorStore.setState({ aiModal: 'summarize' }) })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: 'Rifiuta' }))

    expect(mockAbort).toHaveBeenCalledTimes(1)
  })
})

describe('AiActionDialog — testo insufficiente (R-81)', () => {
  it('generate: il prompt oltre il massimo non parte', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x'.repeat(MAX_PROMPT_LENGTH + 1) },
    })
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        `massimo di ${MAX_PROMPT_LENGTH} caratteri`
      )
    })
  })

  it('summarize: nessuna fetch con testo dell editor troppo corto', async () => {
    vi.mocked(getActiveText).mockReturnValue('corto')

    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

  it('summarize: nessuna fetch, e l alert dice quanto e il massimo', async () => {
    vi.mocked(getActiveText).mockReturnValue('x'.repeat(MAX_TEXT_LENGTH + 1))

    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        `massimo di ${MAX_TEXT_LENGTH} caratteri`
      )
      })
    })

  it('summarize: il testo esattamente al massimo passa', async () => {
    const alLimite = 'x'.repeat(MAX_TEXT_LENGTH)
    vi.mocked(getActiveText).mockReturnValue(alLimite)

    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))
    expect(mockStart).toHaveBeenCalledTimes(1)
    const fn = mockStart.mock.calls[0][0]
    await fn(new AbortController().signal)
    expect(api.summarize).toHaveBeenCalledWith(alLimite, 'medio', expect.any(AbortSignal))
  })

  it('generate: il prompt oltre il massimo non parte', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x'.repeat(MAX_PROMPT_LENGTH + 1) },
    })
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(String(MAX_PROMPT_LENGTH))
    })
  })

describe('AiActionDialog — lingue di destinazione (R-58-F-Ob)', () => {
  it('mostra esattamente le quattro lingue dell AdR', () => {
    act(() => { useEditorStore.getState().setAiModal('translate') })
    render(<AiActionDialog />)

    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'Inglese' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Francese' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Tedesco' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Spagnolo' })).toBeInTheDocument()
  })

  it('non offre l italiano come lingua di destinazione', () => {
    act(() => { useEditorStore.getState().setAiModal('translate') })
    render(<AiActionDialog />)

    expect(screen.queryByRole('radio', { name: 'Italiano' })).not.toBeInTheDocument()
  })

  it('selezione lingua → valore di contratto nel body, non codice ISO', async () => {
    act(() => { useEditorStore.getState().setAiModal('translate') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: 'Inglese' }))
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).toHaveBeenCalledTimes(1)
    const fn = mockStart.mock.calls[0][0]
    await fn(new AbortController().signal)
    expect(api.translate).toHaveBeenCalledWith(ACTIVE_TEXT, 'inglese', expect.any(AbortSignal))
  })
})

describe('AiActionDialog — stili di riscrittura (R-60-F-Ob)', () => {
  it('mostra esattamente i tre stili dell AdR', () => {
    act(() => { useEditorStore.getState().setAiModal('rewrite') })
    render(<AiActionDialog />)

    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Formale' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Informale' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Accademico' })).toBeInTheDocument()
  })

  it('selezione stile → valore di contratto nel body', async () => {
    act(() => { useEditorStore.getState().setAiModal('rewrite') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: 'Accademico' }))
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).toHaveBeenCalledTimes(1)
    const fn = mockStart.mock.calls[0][0]
    await fn(new AbortController().signal)
    expect(api.rewrite).toHaveBeenCalledWith(ACTIVE_TEXT, 'accademico', expect.any(AbortSignal))
  })
})

describe('AiActionDialog — sentinella grammar (R-62)', () => {
  it('sentinella → messaggio informativo e Accetta disabilitato', () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'grammar',
        streamedOutput: NO_ERRORS_MARKER,
        isGenerating: false,
      })
    })
    render(<AiActionDialog />)

    expect(screen.getByText('Nessun errore rilevato.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accetta' })).toBeDisabled()
  })

  it('sentinella assente → Accetta abilitato se output presente', () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'grammar',
        streamedOutput: 'Testo con errori corretto.',
        isGenerating: false,
      })
    })
    render(<AiActionDialog />)

    expect(screen.getByRole('button', { name: 'Accetta' })).not.toBeDisabled()
  })
})

describe('AiActionDialog — critique (cappelli)', () => {
  it('i 6 cappelli sono renderizzati', () => {
    act(() => { useEditorStore.getState().setAiModal('critique') })
    render(<AiActionDialog />)

    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(screen.getByRole('radio', { name: /informativo/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /emotivo/i })).toBeInTheDocument()
  })

  it('nessun cappello preselezionato', () => {
    act(() => { useEditorStore.getState().setAiModal('critique') })
    render(<AiActionDialog />)

    const radios = screen.getAllByRole('radio')
    radios.forEach((r) => expect(r).toHaveAttribute('aria-checked', 'false'))
  })

  it.each([
    ['informativo', 'bianco'],
    ['emotivo', 'rosso'],
    ['critico', 'nero'],
    ['ottimista', 'giallo'],
    ['creativo', 'verde'],
    ['organizzativo', 'blu'],
  ])('%s → hat «%s» nel body, non il nome inglese', async (etichetta, valore) => {
    act(() => { useEditorStore.getState().setAiModal('critique') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: new RegExp(etichetta, 'i') }))
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).toHaveBeenCalledTimes(1)
    const fn = mockStart.mock.calls[0][0]
    await fn(new AbortController().signal)
    expect(api.critique).toHaveBeenCalledWith(ACTIVE_TEXT, valore, expect.any(AbortSignal))
  })

  it('senza cappello → nessuna fetch, mostra alert', async () => {
  act(() => { useEditorStore.getState().setAiModal('critique') })
  render(<AiActionDialog />)

  await userEvent.click(screen.getByRole('button', { name: /genera/i }))

  expect(mockStart).not.toHaveBeenCalled()
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Seleziona un cappello')
  })
})

  it('insertMode è append', () => {
    expect(AI_ACTIONS['critique'].insertMode).toBe('append')
  })
})

describe('AiActionDialog — Rigenera persistente (#37)', () => {
  it('lastCall sopravvive alla chiusura e riapertura della modale', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)
    await userEvent.type(screen.getByRole('textbox'), 'Scrivi un testo')
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(useEditorStore.getState().lastCall).toEqual({
    actionId: 'generate',
    input: 'Scrivi un testo',
    params: { length: 'medio' },
    mode: 'prompt',
    execute: expect.any(Function),
  })

    await userEvent.click(screen.getByRole('button', { name: 'Rifiuta' }))
    expect(useEditorStore.getState().aiModal).toBeNull()
    })
  })

describe('AiActionDialog — chiusura durante la generazione (UC71)', () => {
  it('chiudere la modale annulla lo stream invece di lasciarlo orfano', async () => {
    const controller = new AbortController()
    act(() => {
      useEditorStore.setState({
        aiModal: 'summarize',
        isGenerating: true,
        _abortController: controller,
      })
    })
    render(<AiActionDialog />)

    await userEvent.keyboard('{Escape}')

    expect(controller.signal.aborted).toBe(true)
    expect(useEditorStore.getState().isGenerating).toBe(false)
    expect(useEditorStore.getState().aiModal).toBeNull()
  })
})

// L'anteprima appartiene alla richiesta che l'ha prodotta, non alla modale che
// la ospita. Cambiare sorgente o parametro significa formulare una richiesta
// diversa: cio' che si vede a video non e' piu' la risposta a cio' che la
// modale sta chiedendo, e mostrarlo fa credere il contrario.
describe('AiActionDialog — l anteprima non sopravvive al cambio di richiesta', () => {
  it('passando da «Da prompt» a «Da link» l anteprima si svuota', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'generate',
        streamedOutput: 'testo generato dal prompt di prima',
        isGenerating: false,
      })
    })
    render(<AiActionDialog />)

    expect(screen.getByLabelText('Anteprima output')).toHaveTextContent(
      'testo generato dal prompt di prima',
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Da link' }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
    expect(screen.getByLabelText('Anteprima output').textContent).toBe('')
  })

  it('tornando da «Da link» a «Da prompt» l anteprima si svuota', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('tab', { name: 'Da link' }))
    act(() => {
      useEditorStore.setState({ streamedOutput: 'testo generato dal link' })
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Da prompt' }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
  })

  it('cambiando lingua di destinazione l anteprima si svuota', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'translate',
        streamedOutput: 'The winter sea is a concept the mind does not consider.',
        isGenerating: false,
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: 'Spagnolo' }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
    expect(screen.getByLabelText('Anteprima output').textContent).toBe('')
  })

  it('cambiando stile di riscrittura l anteprima si svuota', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'rewrite',
        streamedOutput: 'riscrittura formale di prima',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: 'Accademico' }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
  })

  it('cambiando cappello l anteprima si svuota', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'critique',
        streamedOutput: 'analisi del cappello bianco',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: /critico/i }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
  })

  it('cambiando lunghezza l anteprima si svuota', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'summarize',
        streamedOutput: 'riassunto medio di prima',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: 'Breve' }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
  })

  // Anche l'errore appartiene alla richiesta di prima: lasciarlo sotto una
  // richiesta diversa lo fa leggere come se riguardasse questa.
  it('l errore della richiesta precedente sparisce con essa', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'translate',
        errorMessage: 'Servizio temporaneamente non disponibile',
      })
    })
    render(<AiActionDialog />)

    expect(screen.getByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Tedesco' }))

    expect(useEditorStore.getState().errorMessage).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Il caso che azzerare non basta a coprire: con lo stream ancora aperto
  // `appendChunk` continua a scrivere, e i chunk della lingua abbandonata
  // ricompaiono nell'anteprima appena pulita.
  it('cambiare parametro durante la generazione annulla la richiesta in corso', async () => {
    const controller = new AbortController()
    act(() => {
      useEditorStore.setState({
        aiModal: 'translate',
        isGenerating: true,
        _abortController: controller,
        streamedOutput: 'The winter sea',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('radio', { name: 'Spagnolo' }))

    expect(controller.signal.aborted).toBe(true)
    expect(useEditorStore.getState().isGenerating).toBe(false)
    expect(useEditorStore.getState().streamedOutput).toBe('')
  })
})

// Il rovescio della medaglia dei test qui sopra: azzerare quando la richiesta
// cambia non deve diventare azzerare a ogni clic. Un `PillSelector` emette
// `onChange` anche quando si ri-clicca l'opzione gia' attiva, e senza guardia
// l'utente perderebbe l'output per aver cliccato «Medio» due volte.
describe('AiActionDialog — ri-cliccare la scelta gia attiva non azzera nulla', () => {
  it('ri-cliccare la lingua gia selezionata lascia l anteprima al suo posto', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'translate',
        streamedOutput: 'The winter sea is a concept the mind does not consider.',
      })
    })
    render(<AiActionDialog />)

    // «Inglese» e' il default della modale di traduzione.
    await userEvent.click(screen.getByRole('radio', { name: 'Inglese' }))

    expect(useEditorStore.getState().streamedOutput).toBe(
      'The winter sea is a concept the mind does not consider.',
    )
  })

  it('ri-cliccare la tab gia attiva lascia l anteprima al suo posto', async () => {
    act(() => {
      useEditorStore.setState({
        aiModal: 'generate',
        streamedOutput: 'testo generato dal prompt',
      })
    })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('tab', { name: 'Da prompt' }))

    expect(useEditorStore.getState().streamedOutput).toBe('testo generato dal prompt')
  })
})
