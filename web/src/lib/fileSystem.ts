// lib/fileSystem.ts

import { newId } from './id'

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

/**
 * Margine fra il ritorno del focus alla finestra e la conclusione che l'utente
 * abbia annullato il selettore. Serve solo alla seconda via d'uscita del ramo
 * di fallback: vedi `scegliFileConInput`.
 */
export const GRAZIA_ANNULLAMENTO_MS = 300

/** Titolo di ripiego quando il file scelto non espone un nome utilizzabile. */
const TITOLO_DI_RIPIEGO = 'Nota importata'

/**
 * Riconosce l'errore con cui il browser segnala «l'utente ha annullato».
 *
 * Duck typing e non `instanceof Error`: `DOMException` appartiene al realm del
 * browser, e `instanceof` fallisce attraversando i confini di realm — iframe,
 * worker, e l'ambiente di test, dove rendeva questo ramo non verificabile. E'
 * anche la forma gia' adottata da `Sidebar.tsx:35,47,71`: qui c'erano due
 * convenzioni diverse per lo stesso controllo, e questa e' la piu' robusta.
 */
function eAnnullamento(err: unknown): boolean {
  return err != null && (err as { name?: string }).name === 'AbortError'
}

/**
 * Ramo di fallback per i browser privi di File System Access API.
 *
 * Non e' un caso limite: **R-1-V-Ob impone anche Firefox**, che quell'API non
 * ce l'ha, quindi per un terzo dei browser obbligatori questo e' il percorso
 * primario e deve comportarsi come l'altro.
 *
 * Restituisce `null` per l'annullamento e `{ text, fileName }` per la scelta.
 * Il tipo di ritorno e' la correzione centrale: prima la Promise portava una
 * stringa sola, e la stringa vuota non bastava a distinguere «annullato» da
 * «file legittimamente vuoto» — un `.md` vuoto e' un file valido, e finiva
 * scartato. Portando anche `fileName` si chiude nello stesso punto la perdita
 * del titolo della nota su Firefox.
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

    // Seconda via d'uscita. `oncancel` non e' emesso da tutti i browser: dove
    // manca, annullare il selettore non produce alcun evento e questa Promise
    // resterebbe pendente per sempre, lasciando l'interfaccia bloccata senza
    // alcun segnale. Il ritorno del focus alla finestra e' l'unico appiglio
    // disponibile in quel caso. Il margine serve perche' `change` arriva subito
    // dopo il focus quando una scelta c'e' stata davvero; si controlla
    // `input.files` e non un flag interno proprio perche' il browser lo popola
    // prima di emettere `change`. Le chiamate successive a `resolve` sono
    // inerti, quindi questa guardia non puo' sovrascrivere una scelta valida.
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
    // Fallback: download automatico.
    //
    // ATTENZIONE — punto aperto, non verificabile in jsdom. L'ancora non viene
    // inserita nel documento e `revokeObjectURL` e' invocato nell'istruzione
    // successiva al click, mentre il download e' asincrono: sono due pattern
    // storicamente fragili su Firefox, che e' proprio il browser per cui questo
    // ramo esiste. Non sono stati modificati perche' la correzione va decisa
    // sulla verifica in browser reale (#32, passo 4) e non su una supposizione:
    // toccarli alla cieca significherebbe sostituire un rischio non misurato
    // con una modifica non verificata.
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
