import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Note } from '../lib/fileSystem'
import { newId } from '../lib/id'
import { useEditorStore } from './useEditorStore'

type NotesState = {
  list: Note[]
  currentId: string | null
  createEmpty: () => Note
  select: (id: string) => void
  updateCurrent: (patch: Partial<Pick<Note, 'title' | 'content'>>) => void
  deleteNote: (id: string) => void
  loadNote: (note: Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }) => void
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      list: [],
      currentId: null,

      /**
       * Crea una nota vuota, o non lascia traccia di averci provato.
       *
       * UC75 chiede due cose a chi gestisce un errore di creazione: informare
       * l'utente — e quello tocca al chiamante, che ha l'interfaccia — e
       * «ripristinare lo stato precedente per evitare perdite di dati», che
       * tocca a qui. Da cui le due precauzioni:
       *
       * 1. l'id si genera **prima** di ogni mutazione, cosi' un suo fallimento
       *    esce senza aver toccato nulla;
       * 2. le mutazioni stanno in un `try` che, se qualcosa cede a meta',
       *    rimette lo stato com'era e rilancia.
       *
       * Il punto 2 non e' teorico: **misurato**, un `QuotaExceededError` di
       * `localStorage` propaga in modo sincrono da `set` attraverso il
       * middleware `persist`, ma **dopo** che lo stato in memoria e' gia'
       * cambiato. Senza ripristino l'utente vedrebbe il messaggio d'errore e
       * insieme la nota comparire nell'elenco, con l'editor ancora sul
       * contenuto della nota precedente.
       */
      createEmpty: () => {
        const id = newId()
        const precedente = { list: get().list, currentId: get().currentId }

        try {
          const { currentId } = precedente
          if (currentId) {
            const content = useEditorStore.getState().currentText
            set((s) => ({
              list: s.list.map((n) =>
                n.id === currentId ? { ...n, content, updatedAt: Date.now() } : n
              ),
            }))
          }
          const now = Date.now()
          const note: Note = {
            id,
            title: 'Senza titolo',
            content: '',
            createdAt: now,
            updatedAt: now,
          }
          set((s) => ({ list: [...s.list, note], currentId: note.id }))
          useEditorStore.getState().loadDocument('')
          return note
        } catch (err) {
          try {
            set(precedente)
          } catch {
            // Se anche il ripristino non riesce a persistere, la persistenza
            // e' gia' compromessa a monte: quello che conta qui e' che lo
            // stato in memoria — l'unico che l'interfaccia legge — sia tornato
            // indietro, e a quel punto lo e' gia'.
          }
          throw err
        }
      },

      select(id: string) {
        const { currentId } = get()
        if (currentId) {
          const content = useEditorStore.getState().currentText
          set((s) => ({
            list: s.list.map((n) =>
              n.id === currentId ? { ...n, content, updatedAt: Date.now() } : n
            ),
          }))
        }
        set({ currentId: id })
        const note = get().list.find((n) => n.id === id)
        if (note) useEditorStore.getState().loadDocument(note.content)
      },

      updateCurrent(patch) {
        const { currentId, list } = get()
        if (!currentId) return
        set({
          list: list.map((n) =>
            n.id === currentId
              ? { ...n, ...patch, updatedAt: Date.now() }
              : n
          ),
        })
      },
      /**
       * Rimuove una nota dall'elenco e riallinea l'editor.
       *
       * **Il caricamento del documento non e' un ornamento.** `select` e
       * `loadNote` lo fanno gia'; `deleteNote` era l'unica delle tre a non
       * farlo, e finche' nessun punto della UI la raggiungeva la cosa non si
       * vedeva. Misurato: eliminando la nota corrente, il suo testo restava
       * nell'editor mentre `currentId` passava a un'altra nota; al primo cambio
       * nota quel testo veniva salvato **sopra** la nota di destinazione, che
       * perdeva il proprio contenuto senza alcun segnale.
       *
       * **Il ripristino risponde a UC81**, che di post-condizioni ne pretende
       * tre: «L'integrita' del dato viene preservata. **La nota non viene
       * eliminata.** L'utente riceve un feedback sull'errore». Le prime due
       * stanno qui, la terza tocca al chiamante che ha l'interfaccia. E' lo
       * stesso schema di `createEmpty`, non un secondo meccanismo.
       *
       * **Limite da dichiarare (R-91-F-De).** La rimozione e' a livello di
       * applicazione: la nota sparisce dall'elenco e dalla persistenza locale,
       * ma **il file su disco resta**. UC80.1 pretende la rimozione dal
       * supporto fisico, che una pagina web non puo' fare su un file
       * arbitrario — e Firefox, che R-1-V-Ob impone, non ha nemmeno la File
       * System Access API. E' un requisito impossibile come specificato, non
       * un requisito non implementato: va portato alla revisione dell'AdR.
       */
      deleteNote: (id: string) => {
        const precedente = { list: get().list, currentId: get().currentId }

        const newList = precedente.list.filter((note) => note.id !== id)
        const eliminataLaCorrente = precedente.currentId === id
        const newCurrentId = eliminataLaCorrente
          ? (newList[0]?.id ?? null)
          : precedente.currentId

        try {
          set({ list: newList, currentId: newCurrentId })
          if (eliminataLaCorrente) {
            const subentrata = newList.find((n) => n.id === newCurrentId)
            useEditorStore.getState().loadDocument(subentrata?.content ?? '')
          }
        } catch (err) {
          try {
            set(precedente)
          } catch {
            // Vedi `createEmpty`: se nemmeno il ripristino persiste, quello che
            // conta e' che lo stato in memoria — l'unico che l'interfaccia
            // legge — sia gia' tornato indietro.
          }
          throw err
        }
      },

loadNote: (noteData) => {
  const now = Date.now()
  const note: Note = {
    id: noteData.id,
    title: noteData.title,
    content: noteData.content,
    createdAt: noteData.createdAt ?? now,
    updatedAt: noteData.updatedAt ?? now,
  }
  set((s) => {
    const exists = s.list.some((n) => n.id === note.id)
    const newList = exists
      ? s.list.map((n) => (n.id === note.id ? note : n))
      : [...s.list, note]
    return { list: newList, currentId: note.id }
  })
  useEditorStore.getState().loadDocument(note.content)
},
    }),
    { name: 'notes_persistence', 
      onRehydrateStorage: () => (state) => {
        if(!state) return
        const currentNote = state.list.find((n) => n.id === state.currentId)
        if (currentNote) {
          useEditorStore.getState().loadDocument(currentNote.content)
        }
      }
    }
  )
)

// Selettori granulari
export const useNotesList = () => useNotesStore((s) => s.list)
export const useCurrentNote = () =>
  useNotesStore((s) => s.list.find((n) => n.id === s.currentId) ?? null)