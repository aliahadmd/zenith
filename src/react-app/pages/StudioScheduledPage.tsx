import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Pencil, Play, RefreshCw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ScheduleDialog } from '../components/ScheduleDialog'
import { ShortPostComposer } from '../components/ShortPostComposer'
import { StudioLayout } from '../components/StudioLayout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  cancelSchedule,
  publishScheduledContent,
  retrySchedule,
  scheduleKeys,
  schedulesQueryOptions,
  type ScheduleContentType,
  type ScheduleSummary,
} from '../lib/schedules'
import { deleteDraftPost } from '../lib/posts'

type QueueStatus = 'upcoming' | 'failed' | 'history'

const contentTypes: Array<{ value: 'all' | ScheduleContentType; label: string }> = [
  { value: 'all', label: 'All content' },
  { value: 'post', label: 'Posts' },
  { value: 'article', label: 'Articles' },
  { value: 'audio', label: 'Audio' },
  { value: 'photography', label: 'Photography' },
  { value: 'course', label: 'Courses' },
]

export function StudioScheduledPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [status, setStatus] = useState<QueueStatus>('upcoming')
  const [type, setType] = useState<'all' | ScheduleContentType>('all')
  const [page, setPage] = useState(1)
  const [rescheduling, setRescheduling] = useState<ScheduleSummary | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const filter = { status, type, page, pageSize: 20 } as const
  const query = useQuery(schedulesQueryOptions(filter))

  const actionMutation = useMutation({
    mutationFn: async ({ action, postId }: { action: 'cancel' | 'retry' | 'publish' | 'delete'; postId: string }) => {
      if (action === 'cancel') await cancelSchedule(postId)
      else if (action === 'retry') await retrySchedule(postId)
      else if (action === 'delete') await deleteDraftPost(postId)
      else await publishScheduledContent(postId)
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
      toast.success(variables.action === 'cancel' ? 'Schedule canceled.' : variables.action === 'retry' ? 'Publication queued again.' : variables.action === 'delete' ? 'Draft deleted.' : 'Content published.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update schedule.'),
  })

  function edit(item: ScheduleSummary) {
    if (item.contentType === 'post') {
      setEditingPostId(item.postId)
      return
    }
    if (item.contentType === 'article') return navigate({ to: '/studio/articles/$postId/edit', params: { postId: item.postId } })
    if (item.contentType === 'course') return navigate({ to: '/studio/courses/$courseId/edit', params: { courseId: item.contentId } })
    if (item.contentType === 'audio') return navigate({ to: '/studio/audio' })
    if (item.contentType === 'photography') return navigate({ to: '/studio/photography' })
    return navigate({ to: '/studio' })
  }

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1

  return (
    <StudioLayout title="Scheduled" description="Manage upcoming publications and release failures." contentClassName="max-w-5xl">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(value) => { setStatus(value as QueueStatus); setPage(1) }}>
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={type} onValueChange={(value) => { setType(value as 'all' | ScheduleContentType); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Content type"><SelectValue /></SelectTrigger>
          <SelectContent>{contentTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <div className="flex min-h-64 items-center justify-center text-muted-foreground"><Loader2 className="animate-spin" aria-label="Loading schedules" /></div>
      ) : query.isError ? (
        <div className="border border-destructive/40 p-5 text-sm text-destructive">{query.error.message}</div>
      ) : query.data.items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <CalendarClock className="size-6 text-muted-foreground" />
          <p className="mt-4 font-medium">No {status} schedules</p>
          <p className="mt-1 text-sm text-muted-foreground">Scheduled content will appear here.</p>
        </div>
      ) : (
        <div className="divide-y border-y">
          {query.data.items.map((item) => {
            const pendingAction = actionMutation.isPending && actionMutation.variables?.postId === item.postId
            return (
              <article key={item.postId} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.contentType}</Badge>
                    <Badge variant={item.status === 'failed' ? 'destructive' : item.status === 'published' ? 'default' : 'secondary'}>{item.status}</Badge>
                  </div>
                  <h2 className="mt-2 truncate font-medium">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.status === 'published' && item.publishedAt
                      ? `Published ${new Date(item.publishedAt * 1000).toLocaleString()}`
                      : `Scheduled for ${new Date(item.scheduledFor * 1000).toLocaleString()}`}
                  </p>
                  {item.failure && <p className="mt-2 text-sm text-destructive">{item.failure.message}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.status !== 'published' && item.status !== 'processing' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => edit(item)}><Pencil data-icon="inline-start" /> Edit</Button>
                  )}
                  {(item.status === 'pending' || item.status === 'failed' || item.status === 'canceled') && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRescheduling(item)}><CalendarClock data-icon="inline-start" /> Reschedule</Button>
                  )}
                  {item.status === 'failed' && (
                    <Button type="button" variant="outline" size="sm" disabled={pendingAction} onClick={() => actionMutation.mutate({ action: 'retry', postId: item.postId })}><RefreshCw data-icon="inline-start" /> Retry</Button>
                  )}
                  {(item.status === 'pending' || item.status === 'failed' || item.status === 'canceled') && (
                    <Button type="button" size="sm" disabled={pendingAction} onClick={() => actionMutation.mutate({ action: 'publish', postId: item.postId })}><Play data-icon="inline-start" /> Publish now</Button>
                  )}
                  {(item.status === 'pending' || item.status === 'failed') && (
                    <Button type="button" variant="ghost" size="icon-sm" disabled={pendingAction} onClick={() => actionMutation.mutate({ action: 'cancel', postId: item.postId })} aria-label={`Cancel schedule for ${item.title}`} title="Cancel schedule"><X /></Button>
                  )}
                  {item.contentType === 'post' && item.status !== 'published' && item.status !== 'processing' && (
                    <Button type="button" variant="ghost" size="icon-sm" disabled={pendingAction} onClick={() => actionMutation.mutate({ action: 'delete', postId: item.postId })} aria-label={`Delete draft ${item.title}`} title="Delete draft"><Trash2 /></Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {query.data && query.data.total > query.data.pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft /></Button>
            <Button type="button" variant="outline" size="icon-sm" disabled={page >= totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </div>
      )}

      {rescheduling && (
        <ScheduleDialog
          postId={rescheduling.postId}
          open
          onOpenChange={(open) => { if (!open) setRescheduling(null) }}
          initialScheduledFor={rescheduling.scheduledFor}
        />
      )}
      <ShortPostComposer open={Boolean(editingPostId)} postId={editingPostId} onClose={() => { setEditingPostId(null); void queryClient.invalidateQueries({ queryKey: scheduleKeys.all }) }} />
    </StudioLayout>
  )
}
