import {
  Bold,
  Code,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Strikethrough,
  Type,
  Underline,
} from 'lucide-react'
import { DropdownMenu } from 'radix-ui'

import { Button } from '@/components/ui/button'
import { useEditorStore } from '@/store/useEditorStore'
import {
  insertImageCommand,
  setHeadingCommand,
  toggleBoldCommand,
  toggleInlineCodeCommand,
  toggleItalicCommand,
  toggleLinkCommand,
  toggleListCommand,
  toggleOrderedListCommand,
  toggleStrikethroughCommand,
  toggleUnderlineCommand,
  type HeadingLevel,
} from '@/lib/editorCommands'

type FormatTool = {
  label: string
  icon: typeof Bold
}

const formatTools: FormatTool[] = [
  { label: 'Grassetto', icon: Bold },
  { label: 'Corsivo', icon: Italic },
  { label: 'Sottolineato', icon: Underline },
  { label: 'Barrato', icon: Strikethrough },
  { label: 'Link', icon: Link },
  { label: 'Immagine', icon: Image },
  { label: 'Codice', icon: Code },
]

type ToolLabel = (typeof formatTools)[number]['label']

const headingOptions: {
  label: string
  level: HeadingLevel
  icon: typeof Bold
}[] = [
  { label: 'Titolo', level: 1, icon: Heading1 },
  { label: 'Sottotitolo', level: 2, icon: Heading2 },
  { label: 'Titolo di terzo livello', level: 3, icon: Heading3 },
  { label: 'Normale', level: 0, icon: Type },
]

const menuItemClass =
  'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground outline-none data-[highlighted]:bg-muted'

const menuContentClass =
  'z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md'

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
      case 'Sottolineato':
        toggleUnderlineCommand(view)
        break
      case 'Barrato':
        toggleStrikethroughCommand(view)
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

  const handleHeading = (level: HeadingLevel) => {
    const view = useEditorStore.getState().editorView
    if (!view) return
    setHeadingCommand(view, level)
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
              aria-label="Titolo"
              title="Titolo"
            >
              <Heading aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" className={menuContentClass}>
              {headingOptions.map(({ label, level, icon: Icon }) => (
                <DropdownMenu.Item
                  key={label}
                  onSelect={() => handleHeading(level)}
                  className={menuItemClass}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

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
            <DropdownMenu.Content align="start" className={menuContentClass}>
              <DropdownMenu.Item
                onSelect={() => handleList(false)}
                className={menuItemClass}
              >
                <List className="size-4" aria-hidden="true" />
                Elenco puntato
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => handleList(true)}
                className={menuItemClass}
              >
                <ListOrdered className="size-4" aria-hidden="true" />
                Elenco numerato
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  )
}

export default EditorToolbar
