import { useEffect, useId, useMemo, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BarChart3, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { createPost, postKeys } from '../lib/posts'
import { richPostSchema, type RichPostFormValues } from '../lib/schemas'
import { cn } from '../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
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
  const { currentUser } = useAuth()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputId = useId()
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
  const displayName = currentUser?.displayName ?? 'Creator'
  const username = currentUser?.username ?? 'creator'
  const avatarFallback = displayName.slice(0, 2).toUpperCase()

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

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) handleClose()
  }

  function addPollOption() {
    if (pollOptions.length >= 4) return
    form.setValue('pollOptions', [...pollOptions, { value: '' }], { shouldValidate: true })
  }

  function removePollOption(index: number) {
    if (pollOptions.length <= 2) return
    form.setValue('pollOptions', pollOptions.filter((_, optionIndex) => optionIndex !== index), { shouldValidate: true })
  }

  function removeImage(index: number) {
    form.setValue('images', images.filter((_, imageIndex) => imageIndex !== index), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-label="Short post composer"
        className="max-h-[90vh] max-w-2xl gap-0 overflow-hidden rounded-2xl border bg-background p-0 shadow-2xl sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="font-sans text-base font-semibold">Short post composer</DialogTitle>
              <DialogDescription>Publish a private update for entitled members.</DialogDescription>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close composer">
              <X data-icon="inline-start" />
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-4rem)] overflow-y-auto">
          <div className="border-b px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={currentUser?.avatarUrl ?? undefined} alt={displayName} />
                <AvatarFallback className="text-sm font-semibold">{avatarFallback}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight">{displayName}</p>
                <p className="text-sm text-muted-foreground">@{username}</p>
              </div>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handlePublish)} noValidate>
              <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
                <FormField
                  control={form.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Post body</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          ref={(node) => {
                            field.ref(node)
                            textareaRef.current = node
                          }}
                          maxLength={MAX_BODY_LENGTH}
                          placeholder="Share an update, preview, lesson note, or behind-the-scenes thought."
                          rows={6}
                          aria-label="Post body"
                          aria-describedby="char-count"
                          disabled={form.formState.isSubmitting}
                          className="min-h-36 rounded-none border-0 bg-transparent px-0 py-0 text-[17px] leading-7 shadow-none focus-visible:ring-0"
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="images"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Photos</FormLabel>
                      <FormControl>
                        <Input
                          id={imageInputId}
                          className="sr-only"
                          type="file"
                          aria-label="Upload photos"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={(event) => field.onChange(Array.from(event.target.files ?? []))}
                          disabled={form.formState.isSubmitting}
                        />
                      </FormControl>
                      {imagePreviews.length > 0 && (
                        <div className={cn('grid overflow-hidden rounded-xl border', imagePreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                          {imagePreviews.map((preview, index) => (
                            <div key={preview.url} className="relative">
                              <img
                                src={preview.url}
                                alt={preview.file.name}
                                className="aspect-video w-full border-border object-cover not-last:border-r"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon-sm"
                                className="absolute right-2 top-2 shadow-sm"
                                onClick={() => removeImage(index)}
                                aria-label={`Remove ${preview.file.name}`}
                              >
                                <X data-icon="inline-start" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <div className="rounded-xl border bg-card/30 p-4">
                  <FormField
                    control={form.control}
                    name="pollEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <FormLabel className="flex items-center gap-2 text-sm font-semibold">
                            <BarChart3 data-icon="inline-start" />
                            Add poll
                          </FormLabel>
                          <p className="mt-1 text-sm text-muted-foreground">Single-choice poll, 2 to 4 options.</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={form.formState.isSubmitting} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {pollEnabled && (
                    <div className="mt-4 flex flex-col gap-4 border-t pt-4">
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

                      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addPollOption} disabled={pollOptions.length >= 4}>
                        <Plus data-icon="inline-start" />
                        {pollOptions.length >= 4 ? 'Maximum options' : 'Add option'}
                      </Button>
                    </div>
                  )}
                </div>

                {form.formState.errors.root?.message && (
                  <p role="alert" className="text-xs text-destructive">{form.formState.errors.root.message}</p>
                )}
              </div>

              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-2.5"
                    onClick={() => document.getElementById(imageInputId)?.click()}
                  >
                    <ImagePlus data-icon="inline-start" />
                    {images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'}` : 'Photo'}
                  </Button>
                  <p
                    id="char-count"
                    className={cn('text-xs', remaining < 0 ? 'text-destructive' : 'text-muted-foreground')}
                  >
                    {remaining} / {MAX_BODY_LENGTH}
                  </p>
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
                        Publishing
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
      </DialogContent>
    </Dialog>
  )
}
