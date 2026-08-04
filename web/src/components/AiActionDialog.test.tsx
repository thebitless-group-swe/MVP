// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiActionDialog } from '@/components/AiActionDialog'
import { useEditorStore } from '@/store/useEditorStore'

// Hoisted: i mock devono essere pronti prima che vi.mock li usi
const { mockStart, mockAbort } = vi.hoisted(() => ({
  mockStart: vi.fn().mockResolvedValue(undefined),
  mockAbort: vi.fn(),
}))

vi.mock('@/hooks/useAiStream', () => ({
  useAiStream: () => ({ start: mockStart, abort: mockAbort, status: 'idle' }),
}))

// useTypewriter restituisce il testo direttamente: niente RAF in jsdom
vi.mock('@/hooks/useTypewriter', () => ({
  useTypewriter: (text: string) => text,
}))

// getActiveText: testo lungo abbastanza per summarize (minLength 10)
vi.mock('@/lib/aiActions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiActions')>()
  return { ...actual, getActiveText: vi.fn(() => ACTIVE_TEXT) }
})

import { getActiveText } from '@/lib/aiActions'

const ACTIVE_TEXT = 'testo di esempio abbastanza lungo per il test'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActiveText).mockReturnValue(ACTIVE_TEXT)
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
  it('summarize: invia text e length dal registry', async () => {
    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).toHaveBeenCalledWith({
      endpoint: expect.stringContaining('/api/summarize'),
      body: { text: ACTIVE_TEXT, length: 'medio' },
    })
  })

  it('generate: invia prompt e length', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)

    await userEvent.type(
      screen.getByRole('textbox'),
      'Scrivi un articolo sulla Luna',
    )
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).toHaveBeenCalledWith({
      endpoint: expect.stringContaining('/api/generate'),
      body: { prompt: 'Scrivi un articolo sulla Luna', length: 'medio' },
    })
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
  it('generate: nessuna fetch con prompt troppo corto, mostra alert', async () => {
    act(() => { useEditorStore.getState().setAiModal('generate') })
    render(<AiActionDialog />)

    // Meno di 3 caratteri (minLength per generate)
    await userEvent.type(screen.getByRole('textbox'), 'ab')
    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('summarize: nessuna fetch con testo dell editor troppo corto', async () => {
    vi.mocked(getActiveText).mockReturnValue('corto') // < 10 caratteri

    act(() => { useEditorStore.getState().setAiModal('summarize') })
    render(<AiActionDialog />)

    await userEvent.click(screen.getByRole('button', { name: /genera/i }))

    expect(mockStart).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})