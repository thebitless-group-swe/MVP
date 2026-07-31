import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Note } from '../lib/fileSystem'
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

      createEmpty: () => {
  const now = Date.now()
  const note: Note = {
    id: crypto.randomUUID(),
    title: 'Senza titolo',
    content: '',
    createdAt: now,
    updatedAt: now,
  }
  set((s) => ({ list: [...s.list, note], currentId: note.id }))
  useEditorStore.getState().setCurrentText('')
  return note
},

      select(id: string) {
        set({ currentId: id })
        const note = get().list.find((n) => n.id === id)
        if (note) useEditorStore.getState().setCurrentText(note.content)
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
      deleteNote: (id: string) => {
  const { list, currentId } = get()
  const newList = list.filter((note) => note.id !== id)
  let newCurrentId = currentId
  if (currentId === id) {
    newCurrentId = newList[0]?.id ?? null
  }
  set({ list: newList, currentId: newCurrentId })
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
  useEditorStore.getState().setCurrentText(note.content)
},
    }),
    { name: 'notes_persistence' }
  )
)

// Selettori granulari
export const useNotesList = () => useNotesStore((s) => s.list)
export const useCurrentNote = () =>
  useNotesStore((s) => s.list.find((n) => n.id === s.currentId) ?? null)