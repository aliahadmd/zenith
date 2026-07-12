import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, Download, FileAudio, Heart, LockKeyhole, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Discussion } from '../components/Discussion'
import { SaveButton } from '../components/SaveButton'
import { LoadingBlock } from '../components/LoadingBlock'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { courseDetailQueryOptions, courseKeys, type CourseLesson } from '../lib/courses'
import { likePost, postKeys, type FeedPost, unlikePost } from '../lib/posts'
import { updateLessonProgress } from '../lib/courses'
import { cn } from '../lib/utils'

export function CourseDetailPage({ username, slug }: { username: string; slug: string }) {
  const queryClient = useQueryClient()
  const detailQuery = useQuery(courseDetailQueryOptions(username, slug))
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const course = detailQuery.data?.course
  const allLessons = course?.modules?.flatMap((module) => module.lessons) ?? []
  const firstReadableLesson = allLessons.find((lesson) => !lesson.locked) ?? allLessons[0]
  const activeLesson = allLessons.find((lesson) => lesson.id === activeLessonId) ?? firstReadableLesson

  const likeMutation = useMutation({
    mutationFn: () => {
      if (!course) throw new Error('Course not loaded')
      return course.viewerLiked ? unlikePost(course.postId) : likePost(course.postId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: courseKeys.detail(username, slug) }),
        queryClient.invalidateQueries({ queryKey: courseKeys.creator(username) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })
  const progressMutation = useMutation({
    mutationFn: ({ lessonId, completed }: { lessonId: string; completed: boolean }) => updateLessonProgress(lessonId, completed),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: courseKeys.detail(username, slug) }) },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update progress.'),
  })

  if (detailQuery.isPending) return <LoadingBlock label="Loading course" />
  if (detailQuery.isError || !course) {
    return <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-muted-foreground"><p className="text-lg font-medium">Unable to load course</p><p className="text-sm">{detailQuery.error?.message ?? 'Course not found'}</p></div>
  }

  const replyPost: FeedPost = {
    id: course.postId,
    type: 'post',
    slug: course.slug,
    body: course.title,
    createdAt: course.publishedAt ?? course.createdAt,
    author: course.creator,
    attachments: [],
    likeCount: course.likeCount,
    replyCount: course.replyCount,
    viewerLiked: course.viewerLiked,
    viewerSaved: course.viewerSaved,
    poll: null,
  }
  const detailKey = courseKeys.detail(username, slug)

  return (
    <div className="mx-auto min-h-screen max-w-[1040px] bg-background">
      <header className="border-b px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><Link to="/u/$username" params={{ username }} className="hover:text-foreground">@{username}</Link><ArrowRight className="size-4" /><Badge variant={course.status === 'published' ? 'default' : 'secondary'}>{course.status}</Badge></div>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1><p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">{course.description || 'A structured course for subscribers.'}</p></div><div className="flex items-center gap-3"><Avatar className="size-11"><AvatarImage src={course.creator.avatarUrl ?? undefined} alt={course.creator.displayName} /><AvatarFallback>{course.creator.displayName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div><p className="font-medium">{course.creator.displayName}</p><p className="text-sm text-muted-foreground">@{course.creator.username}</p></div></div></div>
        {course.progress && course.hasAccess && <div className="mt-5 max-w-xl"><div className="flex items-center justify-between text-sm"><span className="font-medium">Your progress</span><span className="text-muted-foreground">{course.progress.completedLessons}/{course.progress.totalLessons} lessons</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-primary transition-transform duration-200 ease-[var(--ease-out)]" style={{ transform: `scaleX(${course.progress.totalLessons ? course.progress.completedLessons / course.progress.totalLessons : 0})` }} /></div></div>}
      </header>

      <div className="grid gap-6 px-5 py-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-8">
        <aside className="min-w-0"><Card className="lg:sticky lg:top-6"><CardHeader><CardTitle className="text-base">Course outline</CardTitle><CardDescription>{allLessons.length} lessons</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{course.modules?.map((module) => <div key={module.id} className="grid gap-2"><p className="text-sm font-semibold">{module.title}</p>{module.lessons.map((lesson) => <button key={lesson.id} type="button" className={cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors', activeLesson?.id === lesson.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent/60', lesson.locked && 'text-muted-foreground')} onClick={() => setActiveLessonId(lesson.id)}><span className="min-w-0 flex-1 truncate">{lesson.title}</span>{lesson.completed && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}{lesson.locked && <LockKeyhole className="size-4 shrink-0" />}</button>)}</div>)}</CardContent></Card></aside>

        <main className="min-w-0">
          {activeLesson ? <LessonContent lesson={activeLesson} hasAccess={Boolean(course.hasAccess)} isOwner={Boolean(course.isOwner)} onToggleComplete={(completed) => progressMutation.mutate({ lessonId: activeLesson.id, completed })} isUpdating={progressMutation.isPending} /> : <Card><CardContent className="py-12 text-center text-muted-foreground">This course does not have any published lessons yet.</CardContent></Card>}
          {!course.hasAccess && !course.isOwner && <Card className="mt-6 border-primary/30 bg-primary/5"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Subscribe to unlock the lessons</p><p className="mt-1 text-sm text-muted-foreground">You can preview the course outline. Membership unlocks the Markdown, video, audio, files, and progress tracking.</p></div><Button asChild><Link to="/u/$username" params={{ username }}>View membership</Link></Button></CardContent></Card>}

          <div className="mt-6 flex flex-wrap items-center gap-1 text-muted-foreground"><Button type="button" variant={course.viewerLiked ? 'secondary' : 'ghost'} size="sm" className={cn('rounded-full px-2.5', course.viewerLiked && 'text-primary')} onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending}><Heart data-icon="inline-start" />{course.likeCount}</Button><span className="inline-flex items-center gap-1 px-2.5 text-sm"><MessageCircle className="size-4" />{course.replyCount}</span><SaveButton postId={course.postId} saved={course.viewerSaved} canSave={Boolean(course.hasAccess || course.isOwner)} queryKeys={[detailKey, courseKeys.creator(username)]} /></div>
          <Discussion post={replyPost} comments={detailQuery.data.replies ?? []} detailKey={detailKey} />
        </main>
      </div>
    </div>
  )
}

function LessonContent({ lesson, hasAccess, isOwner, onToggleComplete, isUpdating }: { lesson: CourseLesson; hasAccess: boolean; isOwner: boolean; onToggleComplete: (completed: boolean) => void; isUpdating: boolean }) {
  if (lesson.locked || (!hasAccess && !isOwner)) {
    return <Card><CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"><LockKeyhole className="size-10 text-muted-foreground" /><div><h2 className="text-xl font-semibold">{lesson.title}</h2><p className="mt-1 text-sm text-muted-foreground">This lesson is available to subscribers.</p></div></CardContent></Card>
  }

  return <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><Badge variant={lesson.status === 'published' ? 'default' : 'secondary'}>{lesson.status}</Badge>{lesson.completed && <Badge variant="outline" className="text-emerald-700"><CheckCircle2 data-icon="inline-start" /> Completed</Badge>}</div><CardTitle className="text-2xl">{lesson.title}</CardTitle>{lesson.summary && <CardDescription className="text-base leading-6">{lesson.summary}</CardDescription>}</CardHeader><CardContent className="flex flex-col gap-6"><MarkdownRenderer markdown={lesson.markdown ?? ''} />{lesson.attachments.length > 0 && <div className="grid gap-4">{lesson.attachments.map((attachment) => attachment.kind === 'video' ? <div key={attachment.id} className="overflow-hidden rounded-lg border bg-black"><video controls className="aspect-video w-full" src={attachment.url} preload="metadata" /></div> : attachment.kind === 'audio' ? <div key={attachment.id} className="rounded-lg border p-4"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><FileAudio className="size-4 text-primary" />{attachment.fileName}</div><audio controls className="w-full" src={attachment.url} /></div> : <a key={attachment.id} href={attachment.url} className="flex items-center gap-3 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent"><Download className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate">{attachment.fileName}</span><span className="text-xs text-muted-foreground">File</span></a>)}</div>}<div className="border-t pt-4"><Button type="button" variant={lesson.completed ? 'secondary' : 'default'} onClick={() => onToggleComplete(!lesson.completed)} disabled={isUpdating}><CheckCircle2 data-icon="inline-start" />{lesson.completed ? 'Mark incomplete' : 'Mark complete'}</Button></div></CardContent></Card>
}
