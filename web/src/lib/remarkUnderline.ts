import type { Parent, PhrasingContent, Root, Text } from 'mdast'
import { visit } from 'unist-util-visit'

const UNDERLINE_PATTERN = /\+\+([^+]+)\+\+/g

/**
 * Trasforma `++testo++` in un nodo reso come `<u>`.
 *
 * Il tag si dichiara con `data.hName`, cosi' non serve abilitare l'HTML raw
 * nella pipeline.
 */
export function remarkUnderline() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || index === undefined) return

      const children: PhrasingContent[] = []
      let cursor = 0
      for (const match of node.value.matchAll(UNDERLINE_PATTERN)) {
        const start = match.index
        if (start > cursor) {
          children.push({ type: 'text', value: node.value.slice(cursor, start) })
        }
        children.push({
          type: 'emphasis',
          children: [{ type: 'text', value: match[1] }],
          data: { hName: 'u' },
        })
        cursor = start + match[0].length
      }
      if (children.length === 0) return

      if (cursor < node.value.length) {
        children.push({ type: 'text', value: node.value.slice(cursor) })
      }
      parent.children.splice(index, 1, ...children)
    })
  }
}
