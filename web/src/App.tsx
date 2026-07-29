import { Editor } from '@/components/Editor'
import { EditorToolbar } from '@/components/EditorToolbar'
import { GenerateModal } from '@/components/GenerateModal'
import { Preview } from '@/components/Preview'
import { Sidebar } from '@/components/Sidebar'
import { SummarizeModal } from '@/components/SummarizeModal'
import { TopBar } from '@/components/TopBar'
import { ViewToggle } from '@/components/ViewToggle'
import { useViewMode } from '@/store/useEditorStore'

export default function App() {
  const viewMode = useViewMode()
  const showEditor = viewMode === 'editor' || viewMode === 'split'
  const showPreview = viewMode === 'render' || viewMode === 'split'

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        {/*
          Barra dedicata alla vista (Editor / Split / Render): separata dalle
          azioni AI della TopBar e sempre visibile in ogni modalità, così è
          possibile tornare a Editor/Split anche da "render".
        */}
        <div className="flex items-center justify-end border-b border-border bg-background px-4 py-2">
          <ViewToggle />
        </div>

        {/*
          Layout in base alla vista selezionata (ViewToggle nella TopBar):
          - split:        griglia responsive Editor | Preview
          - editor/render: pannello singolo a tutta larghezza
        */}
        <main
          className={
            viewMode === 'split'
              ? 'grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2'
              : 'flex min-h-0 flex-1 flex-col'
          }
        >
          {showEditor && (
            <section
              className={
                viewMode === 'split'
                  ? 'flex min-w-0 flex-col overflow-hidden border-b border-border md:border-b-0 md:border-r'
                  : 'flex min-w-0 flex-1 flex-col overflow-hidden'
              }
            >
              <EditorToolbar />
              <div className="min-h-0 flex-1 overflow-auto">
                <Editor />
              </div>
            </section>
          )}

          {showPreview && (
            <section
              className={
                viewMode === 'split'
                  ? 'min-w-0 overflow-auto'
                  : 'min-w-0 flex-1 overflow-auto'
              }
            >
              <Preview />
            </section>
          )}
        </main>
      </div>

      <SummarizeModal />
      <GenerateModal />
    </div>
  )
}
