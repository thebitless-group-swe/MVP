import { EditorView } from '@codemirror/view'

/**
 * Avvolge la selezione tra due marcatori inline (es. ** per grassetto).
 * È un toggle: se la selezione è già avvolta — sia che i marcatori siano
 * dentro la selezione, sia che la circondino nel documento — li rimuove.
 */
const wrapInline = (
  view: EditorView,
  before: string,
  after: string = before,
): boolean => {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)

  // Caso 1: i marcatori sono dentro la selezione → li tolgo.
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length)
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    })
    view.focus()
    return true
  }

  // Caso 2: i marcatori circondano la selezione nel documento → li tolgo.
  const outerFrom = from - before.length
  const outerTo = to + after.length
  if (
    outerFrom >= 0 &&
    outerTo <= view.state.doc.length &&
    view.state.sliceDoc(outerFrom, from) === before &&
    view.state.sliceDoc(to, outerTo) === after
  ) {
    view.dispatch({
      changes: { from: outerFrom, to: outerTo, insert: selected },
      selection: { anchor: outerFrom, head: outerFrom + selected.length },
    })
    view.focus()
    return true
  }

  // Caso 3: avvolgo la selezione (vuota o no) e la lascio selezionata.
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: {
      anchor: from + before.length,
      head: from + before.length + selected.length,
    },
  })
  view.focus()
  return true
}

export const toggleBoldCommand = (view: EditorView): boolean =>
  wrapInline(view, '**')

export const toggleItalicCommand = (view: EditorView): boolean =>
  wrapInline(view, '*')

export const toggleInlineCodeCommand = (view: EditorView): boolean =>
  wrapInline(view, '`')

/** Sottolineato: `++testo++`, reso dal plugin remarkUnderline. */
export const toggleUnderlineCommand = (view: EditorView): boolean =>
  wrapInline(view, '++')

/** Barrato: `~~testo~~`, reso da remark-gfm. */
export const toggleStrikethroughCommand = (view: EditorView): boolean =>
  wrapInline(view, '~~')

/**
 * Titolo: cicla il livello sulla riga corrente — nessuno → # → ## → ### →
 * di nuovo testo normale.
 */
export const cycleHeadingCommand = (view: EditorView): boolean => {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const match = line.text.match(/^(#{1,6}) /)

  let insert = '# '
  let removeLen = 0
  if (match) {
    removeLen = match[0].length
    insert = match[1].length >= 3 ? '' : '#'.repeat(match[1].length + 1) + ' '
  }

  view.dispatch({
    changes: { from: line.from, to: line.from + removeLen, insert },
  })
  view.focus()
  return true
}

/** Livelli offerti dal menu Titolo: 0 è testo normale. */
export type HeadingLevel = 0 | 1 | 2 | 3

/**
 * Titolo: imposta un livello esplicito sulla riga corrente, sostituendo
 * quello eventualmente già presente (R-17 → R-20).
 */
export const setHeadingCommand = (
  view: EditorView,
  level: HeadingLevel,
): boolean => {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const match = line.text.match(/^(#{1,6}) /)

  const removeLen = match ? match[0].length : 0
  const insert = level === 0 ? '' : `${'#'.repeat(level)} `

  view.dispatch({
    changes: { from: line.from, to: line.from + removeLen, insert },
  })
  view.focus()
  return true
}

/**
 * Lista puntata: aggiunge "- " a ogni riga della selezione, oppure lo
 * rimuove dalle righe che già lo hanno (toggle per riga).
 */
export const toggleListCommand = (view: EditorView): boolean => {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n)
    const match = line.text.match(/^(\s*)- /)
    if (match) {
      changes.push({
        from: line.from + match[1].length,
        to: line.from + match[0].length,
        insert: '',
      })
    } else {
      changes.push({ from: line.from, to: line.from, insert: '- ' })
    }
  }

  const changeSet = view.state.changes(changes)
  // assoc 1: il cursore si posiziona DOPO il testo inserito, non prima
  const selection = view.state.selection.map(changeSet, 1)
  view.dispatch({ changes, selection })
  view.focus()
  return true
}

/**
 * Lista numerata: aggiunge "1. ", "2. ", ... a ogni riga della selezione
 * (numerazione sequenziale a partire da 1), oppure la rimuove dalle righe
 * che già la hanno (toggle per riga).
 */
export const toggleOrderedListCommand = (view: EditorView): boolean => {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  let counter = 1
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n)
    const match = line.text.match(/^(\s*)\d+\. /)
    if (match) {
      changes.push({
        from: line.from + match[1].length,
        to: line.from + match[0].length,
        insert: '',
      })
    } else {
      changes.push({ from: line.from, to: line.from, insert: `${counter}. ` })
      counter += 1
    }
  }

  const changeSet = view.state.changes(changes)
  const selection = view.state.selection.map(changeSet, 1)
  view.dispatch({ changes, selection })
  view.focus()
  return true
}

/**
 * Immagine: avvolge la selezione come alt text in ![alt](url) e seleziona
 * "https://" per la sovrascrittura immediata (stessa UX del link).
 */
export const insertImageCommand = (view: EditorView): boolean => {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const defaultUrl = 'https://'

  // "![" + selected + "](" = selected.length + 4 caratteri prima dell'url
  const urlStart = from + selected.length + 4
  view.dispatch({
    changes: { from, to, insert: `![${selected}](${defaultUrl})` },
    selection: { anchor: urlStart, head: urlStart + defaultUrl.length },
  })
  view.focus()
  return true
}

export const toggleLinkCommand = (view: EditorView): boolean => {
  const mainSelection = view.state.selection.main
  const { from, to } = mainSelection
  const selected = view.state.sliceDoc(from, to)

  const line = view.state.doc.lineAt(from)
  const lineText = line.text
  
  //Selezione esatta del link intero 
  const exactMatch = selected.match(/^\[(.*?)\]\((.*?)\)$/)
  if (exactMatch) {
    view.dispatch({
      changes: { from, to, insert: exactMatch[1] },
      selection: { anchor: from + exactMatch[1].length } 
    })
    view.focus()
    return true
  }

  //Unwrap a scansione di riga
  const linkRegex = /\[(.*?)\]\((.*?)\)/g
  let match
  while ((match = linkRegex.exec(lineText)) !== null) {
    const matchStart = line.from + match.index
    const matchEnd = matchStart + match[0].length
    
    if (from >= matchStart && to <= matchEnd) {
      view.dispatch({
        changes: { from: matchStart, to: matchEnd, insert: match[1] },
        selection: { anchor: matchStart + match[1].length }
      })
      view.focus()
      return true
    }
  }

  // Wrap standard del testo selezionato
  const defaultUrl = 'https://'
  view.dispatch({
    changes: { from, to, insert: `[${selected}](${defaultUrl})` },
    selection: { 
      // Seleziona esattamente "https://" per permettere la sovrascrittura immediata
      anchor: from + selected.length + 3, 
      head: from + selected.length + 3 + defaultUrl.length 
    }
  })
  
  view.focus()
  return true
}