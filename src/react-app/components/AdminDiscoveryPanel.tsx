import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGetRequired, apiPostRequired, apiPutRequired } from '../lib/api'
import type { CreatorDiscoveryCardData } from '../lib/discovery'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Skeleton } from './ui/skeleton'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'

type AdminCategory = {
  id: string
  slug: string
  name: string
  description: string | null
  displayOrder: number
  active: number | boolean
  assignmentCount: number
}

const categoryKey = ['admin', 'discovery', 'categories'] as const
const featuredKey = ['admin', 'discovery', 'featured'] as const

export function AdminDiscoveryPanel() {
  const categoriesQuery = useQuery({
    queryKey: categoryKey,
    queryFn: () => apiGetRequired<{ categories: AdminCategory[] }>('/api/admin/discovery/categories'),
  })
  const featuredQuery = useQuery({
    queryKey: featuredKey,
    queryFn: () => apiGetRequired<{ creators: CreatorDiscoveryCardData[] }>('/api/admin/discovery/featured'),
  })

  if (categoriesQuery.isPending || featuredQuery.isPending) return <div className="grid gap-4"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
  if (categoriesQuery.isError || featuredQuery.isError) {
    return <p className="text-sm text-destructive">{categoriesQuery.error?.message ?? featuredQuery.error?.message}</p>
  }

  return (
    <div className="grid gap-5">
      <CategoryManager key={categoriesQuery.data.categories.map((category) => category.id).join(':')} categories={categoriesQuery.data.categories} />
      <FeaturedManager key={featuredQuery.data.creators.map((creator) => creator.id).join(':')} initialCreators={featuredQuery.data.creators} />
    </div>
  )
}

function CategoryManager({ categories: initialCategories }: { categories: AdminCategory[] }) {
  const queryClient = useQueryClient()
  const [categories, setCategories] = useState(initialCategories)
  const [editing, setEditing] = useState<AdminCategory | null | 'new'>(null)
  const [orderDialog, setOrderDialog] = useState(false)

  function move(index: number, offset: -1 | 1) {
    const target = index + offset
    if (target < 0 || target >= categories.length) return
    const next = [...categories]
    ;[next[index], next[target]] = [next[target], next[index]]
    setCategories(next)
  }

  const orderMutation = useMutation({
    mutationFn: (reason: string) => apiPutRequired('/api/admin/discovery/categories/order', { categoryIds: categories.map((category) => category.id), reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoryKey })
      toast.success('Category order updated.')
      setOrderDialog(false)
    },
    onError: showError,
  })

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="normal-case tracking-normal">Discovery categories</CardTitle>
          <CardDescription>Manage the taxonomy creators and members can select.</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={() => setEditing('new')}><Plus />Add category</Button>
      </CardHeader>
      <CardContent>
        <div className="divide-y border-y">
          {categories.map((category, index) => (
            <div key={category.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{category.name}</p>
                  <Badge variant={category.active ? 'default' : 'secondary'}>{category.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">/{category.slug} · {Number(category.assignmentCount)} creator assignments</p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${category.name} down`} disabled={index === categories.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${category.name}`} onClick={() => setEditing(category)}><Pencil /></Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" className="mt-4" disabled={categories.every((category, index) => category.id === initialCategories[index]?.id)} onClick={() => setOrderDialog(true)}>Save order</Button>
      </CardContent>

      <CategoryDialog key={editing === 'new' ? 'new' : editing?.id ?? 'closed'} category={editing} onOpenChange={(open) => { if (!open) setEditing(null) }} />
      <ReasonDialog open={orderDialog} onOpenChange={setOrderDialog} title="Save category order" description="Record why the discovery taxonomy order is changing." confirmLabel="Save order" pending={orderMutation.isPending} onConfirm={(reason) => orderMutation.mutate(reason)} />
    </Card>
  )
}

function CategoryDialog({ category, onOpenChange }: { category: AdminCategory | null | 'new'; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const existing = category === 'new' || category === null ? null : category
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [active, setActive] = useState(Boolean(existing?.active ?? true))
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => existing
      ? apiPutRequired(`/api/admin/discovery/categories/${existing.id}`, { name, description, active, reason })
      : apiPostRequired('/api/admin/discovery/categories', { name, description, reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoryKey })
      toast.success(existing ? 'Category updated.' : 'Category created.')
      onOpenChange(false)
    },
    onError: showError,
  })
  return (
    <Dialog open={category !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogDescription>Category slugs are created once and remain stable.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field id="discovery-category-name" label="Name"><Input id="discovery-category-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></Field>
          <Field id="discovery-category-description" label="Description"><Textarea id="discovery-category-description" value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} /></Field>
          {existing && <div className="flex items-center justify-between gap-4"><Label htmlFor="category-active">Active</Label><Switch id="category-active" checked={active} onCheckedChange={setActive} /></div>}
          <Field id="discovery-category-reason" label="Audit reason"><Textarea id="discovery-category-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={name.trim().length < 2 || reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="animate-spin" />}{existing ? 'Save changes' : 'Add category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FeaturedManager({ initialCreators }: { initialCreators: CreatorDiscoveryCardData[] }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(initialCreators)
  const [query, setQuery] = useState('')
  const [saveDialog, setSaveDialog] = useState(false)
  const eligibleQuery = useQuery({
    queryKey: ['admin', 'discovery', 'eligible', query],
    queryFn: () => apiGetRequired<{ creators: CreatorDiscoveryCardData[] }>(`/api/admin/discovery/eligible-creators?q=${encodeURIComponent(query)}`),
  })
  const mutation = useMutation({
    mutationFn: (reason: string) => apiPutRequired('/api/admin/discovery/featured', { creatorIds: selected.map((creator) => creator.id), reason }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: featuredKey }),
        queryClient.invalidateQueries({ queryKey: ['discovery'] }),
      ])
      toast.success('Featured creators updated.')
      setSaveDialog(false)
    },
    onError: showError,
  })

  function move(index: number, offset: -1 | 1) {
    const target = index + offset
    if (target < 0 || target >= selected.length) return
    const next = [...selected]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSelected(next)
  }

  const changed = selected.map((creator) => creator.id).join(':') !== initialCreators.map((creator) => creator.id).join(':')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="normal-case tracking-normal">Featured creators</CardTitle>
        <CardDescription>Curate and order up to 12 creators shown at the top of Explore.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Find an eligible creator" aria-label="Find an eligible creator" className="pl-9" />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto border-y">
            {eligibleQuery.isPending ? <Skeleton className="my-3 h-20" /> : eligibleQuery.data?.creators.map((creator) => {
              const added = selected.some((item) => item.id === creator.id)
              return <CreatorRow key={creator.id} creator={creator} action={<Button type="button" variant="ghost" size="sm" disabled={added || selected.length >= 12} onClick={() => setSelected([...selected, creator])}>{added ? 'Added' : 'Add'}</Button>} />
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Featured order</p><p className="text-xs text-muted-foreground">{selected.length} / 12</p></div>
          {selected.length === 0 ? <p className="border-y py-8 text-center text-sm text-muted-foreground">No featured creators selected.</p> : (
            <div className="divide-y border-y">
              {selected.map((creator, index) => <CreatorRow key={creator.id} creator={creator} action={<div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${creator.displayName} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${creator.displayName} down`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${creator.displayName}`} onClick={() => setSelected(selected.filter((item) => item.id !== creator.id))}><Trash2 /></Button>
              </div>} />)}
            </div>
          )}
        </div>
        <Button type="button" className="w-fit" disabled={!changed} onClick={() => setSaveDialog(true)}>Save featured creators</Button>
      </CardContent>
      <ReasonDialog open={saveDialog} onOpenChange={setSaveDialog} title="Save featured creators" description="Record why this curated list is changing." confirmLabel="Save featured list" pending={mutation.isPending} onConfirm={(reason) => mutation.mutate(reason)} />
    </Card>
  )
}

function CreatorRow({ creator, action }: { creator: CreatorDiscoveryCardData; action: ReactNode }) {
  return <div className="flex items-center gap-3 py-3">
    <Avatar className="size-9"><AvatarImage src={creator.avatarUrl ?? undefined} alt={creator.displayName} /><AvatarFallback>{creator.displayName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{creator.displayName}</p><p className="truncate text-xs text-muted-foreground">@{creator.username}</p></div>
    {action}
  </div>
}

function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, pending, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; pending: boolean; onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <Field id="discovery-change-reason" label="Audit reason"><Textarea id="discovery-change-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={reason.trim().length < 3 || pending} onClick={() => onConfirm(reason.trim())}>{pending && <Loader2 className="animate-spin" />}{confirmLabel}</Button></DialogFooter>
  </DialogContent></Dialog>
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children}</div>
}

function showError(error: Error) {
  toast.error(error.message || 'Discovery settings could not be updated.')
}
