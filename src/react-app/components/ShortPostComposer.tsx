import { useEffect, useMemo, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BarChart3, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { createPost, postKeys } from '../lib/posts'
import { richPostSchema, type RichPostFormValues } from '../lib/schemas'
import { Button } from './ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'

const MAX_BODY_LENGTH = 500
const EMPTY_IMAGES: File[] = []
const EMPTY_POLL_OPTIONS: RichPostFormValues['pollOptions'] = []

type ShortPostComposerProps = {
  open: boolean
  onClose: () => void
}

const defaultValues: RichPostFormValues = {
  body: '',
  images: [],
  pollEnabled: false,
  pollQuestion: '',
  pollOptions: [{ value: '' }, { value: '' }],
}

export function ShortPostComposer({ open, onClose }: ShortPostComposerProps) {
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const form = useForm<RichPostFormValues>({
    resolver: zodResolver(richPostSchema),
    defaultValues,
  })
  const body = useWatch({ control: form.control, name: 'body' }) ?? ''
  const images = useWatch({ control: form.control, name: 'images' }) ?? EMPTY_IMAGES
  const pollEnabled = useWatch({ control: form.control, name: 'pollEnabled' }) ?? false
  const pollOptions = useWatch({ control: form.control, name: 'pollOptions' }) ?? EMPTY_POLL_OPTIONS
  const imagePreviews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  )
  const publishMutation = useMutation({
    mutationFn: (values: RichPostFormValues) => {
      const enabledPollOptions = values.pollEnabled
        ? values.pollOptions.map((option) => option.value.trim()).filter(Boolean)
        : []

      if (values.images.length === 0 && !values.pollEnabled) {
        return createPost({ body: values.body })
      }

      const formData = new FormData()
      formData.append('body', values.body)
      for (const image of values.images) formData.append('images', image)
      if (values.pollEnabled) {
        formData.append('pollQuestion', values.pollQuestion)
        formData.append('pollOptions', JSON.stringify(enabledPollOptions))
      }
      return createPost(formData)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: postKeys.feed })
    },
  })

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => () => {
    for (const preview of imagePreviews) URL.revokeObjectURL(preview.url)
  }, [imagePreviews])

  const remaining = MAX_BODY_LENGTH - body.length
  const hasContent = body.trim().length > 0 || images.length > 0 || pollEnabled
  const isPublishDisabled = !hasContent || form.formState.isSubmitting

  async function handlePublish(values: RichPostFormValues) {
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
    form.reset(defaultValues)
    onClose()
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  function addPollOption() {
    if (pollOptions.length >= 4) return
    form.setValue('pollOptions', [...pollOptions, { value: '' }], { shouldValidate: true })
  }

  function removePollOption(index: number) {
    if (pollOptions.length <= 2) return
    form.setValue('pollOptions', pollOptions.filter((_, optionIndex) => optionIndex !== index), { shouldValidate: true })
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Short post composer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-none bg-card shadow-lg ring-1 ring-foreground/5">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">New Post</h2>
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
            <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Post</FormLabel>
                    <FormControl>
                      <Textarea
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
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p
                id="char-count"
                className={`text-right text-xs ${remaining < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {remaining} / {MAX_BODY_LENGTH}
              </p>

              <FormField
                control={form.control}
                name="images"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Photos</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-3">
                        <Input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={(event) => field.onChange(Array.from(event.target.files ?? []))}
                          disabled={form.formState.isSubmitting}
                        />
                        {imagePreviews.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {imagePreviews.map((preview) => (
                              <img
                                key={preview.url}
                                src={preview.url}
                                alt={preview.file.name}
                                className="aspect-square w-full rounded-md border object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-md border p-4">
                <FormField
                  control={form.control}
                  name="pollEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <FormLabel className="flex items-center gap-2">
                          <BarChart3 data-icon="inline-start" />
                          Poll
                        </FormLabel>
                        <p className="mt-1 text-sm text-muted-foreground">Add a single-choice poll with 2 to 4 options.</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={form.formState.isSubmitting} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {pollEnabled && (
                  <div className="mt-4 flex flex-col gap-4">
                    <FormField
                      control={form.control}
                      name="pollQuestion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Question</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Ask your subscribers something" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-col gap-3">
                      {pollOptions.map((_, index) => (
                        <FormField
                          key={index}
                          control={form.control}
                          name={`pollOptions.${index}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Option {index + 1}</FormLabel>
                              <div className="flex gap-2">
                                <FormControl>
                                  <Input {...field} placeholder={`Option ${index + 1}`} />
                                </FormControl>
                                {pollOptions.length > 2 && (
                                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removePollOption(index)} aria-label={`Remove option ${index + 1}`}>
                                    <Trash2 data-icon="inline-start" />
                                  </Button>
                                )}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={addPollOption} disabled={pollOptions.length >= 4}>
                      <Plus data-icon="inline-start" />
                      Add option
                    </Button>
                  </div>
                )}
              </div>

              {form.formState.errors.root?.message && (
                <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              )}
              {!hasContent && (
                <p role="alert" className="text-sm text-destructive">Post body cannot be empty unless you add images or a poll.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImagePlus data-icon="inline-start" />
                Photos and polls are visible to entitled members only.
              </div>
              <div className="flex justify-end gap-3">
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
            </div>
          </form>
        </Form>
      </div>
    </div>
  )
}
