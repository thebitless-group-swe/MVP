import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

import { useCurrentText } from '@/store/useEditorStore'

export function Preview() {
  const currentText = useCurrentText()

  return (
    <div className="prose dark:prose-invert max-w-none p-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {currentText}
      </ReactMarkdown>
    </div>
  )
}
