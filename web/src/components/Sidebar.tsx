import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, FolderOpen, Plus, Save, Trash2 } from 'lucide-react'

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
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  // Fase intermedia della creazione in due tempi (UC74.3)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // Tiene l'id e non un booleano, altrimenti la conferma aperta su una riga
  // resterebbe aperta anche sulle altre (UC80.1 passo 3)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleOpenFile() {

    setFileError(null)
    try{
      const note = await openNoteFromFile()
      if (!note) return
      loadNote(note)
    } catch (err) {
      if (err != null && (err as { name?: string }).name === 'AbortError') return
      setFileError("Impossibile aprire il file. Riprova.")
    }
  }

  async function handleSaveFile() {
    if (!currentNote) return
    setFileError(null)
    try {
      const content = useEditorStore.getState().currentText
      await saveNoteToFile({ ...currentNote, content })
    } catch (err) {
      if (err != null && (err as { name?: string }).name === 'AbortError') return
      setFileError("Impossibile salvare il file. Riprova.")
    }
  }

  /** Crea una nota, torna false se non c'e' riuscita (R-84-F-Ob, UC75). */
  function handleCreate(title: string): boolean {
    setFileError(null)
    try {
      createEmpty(title)
      return true
    } catch {
      setFileError('Impossibile creare la nota. Riprova.')
      return false
    }
  }

  function handleSelect(id: string) {
    select(id)
  }

  function startCreate() {
    setNewTitle('')
    setCreating(true)
  }

  /**
   * Annulla la richiesta del titolo.
   *
   * NON agganciatelo a onBlur, al contrario della rinomina qui sotto. Come
   * conferma farebbe nascere note che nessuno ha chiesto, come annullamento
   * butterebbe via quello che l'utente ha appena scritto.
   */
  function cancelCreate() {
    setCreating(false)
    setNewTitle('')
  }

  /**
   * Conferma la creazione, il campo si chiude solo se la nota e' nata.
   *
   * Se fallisce, titolo e campo restano com'erano: chiuderlo scarterebbe quello
   * che l'utente ha scritto proprio mentre gli si chiede di riprovare (UC75).
   */
  function commitCreate() {
    if (!handleCreate(newTitle)) return
    setCreating(false)
    setNewTitle('')
  }

  /** Elimina una nota, la conferma e' gia' avvenuta (R-93-F-De, UC81). */
  function confirmDelete(id: string) {
    setFileError(null)
    try {
      deleteNote(id)
    } catch {
      // Che la nota non risulti eliminata se ne occupa deleteNote (UC81)
      setFileError('Impossibile eliminare la nota. Riprova.')
    }
    setDeletingId(null)
  }

  function startRename(note: { id: string; title: string }) {
    setEditingId(note.id)
    setEditingTitle(note.title)
  }

  async function commitRename(note: Parameters<typeof renameNote>[0]) {
    try{
      const renamed = await renameNote(note, editingTitle)
      if (currentId === note.id) {
        updateCurrent({ title: renamed.title })
      } else {
        loadNote({ ...note, title: renamed.title, updatedAt: renamed.updatedAt })
      }
      setEditingId(null)
    } catch (err) {
      if (err != null && (err as { name?: string }).name === 'AbortError') return
      setFileError("Impossibile rinominare la nota. Riprova.")
      setEditingId(null)
    }
  }

 if (collapsed) {
    return (
      <aside
        aria-label="Navigazione principale"
        className="flex h-full w-12 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-4"
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
      className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
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
        {creating ? (
          <div className="flex flex-col gap-1">
            <input
              autoFocus
              aria-label="Titolo della nuova nota"
              placeholder="Titolo della nota…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitCreate()
                if (e.key === 'Escape') cancelCreate()
              }}
              className={cn(
                'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            />
            <p className="px-1 text-xs text-muted-foreground">
              Invio per creare · Esc per annullare
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={startCreate}
            className={cn(actionButton, 'bg-primary text-primary-foreground hover:bg-primary/90')}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Nuova nota</span>
          </button>
        )}
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

      {fileError && (
        <p role="alert" className="px-4 py-2 text-xs text-destructive">
          {fileError}
        </p>
      )}

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
                  ) : deletingId === note.id ? (
                    <div
                      className="flex flex-col gap-1 rounded-md border border-destructive/40 px-3 py-2"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setDeletingId(null)
                      }}
                    >
                      <p className="text-xs text-foreground">
                        Eliminare «{note.title || 'Senza titolo'}»?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          autoFocus
                          onClick={() => confirmDelete(note.id)}
                          className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Sì, elimina
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="rounded-md px-2 py-1 text-xs text-foreground/80 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Affiancati e non annidati, un button dentro un button
                       non e' marcatura valida */
                    <div
                      className={cn(
                        'flex items-center rounded-md transition-colors',
                        'text-foreground/80 hover:bg-muted hover:text-foreground',
                        active && 'bg-muted font-medium text-foreground',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(note.id)}
                        onDoubleClick={() => startRename(note)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <FileText className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{note.title || 'Senza titolo'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(note.id)}
                        aria-label={`Elimina «${note.title || 'Senza titolo'}»`}
                        className="mr-1 shrink-0 rounded-md p-1.5 text-foreground/60 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
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
