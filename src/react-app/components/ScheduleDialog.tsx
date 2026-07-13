import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveSchedule, scheduleKeys } from '../lib/schedules'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function ScheduleDialog({
  postId,
  open,
  onOpenChange,
  initialScheduledFor,
  onScheduled,
}: {
  postId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialScheduledFor?: number | null
  onScheduled?: () => void | Promise<void>
}) {
  return (
    <ScheduleDialogState
      key={`${postId}:${initialScheduledFor ?? 'new'}:${open}`}
      postId={postId}
      open={open}
      onOpenChange={onOpenChange}
      initialScheduledFor={initialScheduledFor}
      onScheduled={onScheduled}
    />
  )
}

function ScheduleDialogState({
  postId,
  open,
  onOpenChange,
  initialScheduledFor,
  onScheduled,
}: {
  postId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialScheduledFor?: number | null
  onScheduled?: () => void | Promise<void>
}) {
  const queryClient = useQueryClient()
  const initialDate = initialScheduledFor
    ? new Date(initialScheduledFor * 1000)
    : new Date(Date.now() + 5 * 60_000)
  const [value, setValue] = useState(localDateTimeValue(initialDate))
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const minimum = localDateTimeValue(new Date(Date.now() + 60_000))

  const mutation = useMutation({
    mutationFn: () => {
      const date = new Date(value)
      if (!value || !Number.isFinite(date.getTime())) throw new Error('Choose a valid publication time.')
      return saveSchedule(postId, date.toISOString())
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleKeys.all }),
        onScheduled?.(),
      ])
      toast.success(initialScheduledFor ? 'Schedule updated.' : 'Content scheduled.')
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to schedule content.'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialScheduledFor ? 'Reschedule publication' : 'Schedule publication'}</DialogTitle>
          <DialogDescription>The latest saved version will publish at this time.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor={`schedule-${postId}`}>Publication time</Label>
          <Input
            id={`schedule-${postId}`}
            type="datetime-local"
            min={minimum}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{timezone}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CalendarClock data-icon="inline-start" />}
            {initialScheduledFor ? 'Update schedule' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
