import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpenCheck, Heart, MessageCircle, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { courseKeys, type CourseSummary } from '../lib/courses'
import { likePost, postKeys, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ReportDialog } from './ReportDialog'

export function CourseCard({ course, showReplyAction = true }: { course: CourseSummary; showReplyAction?: boolean }) {
  const queryClient = useQueryClient()
  const formattedDate = course.publishedAt || course.createdAt
    ? new Date((course.publishedAt ?? course.createdAt ?? 0) * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''
  const lessonCount = course.modules?.flatMap((module) => module.lessons).filter((lesson) => lesson.status === 'published').length
  const likeMutation = useMutation({
    mutationFn: () => course.viewerLiked ? unlikePost(course.postId) : likePost(course.postId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: courseKeys.creator(course.creator.username) }),
        queryClient.invalidateQueries({ queryKey: courseKeys.detail(course.creator.username, course.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  return (
    <article className="border-b bg-background px-5 py-4 transition-colors hover:bg-card/40">
      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-10">
          <AvatarImage src={course.creator.avatarUrl ?? undefined} alt={course.creator.displayName} />
          <AvatarFallback className="text-sm font-semibold">{course.creator.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link to="/u/$username/course/$slug" params={{ username: course.creator.username, slug: course.slug }} className="truncate text-[15px] font-semibold leading-tight hover:underline">
                  {course.creator.displayName}
                </Link>
                <span className="text-sm text-muted-foreground">@{course.creator.username}</span>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
          </div>

          <Link to="/u/$username/course/$slug" params={{ username: course.creator.username, slug: course.slug }} className="mt-3 block overflow-hidden rounded-xl border bg-card/30 transition-colors hover:bg-card/60">
            <div className="flex aspect-[16/7] items-center justify-center border-b bg-primary/5 text-primary">
              <BookOpenCheck className="size-12" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="w-fit normal-case tracking-normal">
                  <BookOpenCheck data-icon="inline-start" />
                  Course
                </Badge>
                {course.hasAccess === false && <LockKeyhole className="size-4 text-muted-foreground" aria-label="Subscriber access" />}
                {lessonCount !== undefined && <span className="text-xs text-muted-foreground">{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</span>}
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-snug">{course.title}</h2>
                {course.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{course.description}</p>}
              </div>
            </div>
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
            <Button type="button" variant={course.viewerLiked ? 'secondary' : 'ghost'} size="sm" className={cn('rounded-full px-2.5', course.viewerLiked && 'text-primary')} onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending}>
              <Heart data-icon="inline-start" />
              {course.likeCount}
            </Button>
            {showReplyAction && (
              <Button asChild variant="ghost" size="sm" className="rounded-full px-2.5">
                <Link to="/u/$username/course/$slug" params={{ username: course.creator.username, slug: course.slug }} aria-label={`View replies for course by ${course.creator.displayName}`}>
                  <MessageCircle data-icon="inline-start" />
                  {course.replyCount}
                </Link>
              </Button>
            )}
            <ReportDialog targetType="post" targetId={course.postId} />
          </div>
        </div>
      </div>
    </article>
  )
}
