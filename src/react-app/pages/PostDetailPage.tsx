import { useId, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Heart, ImagePlus, Loader2, MessageCircle, Reply, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { LoadingBlock } from '../components/LoadingBlock'
import { PostCard } from '../components/PostCard'
import {
  createReply,
  likeReply,
  postDetailQueryOptions,
  postKeys,
  type FeedPost,
  type PostReply,
  unlikeReply,
} from '../lib/posts'
import { replySchema, type ReplyFormValues } from '../lib/schemas'
import { cn } from '../lib/utils'

type PostDetailPageProps = {
  username: string
  slug: string
}

const defaultReplyValues: ReplyFormValues = {
  body: '',
  images: [],
}

export function PostDetailPage({ username, slug }: PostDetailPageProps) {
  const detailQuery = useQuery(postDetailQueryOptions(username, slug))

  if (detailQuery.isPending) {
    return <LoadingBlock label="Loading post" />
  }

  if (detailQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load post</p>
        <p className="text-sm">{detailQuery.error.message}</p>
      </div>
    )
  }

  const { post, replies } = detailQuery.data

  return (
    <div className="mx-auto min-h-screen max-w-[640px] border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Post</h1>
          <p className="text-sm text-muted-foreground">
            {post.replyCount === 1 ? '1 reply' : `${post.replyCount} replies`}
          </p>
        </div>
      </header>
      <PostCard post={post} showReplyAction={false} />
      <ReplyComposer post={post} detailKey={postKeys.detail(username, slug)} />
      <ReplyThread post={post} replies={replies} detailKey={postKeys.detail(username, slug)} />
    </div>
  )
}

export function ReplyComposer({
  post,
  parentReply,
  detailKey,
  onCancel,
}: {
  post: FeedPost
  parentReply?: PostReply
  detailKey: readonly unknown[]
  onCancel?: () => void
}) {
  const queryClient = useQueryClient()
  const imageInputId = useId()
  const form = useForm<ReplyFormValues>({
    resolver: zodResolver(replySchema),
    defaultValues: defaultReplyValues,
  })
  const body = useWatch({ control: form.control, name: 'body' }) ?? ''
  const images = useWatch({ control: form.control, name: 'images' }) ?? []
  const mentionUsername = parentReply?.author.username ?? post.author.username
  const replyMutation = useMutation({
    mutationFn: (values: ReplyFormValues) => {
      if (values.images.length === 0) {
        return createReply(post.id, {
          body: values.body,
          ...(parentReply ? { parentReplyId: parentReply.id } : {}),
        })
      }

      const formData = new FormData()
      formData.append('body', values.body)
      if (parentReply) formData.append('parentReplyId', parentReply.id)
      for (const image of values.images) formData.append('images', image)
      return createReply(post.id, formData)
    },
    onSuccess: async () => {
      form.reset(defaultReplyValues)
      onCancel?.()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to post reply.'),
  })

  return (
    <section className={cn('border-b bg-background px-5 py-4', parentReply && 'bg-card/20')}>
      <Form {...form}>
        <form className="flex gap-3" onSubmit={form.handleSubmit((values) => replyMutation.mutate(values))} noValidate>
          <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
            <MessageCircle className="size-4" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  Replying to <span className="text-primary">@{mentionUsername}</span>
                </p>
                <p className="text-xs text-muted-foreground">Only entitled members can join this conversation.</p>
              </div>
              {onCancel && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel reply">
                  <X data-icon="inline-start" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Reply</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        maxLength={500}
                        placeholder={`Reply to @${mentionUsername}`}
                        className="min-h-20 rounded-2xl border-border bg-card/50 text-[15px]"
                      />
                    </FormControl>
                    <FormMessage />
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
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={(event) => field.onChange(Array.from(event.target.files ?? []))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button asChild variant="ghost" size="sm" className="rounded-full px-2.5">
                    <label htmlFor={imageInputId}>
                      <ImagePlus data-icon="inline-start" />
                      {images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'}` : 'Photo'}
                    </label>
                  </Button>
                  <p className="text-xs text-muted-foreground">{500 - body.length} left</p>
                </div>
                <Button type="submit" size="sm" className="rounded-full" disabled={replyMutation.isPending}>
                  {replyMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                      Replying
                    </>
                  ) : (
                    <>
                      <MessageCircle data-icon="inline-start" />
                      Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </section>
  )
}

export function ReplyThread({
  post,
  replies,
  detailKey,
}: {
  post: FeedPost
  replies: PostReply[]
  detailKey: readonly unknown[]
}) {
  const childrenByParentId = useMemo(() => {
    const map = new Map<string | null, PostReply[]>()
    for (const reply of replies) {
      const key = reply.parentReplyId ?? null
      map.set(key, [...(map.get(key) ?? []), reply])
    }
    return map
  }, [replies])

  const rootReplies = childrenByParentId.get(null) ?? []

  if (rootReplies.length === 0) {
    return (
      <section className="border-b px-5 py-10 text-center text-muted-foreground">
        <p className="font-medium text-foreground">No replies yet</p>
        <p className="mt-1 text-sm">Start the conversation with @{post.author.username}.</p>
      </section>
    )
  }

  return (
    <section aria-label="Replies">
      {rootReplies.map((reply) => (
        <ReplyItem
          key={reply.id}
          post={post}
          reply={reply}
          childrenByParentId={childrenByParentId}
          detailKey={detailKey}
        />
      ))}
    </section>
  )
}

function ReplyItem({
  post,
  reply,
  childrenByParentId,
  detailKey,
  depth = 0,
}: {
  post: FeedPost
  reply: PostReply
  childrenByParentId: Map<string | null, PostReply[]>
  detailKey: readonly unknown[]
  depth?: number
}) {
  const queryClient = useQueryClient()
  const [showComposer, setShowComposer] = useState(false)
  const likeMutation = useMutation({
    mutationFn: () => reply.viewerLiked ? unlikeReply(reply.id) : likeReply(reply.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailKey })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update reply like.'),
  })
  const childReplies = childrenByParentId.get(reply.id) ?? []
  const formattedDate = reply.createdAt
    ? new Date(reply.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const isNested = depth > 0
  const displayDepth = isNested ? 1 : 0

  return (
    <>
      <article
        className={cn(
          'relative border-b bg-background px-5 py-4 transition-colors hover:bg-card/40',
          isNested && 'bg-card/20 before:absolute before:inset-y-0 before:left-7 before:w-px before:bg-border',
        )}
        data-thread-depth={displayDepth}
      >
        <div className={cn('flex gap-3', isNested && 'pl-8 sm:pl-10')}>
          <Avatar className="mt-0.5 size-9">
            <AvatarImage src={reply.author.avatarUrl ?? undefined} alt={reply.author.displayName} />
            <AvatarFallback className="text-xs font-semibold">
              {reply.author.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="truncate text-[15px] font-semibold leading-tight">{reply.author.displayName}</p>
                  <span className="text-sm text-muted-foreground">@{reply.author.username}</span>
                </div>
                {reply.mentionedUser?.username && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Replying to <span className="text-primary">@{reply.mentionedUser.username}</span>
                  </p>
                )}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
            </div>

            <div className="mt-3 flex flex-col gap-4">
              <p className="whitespace-pre-wrap text-[15px] leading-6">{reply.body}</p>
              {reply.attachments.length > 0 && (
                <div className={cn('grid overflow-hidden rounded-lg border', reply.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                  {reply.attachments.map((attachment) => (
                    <img
                      key={attachment.id}
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="aspect-video w-full border-border object-cover not-last:border-r"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant={reply.viewerLiked ? 'secondary' : 'ghost'}
                className={cn('rounded-full px-2.5', reply.viewerLiked && 'text-primary')}
                onClick={() => likeMutation.mutate()}
                disabled={likeMutation.isPending}
                aria-label={`Like reply from ${reply.author.displayName}`}
              >
                <Heart data-icon="inline-start" />
                {reply.likeCount}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full px-2.5"
                onClick={() => setShowComposer(true)}
                aria-label={`Reply to ${reply.author.displayName}`}
              >
                <Reply data-icon="inline-start" />
                Reply
              </Button>
            </div>
          </div>
        </div>
      </article>

      {showComposer && (
        <ReplyComposer post={post} parentReply={reply} detailKey={detailKey} onCancel={() => setShowComposer(false)} />
      )}

      {childReplies.map((childReply) => (
        <ReplyItem
          key={childReply.id}
          post={post}
          reply={childReply}
          childrenByParentId={childrenByParentId}
          detailKey={detailKey}
          depth={depth + 1}
        />
      ))}
    </>
  )
}
