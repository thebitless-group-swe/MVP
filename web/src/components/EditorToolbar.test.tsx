import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorToolbar } from '@/components/EditorToolbar'
import { useEditorStore } from '@/store/useEditorStore'

const editorCommands = vi.hoisted(() => ({
  toggleUnderlineCommand: vi.fn(),
  toggleStrikethroughCommand: vi.fn(),
  setHeadingCommand: vi.fn(),
}))

vi.mock('@/lib/editorCommands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/editorCommands')>()),
  ...editorCommands,
}))

// I comandi sono mockati: alla toolbar basta che editorView sia presente.
const fakeView = {} as never

describe('EditorToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.setState({ editorView: fakeView })
  })

  it('espone i pulsanti Sottolineato e Barrato con le label corrette', () => {
    render(<EditorToolbar />)

    expect(screen.getByRole('button', { name: 'Sottolineato' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Barrato' })).toBeInTheDocument()
  })

  it('il pulsante Sottolineato invoca toggleUnderlineCommand', async () => {
    render(<EditorToolbar />)

    await userEvent.click(screen.getByRole('button', { name: 'Sottolineato' }))

    expect(editorCommands.toggleUnderlineCommand).toHaveBeenCalledWith(fakeView)
  })

  it('il pulsante Barrato invoca toggleStrikethroughCommand', async () => {
    render(<EditorToolbar />)

    await userEvent.click(screen.getByRole('button', { name: 'Barrato' }))

    expect(editorCommands.toggleStrikethroughCommand).toHaveBeenCalledWith(fakeView)
  })

  it('non invoca nulla se non esiste una EditorView', async () => {
    useEditorStore.setState({ editorView: null })
    render(<EditorToolbar />)

    await userEvent.click(screen.getByRole('button', { name: 'Sottolineato' }))

    expect(editorCommands.toggleUnderlineCommand).not.toHaveBeenCalled()
  })

  it('il menu Titolo offre i quattro livelli', async () => {
    render(<EditorToolbar />)

    await userEvent.click(screen.getByRole('button', { name: 'Titolo' }))

    for (const label of [
      'Titolo',
      'Sottotitolo',
      'Titolo di terzo livello',
      'Normale',
    ]) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument()
    }
  })

  it.each([
    ['Sottotitolo', 2],
    ['Normale', 0],
  ])('la voce %s applica il livello %i', async (label, level) => {
    render(<EditorToolbar />)

    await userEvent.click(screen.getByRole('button', { name: 'Titolo' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: label }))

    expect(editorCommands.setHeadingCommand).toHaveBeenCalledWith(fakeView, level)
  })
})
