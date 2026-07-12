import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { LoadingBlock } from '../components/LoadingBlock'
import { Discussion } from '../components/Discussion'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { articleDetailQueryOptions, articleKeys } from '../lib/articles'
import { likePost, postKeys, type FeedPost, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'

type ArticleDetailPageProps = {
  username: string
  slug: string
}

export function ArticleDetailPage({ username, slug }: ArticleDetailPageProps) {
  const queryClient = useQueryClient()
  const detailQuery = useQuery(articleDetailQueryOptions(username, slug))
  const likeMutation = useMutation({
    mutationFn: () => {
      const article = detailQuery.data?.article
      if (!article) throw new Error('Article not loaded')
      return article.viewerLiked ? unlikePost(article.postId) : likePost(article.postId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: articleKeys.detail(username, slug) }),
        queryClient.invalidateQueries({ queryKey: articleKeys.creator(username) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  if (detailQuery.isPending) {
    return <LoadingBlock label="Loading article" />
  }

  if (detailQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load article</p>
        <p className="text-sm">{detailQuery.error.message}</p>
      </div>
    )
  }

  const article = detailQuery.data.article
  const { replies } = detailQuery.data
  const replyPost: FeedPost = {
    id: article.postId,
    type: 'post',
    slug: article.slug,
    body: article.title,
    createdAt: article.publishedAt ?? article.createdAt,
    author: article.author,
    attachments: [],
    likeCount: article.likeCount,
    replyCount: article.replyCount,
    viewerLiked: article.viewerLiked,
    poll: null,
  }
  const detailKey = articleKeys.detail(username, slug)

  return (
    <div className="mx-auto min-h-screen max-w-[640px] border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Article</h1>
        </div>
      </header>

      <article className="border-b px-5 py-6">
        <div className="mb-5 flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={article.author.avatarUrl ?? undefined} alt={article.author.displayName} />
            <AvatarFallback>{article.author.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-tight">{article.author.displayName}</p>
              <span className="text-sm text-muted-foreground">@{article.author.username}</span>
              <Badge variant="secondary" className="normal-case tracking-normal">Article</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {article.publishedAt
                ? new Date(article.publishedAt * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'Draft'}
            </p>
          </div>
        </div>
        {article.coverUrl && (
          <img src={article.coverUrl} alt="" className="mb-6 aspect-[16/7] w-full rounded-xl border object-cover" />
        )}
        <h1 className="text-3xl font-semibold leading-tight">{article.title}</h1>
        {article.excerpt && <p className="mt-3 text-base leading-7 text-muted-foreground">{article.excerpt}</p>}
        <div className="mt-6">
          <MarkdownRenderer markdown={article.markdown} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-1 text-muted-foreground">
          <Button
            type="button"
            variant={article.viewerLiked ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('rounded-full px-2.5', article.viewerLiked && 'text-primary')}
            onClick={() => likeMutation.mutate()}
            disabled={likeMutation.isPending}
          >
            <Heart data-icon="inline-start" />
            {article.likeCount}
          </Button>
        </div>
      </article>

      <Discussion post={replyPost} comments={replies} detailKey={detailKey} />
    </div>
  )
}
