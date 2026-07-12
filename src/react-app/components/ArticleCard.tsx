import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpen, Heart, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { articleKeys, type ArticleSummary } from '../lib/articles'
import { likePost, postKeys, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ReportDialog } from './ReportDialog'
import { SaveButton } from './SaveButton'

type ArticleCardProps = {
  article: ArticleSummary
  showReplyAction?: boolean
}

export function ArticleCard({ article, showReplyAction = true }: ArticleCardProps) {
  const queryClient = useQueryClient()
  const formattedDate = article.publishedAt || article.createdAt
    ? new Date((article.publishedAt ?? article.createdAt ?? 0) * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''

  const likeMutation = useMutation({
    mutationFn: () => article.viewerLiked ? unlikePost(article.postId) : likePost(article.postId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: articleKeys.creator(article.author.username) }),
        queryClient.invalidateQueries({ queryKey: articleKeys.detail(article.author.username, article.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  return (
    <article className="border-b bg-background px-5 py-4 transition-colors hover:bg-card/40">
      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-10">
          <AvatarImage src={article.author.avatarUrl ?? undefined} alt={article.author.displayName} />
          <AvatarFallback className="text-sm font-semibold">
            {article.author.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link
                  to="/u/$username/article/$slug"
                  params={{ username: article.author.username, slug: article.slug }}
                  className="truncate text-[15px] font-semibold leading-tight hover:underline"
                >
                  {article.author.displayName}
                </Link>
                <span className="text-sm text-muted-foreground">@{article.author.username}</span>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
          </div>

          <Link
            to="/u/$username/article/$slug"
            params={{ username: article.author.username, slug: article.slug }}
            className="mt-3 block overflow-hidden rounded-xl border bg-card/30 transition-colors hover:bg-card/60"
          >
            {article.coverUrl && (
              <img
                src={article.coverUrl}
                alt=""
                className="aspect-[16/7] w-full border-b object-cover"
                loading="lazy"
              />
            )}
            <div className="flex flex-col gap-3 p-4">
              <Badge variant="secondary" className="w-fit normal-case tracking-normal">
                <BookOpen data-icon="inline-start" />
                Article
              </Badge>
              <div>
                <h2 className="text-lg font-semibold leading-snug">{article.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {article.excerpt}
                </p>
              </div>
            </div>
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
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
            {showReplyAction && (
              <Button asChild variant="ghost" size="sm" className="rounded-full px-2.5">
                <Link
                  to="/u/$username/article/$slug"
                  params={{ username: article.author.username, slug: article.slug }}
                  aria-label={`View replies for article by ${article.author.displayName}`}
                >
                  <MessageCircle data-icon="inline-start" />
                  {article.replyCount}
                </Link>
              </Button>
            )}
            <SaveButton
              postId={article.postId}
              saved={article.viewerSaved}
              queryKeys={[articleKeys.creator(article.author.username), articleKeys.detail(article.author.username, article.slug)]}
            />
            <ReportDialog targetType="post" targetId={article.postId} />
          </div>
        </div>
      </div>
    </article>
  )
}
