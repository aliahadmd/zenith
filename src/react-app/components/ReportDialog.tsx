import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Flag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { reportContent } from '../lib/admin'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

const reasons = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['hate', 'Hate'],
  ['sexual', 'Sexual content'],
  ['violence', 'Violence'],
  ['copyright', 'Copyright'],
  ['impersonation', 'Impersonation'],
  ['other', 'Other'],
] as const

export function ReportDialog({
  targetType,
  targetId,
  trigger,
}: {
  targetType: 'post' | 'reply' | 'user'
  targetId: string
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const mutation = useMutation({
    mutationFn: () => reportContent({ targetType, targetId, reason, details: details.trim() || undefined }),
    onSuccess: () => {
      toast.success('Report submitted for review.')
      setOpen(false)
      setDetails('')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not submit report.'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon-sm" aria-label={`Report ${targetType}`}>
            <Flag />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {targetType}</DialogTitle>
          <DialogDescription>Choose the reason that best describes the issue. Reports are private.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{reasons.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`report-details-${targetId}`}>Details (optional)</Label>
            <Textarea id={`report-details-${targetId}`} value={details} maxLength={1000} onChange={(event) => setDetails(event.target.value)} placeholder="Add context for the moderation team" />
            <p className="text-xs text-muted-foreground">{details.length}/1000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Flag />}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
