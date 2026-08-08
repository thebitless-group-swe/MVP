// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { TopBar } from '@/components/TopBar'
import { useEditorStore, type AiActionId } from '@/store/useEditorStore'
import { AI_ACTIONS } from '@/lib/aiActions'

const AZIONI_IN_BARRA: [string, AiActionId][] = [
  ['Genera', 'generate'],
  ['Riassumi', 'summarize'],
  ['Riscrivi', 'rewrite'],
  ['Traduci', 'translate'],
  ['Grammatica', 'grammar'],
  ['Analisi', 'critique'],
]

beforeEach(() => {
  useEditorStore.setState({
    streamedOutput: '',
    isGenerating: false,
    errorMessage: null,
    aiModal: null,
  })
})

describe('TopBar — accesso alle azioni', () => {
  it.each(AZIONI_IN_BARRA)(
    '«%s» apre la modale %s',
    async (etichetta, actionId) => {
      render(<TopBar />)

      await userEvent.click(screen.getByRole('button', { name: etichetta }))

      expect(useEditorStore.getState().aiModal).toBe(actionId)
    },
  )

  it.each(AZIONI_IN_BARRA)('«%s» non è disabilitato a riposo', (etichetta) => {
    render(<TopBar />)
    const pulsante = screen.getByRole('button', { name: etichetta })

    expect(pulsante).toBeEnabled()
    expect(pulsante).not.toHaveAttribute('aria-disabled', 'true')
  })

  it.each(AZIONI_IN_BARRA)(
    '«%s» è disabilitato durante lo streaming',
    (etichetta) => {
      useEditorStore.setState({ isGenerating: true })
      render(<TopBar />)

      expect(screen.getByRole('button', { name: etichetta })).toBeDisabled()
    },
  )
})

describe('TopBar — «Analisi»', () => {
  it('non si presenta come non disponibile', () => {
    render(<TopBar />)
    const analisi = screen.getByRole('button', { name: 'Analisi' })

    expect(analisi).not.toHaveAttribute('title', expect.stringContaining('non disponibile'))
  })

  it('apre la modale sul registry di critique', async () => {
    render(<TopBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Analisi' }))

    const actionId = useEditorStore.getState().aiModal
    expect(actionId).toBe('critique')
    expect(AI_ACTIONS.critique.endpoint).toContain('/api/critique')
  })

  it('azzera output ed errore della chiamata precedente', async () => {
    useEditorStore.setState({
      streamedOutput: 'analisi precedente',
      errorMessage: 'errore precedente',
    })
    render(<TopBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Analisi' }))

    expect(useEditorStore.getState().streamedOutput).toBe('')
    expect(useEditorStore.getState().errorMessage).toBeNull()
  })
})
