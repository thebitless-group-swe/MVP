import { newId } from './id'

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

// Vedi scegliFileConInput.
export const GRAZIA_ANNULLAMENTO_MS = 300

/** Titolo di ripiego quando il file scelto non espone un nome utilizzabile. */
const TITOLO_DI_RIPIEGO = 'Nota importata'

/**
 * Riconosce l'errore con cui il browser segnala «l'utente ha annullato».
 *
 * Si controlla il name e non `instanceof`, che salta fra i realm del browser.
 */
function eAnnullamento(err: unknown): boolean {
  return err != null && (err as { name?: string }).name === 'AbortError'
}

/**
 * Ramo di fallback per i browser senza File System Access API.
 *
 * Non e' un caso limite, R-1-V-Ob impone anche Firefox che quell'API non ce
 * l'ha. Torna `null` per l'annullamento e non la stringa vuota, che non
 * distinguerebbe «annullato» da «file vuoto» (un .md vuoto e' valido).
 */
function scegliFileConInput(): Promise<{ text: string; fileName: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt'

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () =>
        resolve({ text: (reader.result as string) ?? '', fileName: file.name })
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    }

    input.oncancel = () => resolve(null)

    // Seconda via d'uscita: `oncancel` non lo emettono tutti i browser, e dove
    // manca questa Promise resterebbe pendente per sempre. Il margine serve
    // perche' `change` arriva subito dopo il focus quando una scelta c'e'.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!input.files?.length) resolve(null)
        }, GRAZIA_ANNULLAMENTO_MS)
      },
      { once: true },
    )

    input.click()
  })
}

/** Apre una nota leggendo un file dal filesystem (File System Access API con fallback input) */
export async function openNoteFromFile(): Promise<Note | null> {
  let text: string
  let fileName: string

  if ('showOpenFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'Testo / Markdown',
            accept: { 'text/plain': ['.md', '.txt'] },
          },
        ],
        multiple: false,
      })
      const file = await fileHandle.getFile()
      text = await file.text()
      fileName = file.name
    } catch (err: unknown) {
      if (eAnnullamento(err)) return null
      throw err
    }
  } else {
    const scelta = await scegliFileConInput()
    if (!scelta) return null
    text = scelta.text
    fileName = scelta.fileName
  }

  const now = Date.now()
  const title = fileName ? fileName.replace(/\.(md|txt)$/i, '') : TITOLO_DI_RIPIEGO

  return {
    id: newId(),
    title,
    content: text,
    createdAt: now,
    updatedAt: now,
  }
}

/** Salva una nota su file (showSaveFilePicker con fallback download) */
export async function saveNoteToFile(note: Note): Promise<void> {
  const fileName = `${note.title || 'nota'}.md`
  const blob = new Blob([note.content], { type: 'text/markdown' })

  if ('showSaveFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Markdown',
            accept: { 'text/markdown': ['.md'] },
          },
        ],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
    } catch (err: unknown) {
      if (eAnnullamento(err)) return
      throw err
    }
  } else {
    // PUNTO APERTO (issue #32), da provare su Firefox vero. L'ancora non e' inserita nel
    // documento e revokeObjectURL parte subito dopo il click mentre il download
    // e' asincrono: due pattern fragili proprio sul browser per cui questo ramo
    // esiste. In jsdom non si vede.
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }
}

/** Rinomina una nota aggiornando il titolo (il nuovo nome verrà usato al prossimo salvataggio) */
export async function renameNote(note: Note, name: string): Promise<Note> {
  return {
    ...note,
    title: name.trim() || 'Senza titolo',
    updatedAt: Date.now(),
  }
}
