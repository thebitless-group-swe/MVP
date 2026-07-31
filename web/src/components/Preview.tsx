import { MarkdownView } from '@/components/MarkdownView'
import { useCurrentText } from '@/store/useEditorStore'

export function Preview() {
  const currentText = useCurrentText()

  return <MarkdownView className="p-4">{currentText}</MarkdownView>
}
