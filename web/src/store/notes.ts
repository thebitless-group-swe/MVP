import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Note } from '../lib/fileSystem'
import { newId } from '../lib/id'
import { useEditorStore } from './useEditorStore'

export const CONTENUTO_BENVENUTO = `# Benvenuto su Second Brain 🧠

Questo è il tuo nuovo spazio di lavoro intelligente per l'editing e la gestione della conoscenza. Oltre alla classica formattazione Markdown, Second Brain integra potenti **strumenti di Intelligenza Artificiale** per supportarti nella stesura e rielaborazione dei tuoi appunti.`

const TITOLO_BENVENUTO = 'Benvenuto'

type NotesState = {
  list: Note[]
  currentId: string | null
  createEmpty: (title?: string) => Note
  select: (id: string) => void
  updateCurrent: (patch: Partial<Pick<Note, 'title' | 'content'>>) => void
  deleteNote: (id: string) => void
  loadNote: (note: Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }) => void
  ensureWelcomeNote: () => void
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      list: [],
      currentId: null,

      /**
       * Crea una nota, o non lascia traccia di averci provato (UC75).
       *
       * L'id si genera PRIMA di ogni mutazione e le mutazioni stanno in un try
       * che rimette a posto. Non e' teorico: un QuotaExceededError di
       * localStorage propaga da `set` dopo che lo stato in memoria e' gia'
       * cambiato, quindi senza ripristino l'utente vede insieme l'errore e la
       * nota comparire nell'elenco.
       */
      createEmpty: (title = '') => {
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
            title: title.trim() || 'Senza titolo',
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
            //Se nemmeno il ripristino persiste pazienza, quello che conta e'
            //che lo stato in memoria sia gia' tornato indietro.
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
       * Rimuove una nota dall'elenco e riallinea l'editor (UC81).
       *
       * Il loadDocument serve davvero: senza, eliminando la nota corrente il
       * suo testo resta nell'editor e al primo cambio nota viene salvato SOPRA
       * la nota di destinazione, che perde tutto senza segnale.
       *
       * Limite da portare in revisione dell'AdR (R-91-F-De): la nota sparisce
       * dall'elenco e dalla persistenza locale ma IL FILE SU DISCO RESTA. UC80.1
       * pretende la rimozione dal supporto fisico, che una pagina web non puo'
       * fare, e Firefox non ha nemmeno la File System Access API.
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
            //Vedi createEmpty.
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

      //Chi ha gia' delle note non deve vedersela comparire davanti, quindi si
      //esce subito se la lista non e' vuota.
      ensureWelcomeNote: () => {
        if (get().list.length > 0) return
        get().loadNote({
          id: newId(),
          title: TITOLO_BENVENUTO,
          content: CONTENUTO_BENVENUTO,
        })
      },
    }),
    { name: 'notes_persistence', 
      onRehydrateStorage: () => (state) => {
        if(!state) return
        const currentNote = state.list.find((n) => n.id === state.currentId)
        if (currentNote) {
          useEditorStore.getState().loadDocument(currentNote.content)
          return
        }
        //Primo avvio, o l'utente ha svuotato tutto. Si usa `state` e non
        //useNotesStore: qui lo store si sta ancora creando, quindi la sua
        //const e' in temporal dead zone e leggerla solleva in silenzio.
        state.ensureWelcomeNote()
      }
    }
  )
)

export const useNotesList = () => useNotesStore((s) => s.list)
export const useCurrentNote = () =>
  useNotesStore((s) => s.list.find((n) => n.id === s.currentId) ?? null)