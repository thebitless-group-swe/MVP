import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownView } from '@/components/MarkdownView'

describe('MarkdownView', () => {
  it('rende ++testo++ come sottolineato', () => {
    const { container } = render(<MarkdownView>{'++importante++'}</MarkdownView>)

    const underlined = container.querySelector('u')
    expect(underlined).not.toBeNull()
    expect(underlined).toHaveTextContent('importante')
  })

  it('conserva il testo attorno ai marcatori', () => {
    const { container } = render(
      <MarkdownView>{'prima ++dentro++ dopo'}</MarkdownView>,
    )

    expect(container.textContent).toBe('prima dentro dopo')
  })

  it('rende più occorrenze nella stessa riga', () => {
    const { container } = render(
      <MarkdownView>{'++uno++ e ++due++'}</MarkdownView>,
    )

    expect(container.querySelectorAll('u')).toHaveLength(2)
  })

  it('lascia intatto un ++ isolato', () => {
    const { container } = render(<MarkdownView>{'a ++ b'}</MarkdownView>)

    expect(container.querySelector('u')).toBeNull()
    expect(container.textContent).toContain('++')
  })

  it('rende ~~testo~~ come barrato tramite remark-gfm', () => {
    const { container } = render(<MarkdownView>{'~~vecchio~~'}</MarkdownView>)

    expect(container.querySelector('del')).toHaveTextContent('vecchio')
  })

  it('non abilita HTML raw', () => {
    const { container } = render(
      <MarkdownView>{'<script>alert(1)</script>'}</MarkdownView>,
    )

    expect(container.querySelector('script')).toBeNull()
  })

  it('rende il Markdown standard', () => {
    render(<MarkdownView>{'# Titolo'}</MarkdownView>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Titolo')
  })
})
