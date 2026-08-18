// @vitest-environment jsdom

/**
 * Test del selettore di vista.
 *
 * Il documento di analisi lo indicava fra le possibili «shell di composizione»
 * da escludere dalla misura. La misura dice il contrario: ha sei rami e cinque
 * funzioni proprie — tre azioni sullo store piu' la variante visiva che marca
 * la vista attiva — quindi e' comportamento, e va provato invece che escluso.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ViewToggle } from '@/components/ViewToggle'
import { useEditorStore } from '@/store/useEditorStore'

beforeEach(() => {
  useEditorStore.setState({ viewMode: 'split' })
})

describe('ViewToggle', () => {
  it.each([
    ['Editor', 'editor'],
    ['Diviso', 'split'],
    ['Render', 'render'],
  ] as const)('«%s» imposta la vista su %s', async (etichetta, atteso) => {
    render(<ViewToggle />)

    await userEvent.click(screen.getByText(etichetta))

    expect(useEditorStore.getState().viewMode).toBe(atteso)
  })

  it('marca la vista attiva e solo quella', () => {
    useEditorStore.setState({ viewMode: 'render' })
    render(<ViewToggle />)

    // La variante attiva ha lo sfondo pieno, le altre sono «ghost».
    const attivo = screen.getByText('Render')
    const inattivo = screen.getByText('Editor')

    expect(attivo.className).not.toBe(inattivo.className)
    expect(screen.getByText('Diviso').className).toBe(inattivo.className)
  })

  it('segue il cambio di vista deciso altrove', () => {
    // E' un osservatore dello store, non il proprietario dello stato: se la
    // vista cambia da un'altra parte deve aggiornarsi comunque.
    const { rerender } = render(<ViewToggle />)
    const primaClasse = screen.getByText('Editor').className

    useEditorStore.setState({ viewMode: 'editor' })
    rerender(<ViewToggle />)

    expect(screen.getByText('Editor').className).not.toBe(primaClasse)
  })
})
