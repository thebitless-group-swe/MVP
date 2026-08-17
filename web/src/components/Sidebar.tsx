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
  // UC74.3: la creazione e' in due tempi — prima il sistema chiede il titolo,
  // poi la nota nasce. `creating` e' la fase intermedia, che prima non esisteva.
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // UC80.1 passo 3: anche la rimozione e' in due tempi, e questo e' quello di
  // mezzo. Tiene l'id della nota per cui e' stata chiesta conferma, non un
  // booleano: altrimenti aprendo la conferma su una riga resterebbe aperta
  // anche sulle altre.
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

  /**
   * Crea una nota col titolo dato, con il percorso d'errore che R-84-F-Ob
   * (UC75) richiede. Restituisce `false` se la creazione non e' riuscita.
   *
   * Era l'unica delle tre operazioni della sidebar a non averne uno: `apri` e
   * `salva` qui sopra lo hanno gia'. Riusa lo stesso `fileError` e lo stesso
   * `role="alert"`, deliberatamente: un secondo canale d'errore per la stessa
   * barra sarebbe due meccanismi da mantenere per un solo comportamento.
   *
   * UC75 chiede di informare l'utente **e** di preservare lo stato precedente:
   * la prima parte e' il messaggio, la seconda vale perche' `createEmpty`
   * genera l'id prima di mutare qualsiasi cosa (vedi `store/notes.ts`).
   *
   * L'esito torna al chiamante invece di fermarsi qui perche' con UC74.3 la
   * creazione e' in due tempi: e' `commitCreate` a sapere che c'e' un campo
   * titolo aperto, e a doverlo lasciare aperto se la nota non e' nata.
   */
  function handleCreate(title: string): boolean {
    setFileError(null)
    try {
      createEmpty(title)
      return true
    } catch {
      // R-110-F-Ob: causa e azione correttiva, nessun dettaglio tecnico.
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
   * Annulla la richiesta del titolo. Non crea nulla: la nota non deve esistere
   * se l'utente non conferma.
   *
   * Non e' agganciato a `onBlur`, al contrario della rinomina qui sotto. La
   * differenza e' voluta e viene da UC74.3, che di uscite ne prevede due —
   * «l'utente inserisce il titolo e conferma» — mentre il blur non e' nessuna
   * delle due: interpretarlo come conferma farebbe nascere note che nessuno ha
   * chiesto, interpretarlo come annullamento butterebbe via in silenzio quello
   * che l'utente ha appena scritto. Il campo resta aperto finche' non decide.
   */
  function cancelCreate() {
    setCreating(false)
    setNewTitle('')
  }

  /**
   * Conferma la creazione. Il campo si chiude **solo se la nota e' nata**.
   *
   * Se `handleCreate` fallisce, `creating` resta acceso e `newTitle` intatto:
   * l'avviso compare nella barra e il titolo appena scritto e' ancora li',
   * pronto per un secondo tentativo. Chiudere il campo scarterebbe quello che
   * l'utente ha digitato proprio nel momento in cui gli si chiede di riprovare,
   * ed e' l'opposto del «preservare lo stato precedente» di UC75.
   */
  function commitCreate() {
    if (!handleCreate(newTitle)) return
    setCreating(false)
    setNewTitle('')
  }

  /**
   * Elimina una nota, con il percorso d'errore che R-93-F-De (UC81) richiede.
   *
   * La conferma e' gia' avvenuta quando si arriva qui: UC80.1 la colloca al
   * passo 3, prima dell'azione, e non come annullamento successivo.
   */
  function confirmDelete(id: string) {
    setFileError(null)
    try {
      deleteNote(id)
    } catch {
      // R-110-F-Ob: causa e azione correttiva, nessun dettaglio tecnico.
      // UC81 chiede anche che la nota NON risulti eliminata: se ne occupa
      // `deleteNote`, che ripristina prima di rilanciare.
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
          Second Brain
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
                    /*
                     * Due comandi affiancati, non annidati: il cestino non puo'
                     * stare dentro il pulsante della nota, perche' un `button`
                     * dentro un `button` non e' marcatura valida e le tecnologie
                     * assistive non saprebbero quale dei due sta per essere
                     * attivato.
                     */
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
