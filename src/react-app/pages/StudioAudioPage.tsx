import { useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Disc3, GripVertical, Headphones, Loader2, Pencil, Podcast, Plus, Trash2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import {
  audioKeys,
  audioCollectionDetailQueryOptions,
  createAudioCollection,
  createAudioItem,
  deleteAudioCollection,
  deleteAudioItem,
  formatAudioDuration,
  mineAudioCollectionsQueryOptions,
  reorderAudioItems,
  updateAudioCollection,
  updateAudioItem,
  type AudioCollectionKind,
  type AudioCollectionSummary,
  type AudioItemSummary,
} from '../lib/audio'
import { audioCollectionSchema, audioItemSchema, type AudioCollectionFormValues, type AudioItemFormValues } from '../lib/schemas'
import { cn } from '../lib/utils'
import { StudioLayout } from '../components/StudioLayout'
import { ScheduleDialog } from '../components/ScheduleDialog'
import { LoadingBlock } from '../components/LoadingBlock'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'

const defaultCollectionValues: AudioCollectionFormValues = {
  kind: 'album',
  title: '',
  description: '',
  status: 'draft',
  releaseDate: '',
  cover: null,
  hasExistingCover: false,
}

const defaultItemValues: AudioItemFormValues = {
  collectionId: '',
  title: '',
  description: '',
  status: 'draft',
  durationSeconds: null,
  audio: null,
  cover: null,
  hasExistingAudio: false,
  hasExistingCover: false,
  hasCollectionCover: false,
}

export function StudioAudioPage() {
  const queryClient = useQueryClient()
  const [activeKind, setActiveKind] = useState<AudioCollectionKind>('album')
  const [collectionDialog, setCollectionDialog] = useState<{ open: boolean; collection: AudioCollectionSummary | null }>({ open: false, collection: null })
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: AudioItemSummary | null; collection: AudioCollectionSummary | null }>({ open: false, item: null, collection: null })
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const collectionsQuery = useQuery(mineAudioCollectionsQueryOptions())

  const collections = collectionsQuery.data?.collections ?? []
  const visibleCollections = collections.filter((collection) => collection.kind === activeKind)
  const selectedCollection = visibleCollections.find((collection) => collection.id === selectedCollectionId) ?? visibleCollections[0] ?? null

  if (collectionsQuery.isPending) return <LoadingBlock label="Loading audio studio" />
  if (collectionsQuery.isError) {
    return (
      <StudioLayout title="Audio" description="Manage albums, podcasts, tracks, and episodes." contentClassName="max-w-5xl">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{collectionsQuery.error.message}</p>
          </CardContent>
        </Card>
      </StudioLayout>
    )
  }

  return (
    <StudioLayout title="Audio" description="Publish member-only music albums and podcast episodes." contentClassName="max-w-5xl">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="normal-case tracking-normal">Audio library</CardTitle>
            <CardDescription>
              Organize music into albums and podcasts into episode playlists. Audio remains private to entitled members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeKind} onValueChange={(value) => {
              setActiveKind(value as AudioCollectionKind)
              setSelectedCollectionId(null)
            }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList>
                  <TabsTrigger value="album"><Disc3 data-icon="inline-start" />Albums</TabsTrigger>
                  <TabsTrigger value="podcast"><Podcast data-icon="inline-start" />Podcasts</TabsTrigger>
                </TabsList>
                <Button
                  type="button"
                  className="self-start rounded-full sm:self-auto"
                  onClick={() => setCollectionDialog({ open: true, collection: null })}
                >
                  <Plus data-icon="inline-start" />
                  New {activeKind === 'album' ? 'album' : 'podcast'}
                </Button>
              </div>

              <TabsContent value="album" className="mt-5">
                <CollectionManager
                  kind="album"
                  collections={visibleCollections}
                  selectedCollection={selectedCollection}
                  onSelect={setSelectedCollectionId}
                  onEdit={(collection) => setCollectionDialog({ open: true, collection })}
                  onCreateItem={(collection) => setItemDialog({ open: true, collection, item: null })}
                  onEditItem={(item, collection) => setItemDialog({ open: true, item, collection })}
                />
              </TabsContent>
              <TabsContent value="podcast" className="mt-5">
                <CollectionManager
                  kind="podcast"
                  collections={visibleCollections}
                  selectedCollection={selectedCollection}
                  onSelect={setSelectedCollectionId}
                  onEdit={(collection) => setCollectionDialog({ open: true, collection })}
                  onCreateItem={(collection) => setItemDialog({ open: true, collection, item: null })}
                  onEditItem={(item, collection) => setItemDialog({ open: true, item, collection })}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <CollectionDialog
        kind={activeKind}
        open={collectionDialog.open}
        collection={collectionDialog.collection}
        onOpenChange={(open) => setCollectionDialog((state) => ({ ...state, open }))}
        onSaved={async () => {
          setCollectionDialog({ open: false, collection: null })
          await queryClient.invalidateQueries({ queryKey: ['studio', 'audio', 'collections'] })
        }}
      />
      <ItemDialog
        open={itemDialog.open}
        collection={itemDialog.collection}
        item={itemDialog.item}
        onOpenChange={(open) => setItemDialog((state) => ({ ...state, open }))}
        onSaved={async () => {
          setItemDialog({ open: false, collection: null, item: null })
          await queryClient.invalidateQueries({ queryKey: ['studio', 'audio', 'collections'] })
        }}
      />
    </StudioLayout>
  )
}

function CollectionManager({
  kind,
  collections,
  selectedCollection,
  onSelect,
  onEdit,
  onCreateItem,
  onEditItem,
}: {
  kind: AudioCollectionKind
  collections: AudioCollectionSummary[]
  selectedCollection: AudioCollectionSummary | null
  onSelect: (id: string) => void
  onEdit: (collection: AudioCollectionSummary) => void
  onCreateItem: (collection: AudioCollectionSummary) => void
  onEditItem: (item: AudioItemSummary, collection: AudioCollectionSummary) => void
}) {
  const queryClient = useQueryClient()
  const collectionDetailQuery = useQuery({
    ...audioCollectionDetailQueryOptions(selectedCollection?.creator.username ?? '', selectedCollection?.slug ?? ''),
    enabled: Boolean(selectedCollection),
  })
  const deleteCollectionMutation = useMutation({
    mutationFn: deleteAudioCollection,
    onSuccess: async () => {
      toast.success('Collection deleted.')
      await queryClient.invalidateQueries({ queryKey: ['studio', 'audio', 'collections'] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete collection.'),
  })
  const Icon = kind === 'album' ? Disc3 : Podcast

  if (collections.length === 0) {
    return (
      <div className="rounded-lg border bg-card/30 p-8 text-center">
        <Icon className="mx-auto text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-base font-semibold">No {kind === 'album' ? 'albums' : 'podcasts'} yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a {kind === 'album' ? 'music album' : 'podcast playlist'} before uploading {kind === 'album' ? 'tracks' : 'episodes'}.
        </p>
      </div>
    )
  }

  const items = collectionDetailQuery.data?.items ?? []

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {collections.map((collection) => (
          <button
            key={collection.id}
            type="button"
            className={cn(
              'flex min-h-20 gap-3 rounded-2xl border bg-card/40 p-3 text-left transition-colors hover:bg-card',
              selectedCollection?.id === collection.id && 'border-primary/50 bg-primary/10',
            )}
            onClick={() => onSelect(collection.id)}
          >
            <div className="size-14 shrink-0 overflow-hidden rounded-xl border bg-background">
              {collection.coverUrl ? (
                <img src={collection.coverUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <Icon aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{collection.title}</p>
              <p className="text-xs text-muted-foreground">{collection.itemCount} items</p>
              <Badge variant={collection.status === 'published' ? 'secondary' : 'outline'} className="mt-2 normal-case tracking-normal">
                {collection.status}
              </Badge>
            </div>
          </button>
        ))}
      </div>

      {selectedCollection && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="normal-case tracking-normal">{selectedCollection.title}</CardTitle>
                <CardDescription>
                  {kind === 'album' ? 'Manage tracks and album order.' : 'Manage episodes and podcast order.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onEdit(selectedCollection)}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
                <Button type="button" size="sm" onClick={() => onCreateItem(selectedCollection)}>
                  <Plus data-icon="inline-start" />
                  Add {kind === 'album' ? 'track' : 'episode'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedCollection.itemCount > 0 || deleteCollectionMutation.isPending}
                  onClick={() => deleteCollectionMutation.mutate(selectedCollection.id)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {collectionDetailQuery.isPending ? (
              <LoadingBlock label="Loading audio items" />
            ) : (
              <SortableAudioItems
                collection={selectedCollection}
                items={items}
                onEditItem={(item) => onEditItem(item, selectedCollection)}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SortableAudioItems({
  collection,
  items,
  onEditItem,
}: {
  collection: AudioCollectionSummary
  items: AudioItemSummary[]
  onEditItem: (item: AudioItemSummary) => void
}) {
  const queryClient = useQueryClient()
  const itemSignature = items.map((item) => item.id).join(':')
  const [localItems, setLocalItems] = useState<{
    collectionId: string
    signature: string
    items: AudioItemSummary[]
  } | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const displayedItems = localItems?.collectionId === collection.id && localItems.signature === itemSignature
    ? localItems.items
    : items
  const reorderMutation = useMutation({
    mutationFn: (itemIds: string[]) => reorderAudioItems(collection.id, itemIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['studio', 'audio', 'collections'] }),
        queryClient.invalidateQueries({ queryKey: audioKeys.collection(collection.creator.username, collection.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to reorder audio.'),
  })
  const deleteItemMutation = useMutation({
    mutationFn: deleteAudioItem,
    onSuccess: async () => {
      toast.success('Audio item deleted.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['studio', 'audio', 'collections'] }),
        queryClient.invalidateQueries({ queryKey: audioKeys.collection(collection.creator.username, collection.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete audio item.'),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayedItems.findIndex((item) => item.id === active.id)
    const newIndex = displayedItems.findIndex((item) => item.id === over.id)
    const nextItems = arrayMove(displayedItems, oldIndex, newIndex)
    setLocalItems({ collectionId: collection.id, signature: itemSignature, items: nextItems })
    reorderMutation.mutate(nextItems.map((item) => item.id))
  }

  if (displayedItems.length === 0) {
    return (
      <div className="rounded-2xl border bg-card/30 p-6 text-sm text-muted-foreground">
        No {collection.kind === 'album' ? 'tracks' : 'episodes'} yet.
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={displayedItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {displayedItems.map((item) => (
            <SortableAudioRow
              key={item.id}
              item={item}
              onEdit={() => onEditItem(item)}
              onDelete={() => deleteItemMutation.mutate(item.id)}
              deleting={deleteItemMutation.isPending}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableAudioRow({
  item,
  onEdit,
  onDelete,
  deleting,
}: {
  item: AudioItemSummary
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = useMemo(() => ({ transform: CSS.Transform.toString(transform), transition }), [transform, transition])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center gap-3 rounded-2xl border bg-card/40 p-3', isDragging && 'opacity-70')}
    >
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${item.title}`} {...attributes} {...listeners}>
        <GripVertical />
      </Button>
      <div className="size-12 shrink-0 overflow-hidden rounded-xl border bg-background">
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Headphones aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatAudioDuration(item.durationSeconds)} · {item.status}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${item.title}`}>
        <Pencil />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} disabled={deleting} aria-label={`Delete ${item.title}`}>
        <Trash2 />
      </Button>
    </div>
  )
}

function CollectionDialog({
  kind,
  open,
  collection,
  onOpenChange,
  onSaved,
}: {
  kind: AudioCollectionKind
  open: boolean
  collection: AudioCollectionSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const form = useForm<AudioCollectionFormValues>({
    resolver: zodResolver(audioCollectionSchema),
    values: collection ? {
      kind: collection.kind,
      title: collection.title,
      description: collection.description,
      status: collection.status,
      releaseDate: collection.releaseDate ? new Date(collection.releaseDate * 1000).toISOString().slice(0, 10) : '',
      cover: null,
      hasExistingCover: Boolean(collection.coverUrl),
    } : { ...defaultCollectionValues, kind },
  })
  const saveMutation = useMutation({
    mutationFn: (values: AudioCollectionFormValues) => {
      const formData = new FormData()
      formData.append('kind', values.kind)
      formData.append('title', values.title)
      formData.append('description', values.description)
      formData.append('status', values.status)
      if (values.releaseDate) formData.append('releaseDate', values.releaseDate)
      if (values.cover) formData.append('cover', values.cover)
      return collection ? updateAudioCollection(collection.id, formData) : createAudioCollection(formData)
    },
    onSuccess: async () => {
      toast.success(collection ? 'Collection updated.' : 'Collection created.')
      await onSaved()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save collection.'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{collection ? 'Edit collection' : `New ${kind}`}</DialogTitle>
          <DialogDescription>Published collections need a cover photo before members can browse them.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl><Input {...field} placeholder={kind === 'album' ? 'Album title' : 'Podcast title'} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} rows={4} placeholder="What should members know before listening?" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="releaseDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Release date</FormLabel>
                  <FormControl><Input {...field} type="date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="cover" render={({ field }) => (
              <FormItem>
                <FormLabel>Cover photo</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => field.onChange(event.target.files?.[0] ?? null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function ItemDialog({
  open,
  collection,
  item,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  collection: AudioCollectionSummary | null
  item: AudioItemSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const form = useForm<AudioItemFormValues>({
    resolver: zodResolver(audioItemSchema),
    values: collection ? {
      collectionId: collection.id,
      title: item?.title ?? '',
      description: item?.description ?? '',
      status: item?.status ?? 'draft',
      durationSeconds: item?.durationSeconds ?? null,
      audio: null,
      cover: null,
      hasExistingAudio: Boolean(item?.streamUrl),
      hasExistingCover: Boolean(item?.coverUrl),
      hasCollectionCover: Boolean(collection.coverUrl),
    } : defaultItemValues,
  })
  const status = useWatch({ control: form.control, name: 'status' })
  const saveMutation = useMutation({
    mutationFn: (values: AudioItemFormValues) => {
      const formData = new FormData()
      formData.append('collectionId', values.collectionId)
      formData.append('title', values.title)
      formData.append('description', values.description)
      formData.append('status', values.status)
      if (values.durationSeconds !== null && values.durationSeconds !== undefined) {
        formData.append('durationSeconds', String(values.durationSeconds))
      }
      if (values.audio) formData.append('audio', values.audio)
      if (values.cover) formData.append('cover', values.cover)
      return item ? updateAudioItem(item.id, formData) : createAudioItem(formData)
    },
    onSuccess: async () => {
      toast.success(item ? 'Audio updated.' : 'Audio uploaded.')
      await onSaved()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save audio.'),
  })
  const label = collection?.kind === 'album' ? 'track' : 'episode'

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${label}` : `Add ${label}`}</DialogTitle>
          <DialogDescription>
            {status === 'published'
              ? 'Published audio needs an audio file and a cover. Collection covers can be reused.'
              : 'Drafts can be saved before all assets are ready.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl><Input {...field} placeholder={collection?.kind === 'album' ? 'Track title' : 'Episode title'} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} rows={4} placeholder="Notes for members" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="durationSeconds" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration seconds</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="audio" render={({ field }) => (
                <FormItem>
                  <FormLabel>Audio file</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm"
                      onChange={(event) => field.onChange(event.target.files?.[0] ?? null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cover" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cover override</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => field.onChange(event.target.files?.[0] ?? null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {item?.status === 'draft' && collection?.status === 'published' && (
                <Button type="button" variant="outline" onClick={() => setScheduleOpen(true)}><CalendarClock data-icon="inline-start" /> Schedule</Button>
              )}
              <Button type="submit" disabled={!collection || saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    {item && <ScheduleDialog postId={item.postId} open={scheduleOpen} onOpenChange={setScheduleOpen} onScheduled={onSaved} />}
    </>
  )
}
