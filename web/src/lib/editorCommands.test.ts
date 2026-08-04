import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cycleHeadingCommand,
  insertImageCommand,
  setHeadingCommand,
  toggleBoldCommand,
  toggleInlineCodeCommand,
  toggleItalicCommand,
  toggleLinkCommand,
  toggleListCommand,
  toggleOrderedListCommand,
  toggleStrikethroughCommand,
  toggleUnderlineCommand,
} from '@/lib/editorCommands'

let view: EditorView | null = null

/** Monta una EditorView con il documento e la selezione richiesti. */
const mount = (doc: string, from: number, to: number = from): EditorView => {
  view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
    parent: document.body,
  })
  return view
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe('toggleUnderlineCommand', () => {
  it('avvolge la selezione tra ++', () => {
    const v = mount('ciao mondo', 0, 4)

    toggleUnderlineCommand(v)

    expect(v.state.doc.toString()).toBe('++ciao++ mondo')
  })

  it('rimuove i marcatori quando sono dentro la selezione', () => {
    const v = mount('++ciao++ mondo', 0, 8)

    toggleUnderlineCommand(v)

    expect(v.state.doc.toString()).toBe('ciao mondo')
  })

  it('rimuove i marcatori quando circondano la selezione', () => {
    const v = mount('++ciao++ mondo', 2, 6)

    toggleUnderlineCommand(v)

    expect(v.state.doc.toString()).toBe('ciao mondo')
  })

  it('inserisce i marcatori vuoti senza selezione, col cursore in mezzo', () => {
    const v = mount('', 0)

    toggleUnderlineCommand(v)

    expect(v.state.doc.toString()).toBe('++++')
    expect(v.state.selection.main.from).toBe(2)
    expect(v.state.selection.main.to).toBe(2)
  })
})

describe('toggleStrikethroughCommand', () => {
  it('avvolge la selezione tra ~~', () => {
    const v = mount('ciao mondo', 0, 4)

    toggleStrikethroughCommand(v)

    expect(v.state.doc.toString()).toBe('~~ciao~~ mondo')
  })

  it('rimuove i marcatori quando sono dentro la selezione', () => {
    const v = mount('~~ciao~~ mondo', 0, 8)

    toggleStrikethroughCommand(v)

    expect(v.state.doc.toString()).toBe('ciao mondo')
  })

  it('inserisce i marcatori vuoti senza selezione', () => {
    const v = mount('', 0)

    toggleStrikethroughCommand(v)

    expect(v.state.doc.toString()).toBe('~~~~')
  })
})

describe('setHeadingCommand', () => {
  it.each([
    [1, '# titolo'],
    [2, '## titolo'],
    [3, '### titolo'],
  ] as const)('applica il livello %i', (level, expected) => {
    const v = mount('titolo', 0)

    setHeadingCommand(v, level)

    expect(v.state.doc.toString()).toBe(expected)
  })

  it('sostituisce il livello già presente invece di accumularlo', () => {
    const v = mount('## titolo', 4)

    setHeadingCommand(v, 1)

    expect(v.state.doc.toString()).toBe('# titolo')
  })

  it('il livello 0 riporta la riga a testo normale', () => {
    const v = mount('### titolo', 5)

    setHeadingCommand(v, 0)

    expect(v.state.doc.toString()).toBe('titolo')
  })

  it('agisce solo sulla riga del cursore', () => {
    const v = mount('prima\nseconda', 8)

    setHeadingCommand(v, 2)

    expect(v.state.doc.toString()).toBe('prima\n## seconda')
  })
})

describe('comandi inline preesistenti', () => {
  it.each([
    ['grassetto', toggleBoldCommand, '**ciao** mondo'],
    ['corsivo', toggleItalicCommand, '*ciao* mondo'],
    ['codice inline', toggleInlineCodeCommand, '`ciao` mondo'],
  ] as const)('%s avvolge la selezione', (_name, command, expected) => {
    const v = mount('ciao mondo', 0, 4)

    command(v)

    expect(v.state.doc.toString()).toBe(expected)
  })

  it.each([
    ['grassetto', toggleBoldCommand, '**ciao** mondo'],
    ['corsivo', toggleItalicCommand, '*ciao* mondo'],
    ['codice inline', toggleInlineCodeCommand, '`ciao` mondo'],
  ] as const)('%s è un toggle: riapplicato rimuove i marcatori', (_name, command, wrapped) => {
    const markerLength = (wrapped.length - 'ciao mondo'.length) / 2
    const v = mount(wrapped, 0, 4 + markerLength * 2)

    command(v)

    expect(v.state.doc.toString()).toBe('ciao mondo')
  })
})

describe('cycleHeadingCommand', () => {
  it('cicla da testo normale a # a ## a ### e ritorno', () => {
    const v = mount('titolo', 0)

    cycleHeadingCommand(v)
    expect(v.state.doc.toString()).toBe('# titolo')

    cycleHeadingCommand(v)
    expect(v.state.doc.toString()).toBe('## titolo')

    cycleHeadingCommand(v)
    expect(v.state.doc.toString()).toBe('### titolo')

    cycleHeadingCommand(v)
    expect(v.state.doc.toString()).toBe('titolo')
  })
})

describe('toggleListCommand', () => {
  it('aggiunge "- " alla riga corrente', () => {
    const v = mount('primo', 0)

    toggleListCommand(v)

    expect(v.state.doc.toString()).toBe('- primo')
  })

  it('rimuove "- " dalle righe che già lo hanno', () => {
    const v = mount('- primo', 3)

    toggleListCommand(v)

    expect(v.state.doc.toString()).toBe('primo')
  })

  it('agisce su tutte le righe della selezione', () => {
    const v = mount('primo\nsecondo', 0, 13)

    toggleListCommand(v)

    expect(v.state.doc.toString()).toBe('- primo\n- secondo')
  })

  it('conserva l’indentazione quando rimuove il marcatore', () => {
    const v = mount('  - annidato', 5)

    toggleListCommand(v)

    expect(v.state.doc.toString()).toBe('  annidato')
  })
})

describe('toggleOrderedListCommand', () => {
  it('numera le righe della selezione in sequenza', () => {
    const v = mount('primo\nsecondo', 0, 13)

    toggleOrderedListCommand(v)

    expect(v.state.doc.toString()).toBe('1. primo\n2. secondo')
  })

  it('rimuove la numerazione dalle righe che già la hanno', () => {
    const v = mount('1. primo', 4)

    toggleOrderedListCommand(v)

    expect(v.state.doc.toString()).toBe('primo')
  })
})

describe('insertImageCommand', () => {
  it('usa la selezione come alt text e seleziona l’url segnaposto', () => {
    const v = mount('logo', 0, 4)

    insertImageCommand(v)

    expect(v.state.doc.toString()).toBe('![logo](https://)')
    const { from, to } = v.state.selection.main
    expect(v.state.sliceDoc(from, to)).toBe('https://')
  })
})

describe('toggleLinkCommand', () => {
  it('avvolge la selezione e seleziona l’url segnaposto', () => {
    const v = mount('sito', 0, 4)

    toggleLinkCommand(v)

    expect(v.state.doc.toString()).toBe('[sito](https://)')
    const { from, to } = v.state.selection.main
    expect(v.state.sliceDoc(from, to)).toBe('https://')
  })

  it('scarta il link quando la selezione lo copre esattamente', () => {
    const doc = '[sito](https://esempio.it)'
    const v = mount(doc, 0, doc.length)

    toggleLinkCommand(v)

    expect(v.state.doc.toString()).toBe('sito')
  })

  it('scarta il link quando il cursore è dentro al link', () => {
    const v = mount('vai a [sito](https://esempio.it) ora', 8)

    toggleLinkCommand(v)

    expect(v.state.doc.toString()).toBe('vai a sito ora')
  })
})
