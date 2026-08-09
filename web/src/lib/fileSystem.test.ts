// @vitest-environment jsdom

/**
 * Test del percorso file system, su entrambi i rami.
 *
 * La giuntura e' la presenza di `showOpenFilePicker` / `showSaveFilePicker` in
 * `window`: dove ci sono si passa dalla File System Access API (Chrome, Edge),
 * dove mancano dal fallback con `<input type="file">` e download. jsdom non le
 * definisce, quindi il ramo di fallback e' quello attivo per difetto e va
 * abilitato l'altro con `vi.stubGlobal`.
 *
 * Perche' questo file non esisteva e serve: R-1-V-Ob impone anche Firefox, che
 * non ha la File System Access API. Su uno dei tre browser obbligatori il ramo
 * di fallback non e' un caso limite ma il percorso primario, ed era coperto da
 * zero test — `Sidebar.test.tsx` mocka l'intero modulo, quindi non lo esercita.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GRAZIA_ANNULLAMENTO_MS,
  openNoteFromFile,
  renameNote,
  saveNoteToFile,
  type Note,
} from '@/lib/fileSystem'

const creaElemento = document.createElement.bind(document)

/** Intercetta l'`<input type="file">` che il fallback crea, senza aprirlo davvero. */
function intercettaInput(): HTMLInputElement {
  const input = creaElemento('input') as HTMLInputElement
  vi.spyOn(input, 'click').mockImplementation(() => {})
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'input' ? input : creaElemento(tag)) as typeof document.createElement)
  return input
}

/** Assegna i file scelti: `input.files` e' in sola lettura e va ridefinito. */
function popolaFiles(input: HTMLInputElement, ...file: File[]): void {
  Object.defineProperty(input, 'files', { value: file, configurable: true })
}

/** Scelta completa: il browser popola `files` e poi emette `change`. */
function scegli(input: HTMLInputElement, ...file: File[]): void {
  popolaFiles(input, ...file)
  input.onchange?.(new Event('change'))
}

function nota(): Note {
  return { id: 'x', title: 'Appunti', content: 'contenuto', createdAt: 0, updatedAt: 0 }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('openNoteFromFile — File System Access API (Chrome, Edge)', () => {
  it('usa il nome del file come titolo, senza estensione', async () => {
    const file = new File(['# Appunti'], 'appunti.md', { type: 'text/markdown' })
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValue([
      { getFile: () => Promise.resolve(file) },
    ]))

    const risultato = await openNoteFromFile()

    expect(risultato?.title).toBe('appunti')
    expect(risultato?.content).toBe('# Appunti')
  })

  it('annullare il selettore restituisce null, non un errore', async () => {
    vi.stubGlobal(
      'showOpenFilePicker',
      vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
    )

    await expect(openNoteFromFile()).resolves.toBeNull()
  })

  it('un errore diverso da AbortError viene rilanciato', async () => {
    //Chi chiama deve poterlo distinguere: `Sidebar.tsx` mostra un messaggio per
    //il secondo caso e tace per il primo.
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockRejectedValue(new Error('disco pieno')))

    await expect(openNoteFromFile()).rejects.toThrow('disco pieno')
  })
})

describe('openNoteFromFile — fallback senza File System Access API (Firefox)', () => {
  it('usa il nome del file come titolo, come fa l altro ramo', async () => {
    //E' il difetto per cui esiste questa issue: il ramo di fallback scartava
    //`file.name` e ricadeva su un titolo generico, quindi su Firefox il titolo
    //della nota caricata andava perso.
    const input = intercettaInput()
    const promessa = openNoteFromFile()

    scegli(input, new File(['# Appunti'], 'appunti.md', { type: 'text/markdown' }))

    const risultato = await promessa
    expect(risultato?.title).toBe('appunti')
    expect(risultato?.content).toBe('# Appunti')
  })

  it('un file legittimamente vuoto produce una nota vuota, non un annullamento', async () => {
    //I due rami avevano semantiche diverse a parita' di input: il ramo
    //principale restituiva una nota con contenuto vuoto, il fallback `null`,
    //perche' confondeva «stringa vuota» con «l'utente ha annullato».
    const input = intercettaInput()
    const promessa = openNoteFromFile()

    scegli(input, new File([''], 'vuoto.md', { type: 'text/markdown' }))

    const risultato = await promessa
    expect(risultato).not.toBeNull()
    expect(risultato?.content).toBe('')
    expect(risultato?.title).toBe('vuoto')
  })

  it('annullare il selettore restituisce null', async () => {
    const input = intercettaInput()
    const promessa = openNoteFromFile()

    input.oncancel?.(new Event('cancel'))

    await expect(promessa).resolves.toBeNull()
  })

  it('annullare si risolve anche dove `oncancel` non viene emesso', async () => {
    //`oncancel` non e' garantito ovunque. Dove manca, annullare il selettore non
    //produce alcun evento: senza una seconda via d'uscita la Promise resterebbe
    //pendente per sempre e l'interfaccia si bloccherebbe senza segnale.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const input = intercettaInput()
    const promessa = openNoteFromFile()

    //Il ritorno del focus e' l'unico segnale disponibile in quel caso.
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(GRAZIA_ANNULLAMENTO_MS + 10)

    await expect(promessa).resolves.toBeNull()
    expect(input.files?.length ?? 0).toBe(0)
  })

  it('il ritorno del focus non annulla una scelta in arrivo', async () => {
    //Contro-prova della via d'uscita precedente, nella sequenza reale: quando
    //l'utente sceglie un file, il browser popola `input.files` e restituisce il
    //focus alla finestra **prima** di emettere `change`. Una guardia che
    //concludesse «annullato» al solo ritorno del focus scarterebbe qui una nota
    //valida. Ordinare gli eventi come li ordina il browser e' cio' che rende
    //questo test capace di distinguere le due implementazioni.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const input = intercettaInput()
    const promessa = openNoteFromFile()

    popolaFiles(input, new File(['contenuto'], 'appunti.md'))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(GRAZIA_ANNULLAMENTO_MS + 10)

    //`change` arriva solo adesso, dopo che la guardia ha gia' deciso.
    input.onchange?.(new Event('change'))

    const risultato = await promessa
    expect(risultato?.content).toBe('contenuto')
    expect(risultato?.title).toBe('appunti')
  })

  it('confermare senza aver scelto alcun file restituisce null', async () => {
    const input = intercettaInput()
    const promessa = openNoteFromFile()

    scegli(input) //nessun file

    await expect(promessa).resolves.toBeNull()
  })
})

describe('saveNoteToFile — File System Access API (Chrome, Edge)', () => {
  it('scrive il contenuto e chiude il writable', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: () => Promise.resolve({ write, close }),
    })
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker)

    await saveNoteToFile(nota())

    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'Appunti.md' }),
    )
    expect(write).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('annullare il salvataggio non solleva', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
    )

    await expect(saveNoteToFile(nota())).resolves.toBeUndefined()
  })

  it('un errore diverso da AbortError viene rilanciato', async () => {
    vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new Error('permesso negato')))

    await expect(saveNoteToFile(nota())).rejects.toThrow('permesso negato')
  })
})

describe('saveNoteToFile — fallback download (Firefox)', () => {
  it('propone il download con il nome della nota', async () => {
    const ancora = creaElemento('a') as HTMLAnchorElement
    const click = vi.spyOn(ancora, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'a' ? ancora : creaElemento(tag)) as typeof document.createElement)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:finto'),
      revokeObjectURL: vi.fn(),
    })

    await saveNoteToFile(nota())

    expect(ancora.download).toBe('Appunti.md')
    expect(click).toHaveBeenCalledOnce()
  })

  it('una nota senza titolo ricade su un nome di file valido', async () => {
    const ancora = creaElemento('a') as HTMLAnchorElement
    vi.spyOn(ancora, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'a' ? ancora : creaElemento(tag)) as typeof document.createElement)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:finto'),
      revokeObjectURL: vi.fn(),
    })

    await saveNoteToFile({ ...nota(), title: '' })

    expect(ancora.download).toBe('nota.md')
  })
})

describe('renameNote', () => {
  /**
   * Terzo esportato del modulo, fuori dal percorso Firefox di questa issue: e'
   * coperto qui perche' `fileSystem.ts` entra nella misura di copertura proprio
   * grazie a #32, e lasciarci una funzione scoperta falserebbe i numeri di #42.
   *
   * I test fissano cio' che la funzione fa **oggi**, non cio' che UC82.1
   * pretende: la post-condizione «il file fisico viene rinominato sul disco» qui
   * non e' realizzata, e non e' realizzabile in un browser. La classificazione
   * di R-94 e la revisione di UC82.1 sono in #44.
   */
  it('aggiorna il titolo e rinfresca updatedAt, senza toccare il contenuto', async () => {
    const originale: Note = {
      id: 'x', title: 'Vecchio', content: 'corpo', createdAt: 0, updatedAt: 0,
    }

    const rinominata = await renameNote(originale, '  Nuovo  ')

    expect(rinominata.title).toBe('Nuovo')
    expect(rinominata.content).toBe('corpo')
    expect(rinominata.id).toBe('x')
    expect(rinominata.createdAt).toBe(0)
    expect(rinominata.updatedAt).toBeGreaterThan(0)
  })

  it('un nome vuoto o di soli spazi ricade su «Senza titolo»', async () => {
    const originale: Note = {
      id: 'x', title: 'Vecchio', content: '', createdAt: 0, updatedAt: 0,
    }

    expect((await renameNote(originale, '   ')).title).toBe('Senza titolo')
    expect((await renameNote(originale, '')).title).toBe('Senza titolo')
  })
})
