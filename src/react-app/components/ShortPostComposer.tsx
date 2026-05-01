import { useEffect, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { X, Loader2 } from 'lucide-react'
import { apiPostRequired } from '../lib/api'
import { shortPostSchema } from '../lib/schemas'
import { Button } from './ui/button'
import { Form, FormControl, FormField, FormItem, FormMessage } from './ui/form'

const MAX_BODY_LENGTH = 500
type ShortPostValues = z.infer<typeof shortPostSchema>

type ShortPostComposerProps = {
  open: boolean
  onClose: () => void
}

export function ShortPostComposer({ open, onClose }: ShortPostComposerProps) {
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const form = useForm<ShortPostValues>({
    resolver: zodResolver(shortPostSchema),
    defaultValues: { body: '' },
  })
  const body = useWatch({ control: form.control, name: 'body' }) ?? ''
  const publishMutation = useMutation({
    mutationFn: (values: ShortPostValues) => apiPostRequired('/api/posts', values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  // Focus textarea when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [open])

  const remaining = MAX_BODY_LENGTH - body.length
  const isBodyEmpty = body.length === 0
  const isBodyTooLong = body.length > MAX_BODY_LENGTH
  const isPublishDisabled = isBodyEmpty || isBodyTooLong || form.formState.isSubmitting

  const showValidationMessage = isBodyEmpty
    ? 'Post body cannot be empty.'
    : isBodyTooLong
      ? `Post body must be ${MAX_BODY_LENGTH} characters or fewer.`
      : null

  async function handlePublish(values: ShortPostValues) {
    try {
      await publishMutation.mutateAsync(values)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Post failed.')
      return
    }

    toast.success('Post published!')
    handleClose()
  }

  function handleClose() {
    form.reset()
    onClose()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    // Only close when clicking the backdrop itself, not the modal content
    if (e.target === e.currentTarget) {
      handleClose()
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
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">
            New Short Post
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClose}
            aria-label="Close composer"
          >
            <X data-icon="inline-start" />
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handlePublish)} noValidate>
            {/* Body */}
            <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <textarea
                        {...field}
                        ref={(node) => {
                          field.ref(node)
                          textareaRef.current = node
                        }}
                        maxLength={MAX_BODY_LENGTH}
                        placeholder="What's on your mind?"
                        rows={5}
                        aria-label="Post body"
                        aria-describedby="char-count"
                        className="w-full resize-none rounded-none border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
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
            <div className="flex justify-end gap-3 border-t border-border px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={form.formState.isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPublishDisabled}
                aria-disabled={isPublishDisabled}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Publishing…
                  </>
                ) : (
                  'Publish'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
