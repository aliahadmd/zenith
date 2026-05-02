import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Heart, Loader2, MessageCircle, Reply, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '../components/ui/card'
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
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PostCard post={post} showReplyAction={false} />
      <ReplyComposer post={post} detailKey={postKeys.detail(username, slug)} />
      <ReplyThread post={post} replies={replies} detailKey={postKeys.detail(username, slug)} />
    </div>
  )
}

function ReplyComposer({
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
  const form = useForm<ReplyFormValues>({
    resolver: zodResolver(replySchema),
    defaultValues: defaultReplyValues,
  })
  const body = useWatch({ control: form.control, name: 'body' }) ?? ''
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Replying to @{mentionUsername}</p>
            <p className="text-xs text-muted-foreground">Only entitled members can join this conversation.</p>
          </div>
          {onCancel && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel reply">
              <X data-icon="inline-start" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => replyMutation.mutate(values))} noValidate>
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reply</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} maxLength={500} placeholder={`Reply to @${mentionUsername}`} />
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
                  <FormLabel>Photos</FormLabel>
                  <FormControl>
                    <Input
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{500 - body.length} / 500</p>
              <Button type="submit" size="sm" disabled={replyMutation.isPending}>
                {replyMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Replying…
                  </>
                ) : (
                  <>
                    <MessageCircle data-icon="inline-start" />
                    Reply
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function ReplyThread({
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
      <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
        <p className="font-medium">No replies yet</p>
        <p className="mt-1 text-sm">Start the conversation with @{post.author.username}.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {rootReplies.map((reply) => (
        <ReplyItem
          key={reply.id}
          post={post}
          reply={reply}
          childrenByParentId={childrenByParentId}
          detailKey={detailKey}
        />
      ))}
    </div>
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

  return (
    <div className={cn('flex flex-col gap-3', depth > 0 && 'ml-5 border-l pl-4 sm:ml-8')}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar>
                <AvatarImage alt={reply.author.displayName} />
                <AvatarFallback>{reply.author.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{reply.author.displayName}</p>
                <p className="text-xs text-muted-foreground">@{reply.author.username}</p>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap text-sm leading-6">
            {reply.mentionedUser?.username && (
              <span className="font-medium text-foreground">@{reply.mentionedUser.username} </span>
            )}
            {reply.body}
          </p>
          {reply.attachments.length > 0 && (
            <div className={cn('grid gap-2', reply.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
              {reply.attachments.map((attachment) => (
                <img
                  key={attachment.id}
                  src={attachment.url}
                  alt={attachment.fileName}
                  className="aspect-video w-full rounded-md border object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex items-center gap-2 pt-0">
          <Button
            type="button"
            size="sm"
            variant={reply.viewerLiked ? 'secondary' : 'ghost'}
            onClick={() => likeMutation.mutate()}
            disabled={likeMutation.isPending}
          >
            <Heart data-icon="inline-start" />
            {reply.likeCount}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowComposer(true)}>
            <Reply data-icon="inline-start" />
            Reply
          </Button>
        </CardFooter>
      </Card>

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
    </div>
  )
}
