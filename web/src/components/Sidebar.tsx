import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, FolderOpen, Plus, Save } from 'lucide-react'

import { cn } from '@/lib/utils'
import { openNoteFromFile, renameNote, saveNoteToFile } from '@/lib/fileSystem'
import { useCurrentNote, useNotesList, useNotesStore } from '@/store/notes'
import { useEditorStore } from '@/store/useEditorStore'

const actionButton = cn(
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
)

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const notes = useNotesList()
  const currentNote = useCurrentNote()
  const currentId = useNotesStore((s) => s.currentId)
  const select = useNotesStore((s) => s.select)
  const createEmpty = useNotesStore((s) => s.createEmpty)
  const loadNote = useNotesStore((s) => s.loadNote)
  const updateCurrent = useNotesStore((s) => s.updateCurrent)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  async function handleOpenFile() {
    const note = await openNoteFromFile()
    if (!note) return
    loadNote(note)
    useEditorStore.getState().setCurrentText(note.content)
  }

  async function handleSaveFile() {
    if (!currentNote) return
    const content = useEditorStore.getState().currentText
    await saveNoteToFile({ ...currentNote, content })
  }

  function handleSelect(id: string) {
    select(id)
    const note = useNotesStore.getState().list.find((n) => n.id === id)
    if (note) useEditorStore.getState().setCurrentText(note.content)
  }

  function startRename(note: { id: string; title: string }) {
    setEditingId(note.id)
    setEditingTitle(note.title)
  }

  async function commitRename(note: Parameters<typeof renameNote>[0]) {
    const renamed = await renameNote(note, editingTitle)
    if (currentId === note.id) {
      updateCurrent({ title: renamed.title })
    } else {
      loadNote({ ...note, title: renamed.title, updatedAt: renamed.updatedAt })
    }
    setEditingId(null)
  }

 if (collapsed) {
    return (
      <aside
        aria-label="Navigazione principale"
        className="flex h-full w-12 shrink-0 flex-col items-center border-r border-border bg-card py-4"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Apri barra laterale"
          className="flex items-center justify-center rounded-md p-2 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Navigazione principale"
      className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card"
    >
      <div className="flex items-center justify-between px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          My Workspace
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Chiudi barra laterale"
          className="rounded-md p-1 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-1 px-2">
        <button
          type="button"
          onClick={createEmpty}
          className={cn(actionButton, 'bg-primary text-primary-foreground hover:bg-primary/90')}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Nuova nota</span>
        </button>
        <button
          type="button"
          onClick={handleOpenFile}
          className={cn(actionButton, 'text-foreground/80 hover:bg-muted hover:text-foreground')}
        >
          <FolderOpen className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Apri file…</span>
        </button>
        <button
          type="button"
          onClick={handleSaveFile}
          disabled={!currentNote}
          aria-disabled={!currentNote}
          className={cn(
            actionButton,
            'text-foreground/80 hover:bg-muted hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground/80',
          )}
        >
          <Save className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Salva file</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Note">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tutte le note
        </p>
        {notes.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">Nessuna nota</p>
        ) : (
          <ul className="space-y-1">
            {notes.map((note) => {
              const active = note.id === currentId
              return (
                <li key={note.id}>
                  {editingId === note.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => commitRename(note)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(note)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className={cn(
                        'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelect(note.id)}
                      onDoubleClick={() => startRename(note)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        'text-foreground/80 hover:bg-muted hover:text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active && 'bg-muted font-medium text-foreground',
                      )}
                    >
                      <FileText className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{note.title || 'Senza titolo'}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </nav>
    </aside>
  )
}

export default Sidebar
