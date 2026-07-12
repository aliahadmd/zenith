import { useId, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Heart, ImagePlus, Loader2, MessageCircle, MoreHorizontal, Pencil, Reply, Trash2, X } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { deleteReply, createReply, likeReply, postKeys, unlikeReply, updateReply, type FeedPost, type PostReply } from '../lib/posts'
import { replySchema, type ReplyFormValues } from '../lib/schemas'
import { cn } from '../lib/utils'
import { ReportDialog } from './ReportDialog'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form'
import { Textarea } from './ui/textarea'

type DiscussionSort = 'top' | 'newest' | 'oldest'

const defaultCommentValues: ReplyFormValues = { body: '', images: [] }
const depthClasses = ['', 'ml-4 sm:ml-7', 'ml-8 sm:ml-14', 'ml-10 sm:ml-20']

export function Discussion({
  post,
  comments,
  detailKey,
}: {
  post: FeedPost
  comments: PostReply[]
  detailKey: readonly unknown[]
}) {
  const [sort, setSort] = useState<DiscussionSort>('top')
  const childrenByParentId = useMemo(() => {
    const map = new Map<string | null, PostReply[]>()
    for (const comment of comments) {
      const key = comment.parentReplyId ?? null
      map.set(key, [...(map.get(key) ?? []), comment])
    }
    for (const children of map.values()) {
      children.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    }
    return map
  }, [comments])

  const descendantCount = useMemo(() => {
    const memo = new Map<string, number>()
    const count = (id: string): number => {
      if (memo.has(id)) return memo.get(id) ?? 0
      const value = (childrenByParentId.get(id) ?? []).reduce(
        (total, child) => total + (child.isDeleted ? 0 : 1) + count(child.id),
        0,
      )
      memo.set(id, value)
      return value
    }
    for (const comment of comments) count(comment.id)
    return memo
  }, [childrenByParentId, comments])

  const roots = useMemo(() => {
    const visible = (childrenByParentId.get(null) ?? []).filter(
      (comment) => !comment.isDeleted || (descendantCount.get(comment.id) ?? 0) > 0,
    )
    return [...visible].sort((a, b) => {
      if (sort === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0)
      if (sort === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0)
      const aScore = a.likeCount + (descendantCount.get(a.id) ?? 0)
      const bScore = b.likeCount + (descendantCount.get(b.id) ?? 0)
      return bScore - aScore || (b.createdAt ?? 0) - (a.createdAt ?? 0)
    })
  }, [childrenByParentId, descendantCount, sort])

  return (
    <section className="border-t" aria-labelledby="discussion-heading">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="discussion-heading" className="text-base font-semibold">Discussion</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {post.replyCount === 1 ? '1 comment' : `${post.replyCount} comments`}
          </p>
        </div>
        <div className="inline-flex w-fit rounded-md border bg-muted/30 p-0.5" aria-label="Sort discussion">
          {(['top', 'newest', 'oldest'] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={sort === option}
              className={cn('h-7 rounded px-2.5 capitalize', sort === option && 'bg-background shadow-sm')}
              onClick={() => setSort(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <CommentComposer post={post} detailKey={detailKey} />

      {roots.length === 0 ? (
        <div className="px-5 py-10 text-center text-muted-foreground">
          <MessageCircle className="mx-auto size-5" aria-hidden="true" />
          <p className="mt-3 font-medium text-foreground">Start the discussion</p>
          <p className="mt-1 text-sm">Share a question or thought with @{post.author.username}.</p>
        </div>
      ) : (
        <div aria-label="Comments">
          {roots.map((comment) => (
            <CommentItem
              key={comment.id}
              post={post}
              comment={comment}
              childrenByParentId={childrenByParentId}
              descendantCount={descendantCount}
              detailKey={detailKey}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CommentComposer({
  post,
  parentComment,
  detailKey,
  onCancel,
}: {
  post: FeedPost
  parentComment?: PostReply
  detailKey: readonly unknown[]
  onCancel?: () => void
}) {
  const queryClient = useQueryClient()
  const imageInputId = useId()
  const form = useForm<ReplyFormValues>({ resolver: zodResolver(replySchema), defaultValues: defaultCommentValues })
  const body = useWatch({ control: form.control, name: 'body' }) ?? ''
  const images = useWatch({ control: form.control, name: 'images' }) ?? []
  const mentionUsername = parentComment?.author?.username ?? post.author.username
  const mutation = useMutation({
    mutationFn: (values: ReplyFormValues) => {
      if (values.images.length === 0) {
        return createReply(post.id, {
          body: values.body,
          ...(parentComment ? { parentReplyId: parentComment.id } : {}),
        })
      }
      const formData = new FormData()
      formData.append('body', values.body)
      if (parentComment) formData.append('parentReplyId', parentComment.id)
      for (const image of values.images) formData.append('images', image)
      return createReply(post.id, formData)
    },
    onSuccess: async () => {
      form.reset(defaultCommentValues)
      onCancel?.()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to post comment.'),
  })

  return (
    <div className={cn('border-b bg-background px-5 py-4', parentComment && 'bg-muted/20')}>
      <Form {...form}>
        <form className="flex gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
          <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
            <MessageCircle className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            {parentComment && (
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <p>Replying to <span className="text-primary">@{mentionUsername}</span></p>
                <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel reply">
                  <X />
                </Button>
              </div>
            )}
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Comment</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={parentComment ? 2 : 3}
                      maxLength={2_000}
                      placeholder={parentComment ? `Reply to @${mentionUsername}` : 'Join the discussion'}
                      className="min-h-20 resize-y bg-card/50 text-[15px]"
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
                    <input
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
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm" className="px-2.5">
                  <label htmlFor={imageInputId}>
                    <ImagePlus data-icon="inline-start" />
                    {images.length > 0 ? `${images.length} photo${images.length === 1 ? '' : 's'}` : 'Photo'}
                  </label>
                </Button>
                <span className="text-xs text-muted-foreground">{2_000 - body.length} left</span>
              </div>
              <Button type="submit" size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="animate-spin" /> : <MessageCircle />}
                {parentComment ? 'Reply' : 'Comment'}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}

function CommentItem({
  post,
  comment,
  childrenByParentId,
  descendantCount,
  detailKey,
  depth = 0,
}: {
  post: FeedPost
  comment: PostReply
  childrenByParentId: Map<string | null, PostReply[]>
  descendantCount: Map<string, number>
  detailKey: readonly unknown[]
  depth?: number
}) {
  const queryClient = useQueryClient()
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [collapsed, setCollapsed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const children = (childrenByParentId.get(comment.id) ?? []).filter(
    (child) => !child.isDeleted || (descendantCount.get(child.id) ?? 0) > 0,
  )
  const replyTotal = descendantCount.get(comment.id) ?? 0
  const displayDepth = Math.min(depth, 3)
  const author = comment.author

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: detailKey }),
      queryClient.invalidateQueries({ queryKey: postKeys.feed }),
    ])
  }
  const likeMutation = useMutation({
    mutationFn: () => comment.viewerLiked ? unlikeReply(comment.id) : likeReply(comment.id),
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })
  const editMutation = useMutation({
    mutationFn: () => updateReply(comment.id, editBody),
    onSuccess: async () => { setEditing(false); await refresh() },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to edit comment.'),
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteReply(comment.id),
    onSuccess: async () => { setConfirmDelete(false); await refresh() },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete comment.'),
  })

  if (comment.isDeleted && children.length === 0) return null

  return (
    <div className={cn('relative border-b', displayDepth > 0 && depthClasses[displayDepth])} data-thread-depth={displayDepth}>
      {displayDepth > 0 && <div className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden="true" />}
      <article className={cn('px-5 py-4 transition-colors', !comment.isDeleted && 'hover:bg-muted/20')}>
        {comment.isDeleted ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-px w-5 bg-border" />
            <span className="italic">Comment deleted</span>
          </div>
        ) : author ? (
          <div className="flex gap-3">
            <Avatar className="mt-0.5 size-9">
              <AvatarImage src={author.avatarUrl ?? undefined} alt={author.displayName} />
              <AvatarFallback className="text-xs font-semibold">{author.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold">{author.displayName}</span>
                    <span className="text-sm text-muted-foreground">@{author.username}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <time>{formatCommentDate(comment.createdAt)}</time>
                    {comment.editedAt && <span>Edited</span>}
                    {comment.mentionedUser?.username && <span>to @{comment.mentionedUser.username}</span>}
                  </div>
                </div>
                {comment.viewerCanManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Comment actions"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => { setEditBody(comment.body); setEditing(true) }}><Pencil />Edit</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}><Trash2 />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {editing ? (
                <div className="mt-3 grid gap-2">
                  <Textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={2_000} rows={3} autoFocus />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{editBody.length}/2000</span>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button type="button" size="sm" disabled={!editBody.trim() || editMutation.isPending} onClick={() => editMutation.mutate()}>
                        {editMutation.isPending && <Loader2 className="animate-spin" />}Save
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6">{comment.body}</p>
                  {comment.attachments.length > 0 && (
                    <div className={cn('mt-4 grid overflow-hidden rounded-md border', comment.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                      {comment.attachments.map((attachment) => (
                        <img key={attachment.id} src={attachment.url} alt={attachment.fileName} className="aspect-video w-full object-cover" loading="lazy" />
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
                    <Button type="button" size="sm" variant={comment.viewerLiked ? 'secondary' : 'ghost'} className={cn('px-2.5', comment.viewerLiked && 'text-primary')} onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending} aria-label={`Like comment from ${author.displayName}`}>
                      <Heart data-icon="inline-start" />{comment.likeCount}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="px-2.5" onClick={() => setReplying((value) => !value)} aria-label={`Reply to ${author.displayName}`}>
                      <Reply data-icon="inline-start" />Reply
                    </Button>
                    <ReportDialog targetType="reply" targetId={comment.id} />
                    {replyTotal > 0 && (
                      <Button type="button" size="sm" variant="ghost" className="px-2.5" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
                        {collapsed ? <ChevronDown data-icon="inline-start" /> : <ChevronUp data-icon="inline-start" />}
                        {collapsed ? 'View' : 'Hide'} {replyTotal} {replyTotal === 1 ? 'reply' : 'replies'}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </article>

      {replying && !comment.isDeleted && (
        <CommentComposer post={post} parentComment={comment} detailKey={detailKey} onCancel={() => setReplying(false)} />
      )}
      {!collapsed && children.map((child) => (
        <CommentItem
          key={child.id}
          post={post}
          comment={child}
          childrenByParentId={childrenByParentId}
          descendantCount={descendantCount}
          detailKey={detailKey}
          depth={depth + 1}
        />
      ))}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete comment?</DialogTitle>
            <DialogDescription>Your text and attached photos will be removed. Replies beneath it will remain in the discussion.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending && <Loader2 className="animate-spin" />}Delete comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatCommentDate(timestamp: number | null) {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
