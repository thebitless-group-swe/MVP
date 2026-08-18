import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { remarkUnderline } from '@/lib/remarkUnderline'
import { cn } from '@/lib/utils'

/**
 * Pipeline Markdown condivisa da Preview e dalle anteprime delle modali AI.
 * Nessun HTML raw è abilitato.
 */
export function MarkdownView({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkUnderline]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export default MarkdownView
