import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Inbox, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  notificationsQueryOptions,
  type NotificationItem,
} from '../lib/notifications'
import { cn } from '../lib/utils'
import { useState } from 'react'

export function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('unread')
  const queryClient = useQueryClient()
  const notificationsQuery = useQuery(notificationsQueryOptions(filter))

  const invalidateNotifications = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount }),
    ])
  }

  const markOneMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidateNotifications,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to mark notification read.'),
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      toast.success('Notifications marked as read.')
      await invalidateNotifications()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to mark notifications read.'),
  })

  const notifications = notificationsQuery.data?.notifications ?? []
  const unreadCount = notifications.filter((notification) => notification.unread).length

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-4 backdrop-blur lg:top-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold leading-tight">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">Updates from creators, members, and payments.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="normal-case tracking-normal"
            disabled={markAllMutation.isPending || unreadCount === 0}
            onClick={() => markAllMutation.mutate()}
          >
            {markAllMutation.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            Mark all read
          </Button>
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as 'all' | 'unread')} className="mt-4">
          <TabsList>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {notificationsQuery.isPending ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading notifications
        </div>
      ) : notificationsQuery.isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
          <p className="text-lg font-medium text-foreground">Notifications unavailable</p>
          <p className="text-sm">{notificationsQuery.error.message}</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <Inbox className="size-10" />
          <div>
            <p className="font-medium text-foreground">Nothing here yet</p>
            <p className="mt-1 text-sm">{filter === 'unread' ? 'Unread updates will appear here.' : 'Your notification history will appear here.'}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              markingRead={markOneMutation.isPending}
              onMarkRead={() => markOneMutation.mutate(notification.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationRow({
  notification,
  markingRead,
  onMarkRead,
}: {
  notification: NotificationItem
  markingRead: boolean
  onMarkRead: () => void
}) {
  const createdAt = notification.createdAt
    ? new Date(notification.createdAt * 1000).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''

  return (
    <article className={cn('flex gap-3 border-b bg-background px-5 py-4 transition-colors hover:bg-card/40', notification.unread && 'bg-primary/5')}>
      <Avatar className="mt-0.5 size-10">
        <AvatarImage src={notification.actor?.avatarUrl ?? undefined} alt={notification.actor?.displayName ?? 'Notification'} />
        <AvatarFallback>
          {notification.actor?.displayName?.slice(0, 2).toUpperCase() ?? <Bell className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{notification.title}</h2>
              {notification.unread && <Badge className="normal-case tracking-normal">Unread</Badge>}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">{createdAt}</time>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {notification.targetUrl && (
            <Button asChild size="sm" variant="secondary" className="normal-case tracking-normal">
              <a href={notification.targetUrl}>Open</a>
            </Button>
          )}
          {notification.unread && (
            <Button type="button" size="sm" variant="ghost" className="normal-case tracking-normal" disabled={markingRead} onClick={onMarkRead}>
              <Check data-icon="inline-start" />
              Mark read
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
