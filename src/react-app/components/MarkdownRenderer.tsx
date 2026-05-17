import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { cn } from '../lib/utils'

type MarkdownRendererProps = {
  markdown: string
  className?: string
}

export function MarkdownRenderer({ markdown, className }: MarkdownRendererProps) {
  return (
    <div className={cn('markdown-body text-[15px] leading-7 text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => <h1 className="mb-4 mt-6 text-2xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 text-xl font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-lg font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-4">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} className="text-primary hover:underline" rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="mb-4 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-4 border-l-2 border-primary/50 pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="mb-4 overflow-x-auto rounded-lg border bg-card p-4 text-sm">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-2">{children}</td>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
