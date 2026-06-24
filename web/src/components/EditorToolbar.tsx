import {
  Bold,
  Code,
  Heading,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Save,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { useEditorStore } from '@/store/useEditorStore'
import {
  cycleHeadingCommand,
  insertImageCommand,
  toggleBoldCommand,
  toggleInlineCodeCommand,
  toggleItalicCommand,
  toggleLinkCommand,
  toggleListCommand,
  toggleOrderedListCommand,
} from '@/lib/editorCommands'

type FormatTool = {
  label: string
  icon: typeof Bold
}

const formatTools: FormatTool[] = [
  { label: 'Grassetto', icon: Bold },
  { label: 'Corsivo', icon: Italic },
  { label: 'Titolo', icon: Heading },
  { label: 'Link', icon: Link },
  { label: 'Immagine', icon: Image },
  { label: 'Codice', icon: Code },
]

type ToolLabel = (typeof formatTools)[number]['label']

export function EditorToolbar() {
  const handleAction = (label: ToolLabel) => {
    const view = useEditorStore.getState().editorView
    if (!view) return

    switch (label) {
      case 'Grassetto':
        toggleBoldCommand(view)
        break
      case 'Corsivo':
        toggleItalicCommand(view)
        break
      case 'Titolo':
        cycleHeadingCommand(view)
        break
      case 'Link':
        toggleLinkCommand(view)
        break
      case 'Immagine':
        insertImageCommand(view)
        break
      case 'Codice':
        toggleInlineCodeCommand(view)
        break
      default:
        break
    }
  }

  const handleList = (ordered: boolean) => {
    const view = useEditorStore.getState().editorView
    if (!view) return
    if (ordered) {
      toggleOrderedListCommand(view)
    } else {
      toggleListCommand(view)
    }
  }

  return (
    <div
      role="toolbar"
      aria-label="Formattazione editor"
      className="flex flex-wrap items-center gap-1 border-b border-border bg-background px-2 py-2"
    >
      <div className="flex flex-wrap items-center gap-1">
        {formatTools.map(({ label, icon: Icon }) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            title={label}
            onClick={() => handleAction(label)}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Elenco"
              title="Elenco"
            >
              <List aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              className="z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md"
            >
              <DropdownMenu.Item
                onSelect={() => handleList(false)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground outline-none data-[highlighted]:bg-muted"
              >
                <List className="size-4" aria-hidden="true" />
                Elenco puntato
              </DropdownMenu.Item>
             <DropdownMenu.Item
                onSelect={() => handleList(true)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground outline-none data-[highlighted]:bg-muted"
              >
                <ListOrdered className="size-4" aria-hidden="true" />
                Elenco numerato
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label="Salva nota"
        >
          <Save aria-hidden="true" />
          Salva
        </Button>
      </div>
    </div>
  )
}

export default EditorToolbar
