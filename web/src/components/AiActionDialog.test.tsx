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
  mockAbort: vi.fn(),
  capturedFn: { value: null as (() => AsyncIterable<string>) | null },
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
    await fn()
    expect(api.summarize).toHaveBeenCalledWith(ACTIVE_TEXT, 'medio')
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
    await fn()
    expect(api.generate).toHaveBeenCalledWith('Scrivi un articolo sulla Luna', 'medio')
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
    await fn()
    expect(api.summarize).toHaveBeenCalledWith(alLimite, 'medio')
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
    await fn()
    expect(api.translate).toHaveBeenCalledWith(ACTIVE_TEXT, 'inglese')
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
    await fn()
    expect(api.rewrite).toHaveBeenCalledWith(ACTIVE_TEXT, 'accademico')
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
    await fn()
    expect(api.critique).toHaveBeenCalledWith(ACTIVE_TEXT, valore)
  })

  it('senza cappello → nessuna fetch, mostra alert', async () => {
    act(() => { useEditorStore.getState().setAiModal('critique') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('insertMode è append', () => {
    expect(AI_ACTIONS['critique'].insertMode).toBe('append')
  })
})