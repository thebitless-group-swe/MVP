import { useEditorStore, useViewMode } from '@/store/useEditorStore'
import { Button } from '@/components/ui/button'

export function ViewToggle() {
  const viewMode = useViewMode()
  const setViewMode = useEditorStore((state) => state.setViewMode)

  return (
    <div className="flex items-center gap-1 rounded-md bg-muted p-1">
      <Button
        variant={viewMode === 'editor' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setViewMode('editor')}
      >
        Editor
      </Button>
      <Button
        variant={viewMode === 'split' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setViewMode('split')}
      >
        Diviso
      </Button>
      <Button
        variant={viewMode === 'render' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setViewMode('render')}
      >
        Render
      </Button>
    </div>
  )
}