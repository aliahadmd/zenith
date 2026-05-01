import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { X, Loader2 } from 'lucide-react'
import { apiPost } from '../lib/api'
import { Button } from './ui/button'

const MAX_BODY_LENGTH = 500

type ShortPostComposerProps = {
  open: boolean
  onClose: () => void
}

export function ShortPostComposer({ open, onClose }: ShortPostComposerProps) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset body when modal opens; focus textarea
  useEffect(() => {
    if (open) {
      setBody('')
      setIsSubmitting(false)
      // Defer focus so the element is visible first
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [open])

  const remaining = MAX_BODY_LENGTH - body.length
  const isBodyEmpty = body.length === 0
  const isBodyTooLong = body.length > MAX_BODY_LENGTH
  const isPublishDisabled = isBodyEmpty || isBodyTooLong || isSubmitting

  const showValidationMessage = isBodyEmpty
    ? 'Post body cannot be empty.'
    : isBodyTooLong
      ? `Post body must be ${MAX_BODY_LENGTH} characters or fewer.`
      : null

  async function handlePublish() {
    if (isPublishDisabled) return

    setIsSubmitting(true)
    const { error } = await apiPost('/api/posts', { body })
    setIsSubmitting(false)

    if (error) {
      toast.error(error)
      return
    }

    toast.success('Post published!')
    onClose()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    // Only close when clicking the backdrop itself, not the modal content
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!open) return null

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Short post composer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-lg rounded-none bg-card shadow-lg ring-1 ring-foreground/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading text-base font-semibold uppercase tracking-wider">
            New Short Post
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close composer"
          >
            <X />
          </Button>
        </div>

        {/* Body */}
        <div className="space-y-3 px-6 py-5">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_BODY_LENGTH}
            placeholder="What's on your mind?"
            rows={5}
            aria-label="Post body"
            aria-describedby="char-count"
            className="w-full resize-none rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            disabled={isSubmitting}
          />

          {/* Character count */}
          <p
            id="char-count"
            className={`text-right text-xs ${isBodyTooLong ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {remaining} / {MAX_BODY_LENGTH}
          </p>

          {/* Validation message */}
          {showValidationMessage && (
            <p role="alert" className="text-xs text-destructive">
              {showValidationMessage}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={isPublishDisabled}
            aria-disabled={isPublishDisabled}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Publishing…
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
