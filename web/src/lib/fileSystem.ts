// lib/fileSystem.ts

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

/** Apre una nota leggendo un file dal filesystem (File System Access API con fallback input) */
export async function openNoteFromFile(): Promise<Note | null> {
  let text: string
  let fileName: string

  if ('showOpenFilePicker' in window) {
    // File System Access API (Chrome/Edge)
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
      // L'utente ha annullato il picker
      if (err instanceof Error && err.name === 'AbortError') return null
      throw err
    }
  } else {
    // Fallback: <input type="file">
    text = await new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.md,.txt'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return resolve('')
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
      }
      input.oncancel = () => resolve('')
      input.click()
    })
    fileName = ''
    if (!text) return null
  }

  const now = Date.now()
  const title = fileName
    ? fileName.replace(/\.(md|txt)$/i, '')
    : 'Imported note'

  return {
    id: crypto.randomUUID(),
    title,
    content: text,
    createdAt: now,
    updatedAt: now,
  }
}

/** Salva una nota su file (stub — implementato in FS-02) */
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
      if (err instanceof Error && err.name === 'AbortError') return
      throw err
    }
  } else {
    // Fallback: download automatico
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