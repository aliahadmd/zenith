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
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Camera, GripVertical, ImagePlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import {
  createPhotographyAlbum,
  deletePhotographyAlbum,
  deletePhotographyPhoto,
  minePhotographyAlbumsQueryOptions,
  photographyKeys,
  reorderPhotographyPhotos,
  updatePhotographyAlbum,
  updatePhotographyPhoto,
  uploadPhotographyPhotos,
  type PhotographyAlbumSummary,
  type PhotographyPhotoSummary,
} from '../lib/photography'
import {
  photographyAlbumSchema,
  photographyPhotoEditSchema,
  photographyPhotoUploadSchema,
  type PhotographyAlbumFormValues,
  type PhotographyPhotoEditFormValues,
  type PhotographyPhotoUploadFormValues,
} from '../lib/schemas'
import { cn } from '../lib/utils'
import { LoadingBlock } from '../components/LoadingBlock'
import { StudioLayout } from '../components/StudioLayout'
import { ScheduleDialog } from '../components/ScheduleDialog'
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
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'

const defaultAlbumValues: PhotographyAlbumFormValues = {
  title: '',
  description: '',
  status: 'draft',
  shootDate: '',
  downloadsEnabled: false,
  coverPhotoId: null,
  hasPhotos: false,
}

const defaultUploadValues: PhotographyPhotoUploadFormValues = {
  previews: [],
  originals: [],
  title: '',
  caption: '',
  altText: '',
  originalDownloadEnabled: false,
}

const defaultPhotoEditValues: PhotographyPhotoEditFormValues = {
  title: '',
  caption: '',
  altText: '',
  status: 'published',
  originalDownloadEnabled: false,
  preview: null,
  original: null,
}

export function StudioPhotographyPage() {
  const queryClient = useQueryClient()
  const [albumDialog, setAlbumDialog] = useState<{ open: boolean; album: PhotographyAlbumSummary | null }>({ open: false, album: null })
  const [uploadDialog, setUploadDialog] = useState<{ open: boolean; album: PhotographyAlbumSummary | null }>({ open: false, album: null })
  const [photoDialog, setPhotoDialog] = useState<{ open: boolean; photo: PhotographyPhotoSummary | null }>({ open: false, photo: null })
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const albumsQuery = useQuery(minePhotographyAlbumsQueryOptions())

  if (albumsQuery.isPending) return <LoadingBlock label="Loading photography studio" />
  if (albumsQuery.isError) {
    return (
      <StudioLayout title="Photography" description="Manage member-only albums and original downloads." contentClassName="max-w-5xl">
        <Card><CardContent><p className="text-sm text-muted-foreground">{albumsQuery.error.message}</p></CardContent></Card>
      </StudioLayout>
    )
  }

  const albums = albumsQuery.data?.albums ?? []
  const selectedAlbum = albums.find((album) => album.id === selectedAlbumId) ?? albums[0] ?? null

  return (
    <StudioLayout
      title="Photography"
      description="Publish private albums with web previews and optional original downloads."
      contentClassName="max-w-5xl"
      action={(
        <Button type="button" className="rounded-full" onClick={() => setAlbumDialog({ open: true, album: null })}>
          <Plus data-icon="inline-start" />
          New album
        </Button>
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="normal-case tracking-normal">Albums</CardTitle>
            <CardDescription>Drafts stay private until published.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {albums.length === 0 ? (
              <div className="rounded-2xl border bg-card/30 p-6 text-sm text-muted-foreground">
                Create an album before uploading photos.
              </div>
            ) : albums.map((album) => (
              <button
                key={album.id}
                type="button"
                className={cn(
                  'flex min-h-20 gap-3 rounded-2xl border bg-card/40 p-3 text-left transition-colors hover:bg-card',
                  selectedAlbum?.id === album.id && 'border-primary/50 bg-primary/10',
                )}
                onClick={() => setSelectedAlbumId(album.id)}
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-xl border bg-background">
                  {album.coverUrl ? (
                    <img src={album.coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Camera aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{album.title}</p>
                  <p className="text-xs text-muted-foreground">{album.photoCount} photos</p>
                  <Badge variant={album.status === 'published' ? 'secondary' : 'outline'} className="mt-2 normal-case tracking-normal">
                    {album.status}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {selectedAlbum ? (
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="normal-case tracking-normal">{selectedAlbum.title}</CardTitle>
                  <CardDescription>
                    Arrange photos, set a cover, and control original downloads.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAlbumDialog({ open: true, album: selectedAlbum })}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                  <Button type="button" size="sm" onClick={() => setUploadDialog({ open: true, album: selectedAlbum })}>
                    <ImagePlus data-icon="inline-start" />
                    Upload
                  </Button>
                  <DeleteAlbumButton album={selectedAlbum} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SortablePhotoGrid
                album={selectedAlbum}
                onEdit={(photo) => setPhotoDialog({ open: true, photo })}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No photography albums yet.
            </CardContent>
          </Card>
        )}
      </div>

      <AlbumDialog
        open={albumDialog.open}
        album={albumDialog.album}
        onOpenChange={(open) => setAlbumDialog((state) => ({ ...state, open }))}
        onSaved={async () => {
          setAlbumDialog({ open: false, album: null })
          await queryClient.invalidateQueries({ queryKey: photographyKeys.mine })
        }}
      />
      <UploadPhotosDialog
        open={uploadDialog.open}
        album={uploadDialog.album}
        onOpenChange={(open) => setUploadDialog((state) => ({ ...state, open }))}
        onSaved={async () => {
          setUploadDialog({ open: false, album: null })
          await queryClient.invalidateQueries({ queryKey: photographyKeys.mine })
        }}
      />
      <PhotoEditDialog
        open={photoDialog.open}
        photo={photoDialog.photo}
        onOpenChange={(open) => setPhotoDialog((state) => ({ ...state, open }))}
        onSaved={async () => {
          setPhotoDialog({ open: false, photo: null })
          await queryClient.invalidateQueries({ queryKey: photographyKeys.mine })
        }}
      />
    </StudioLayout>
  )
}

function DeleteAlbumButton({ album }: { album: PhotographyAlbumSummary }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: deletePhotographyAlbum,
    onSuccess: async () => {
      toast.success('Album deleted.')
      await queryClient.invalidateQueries({ queryKey: photographyKeys.mine })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete album.'),
  })

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={album.photoCount > 0 || mutation.isPending}
      onClick={() => mutation.mutate(album.id)}
    >
      <Trash2 data-icon="inline-start" />
      Delete
    </Button>
  )
}

function SortablePhotoGrid({
  album,
  onEdit,
}: {
  album: PhotographyAlbumSummary
  onEdit: (photo: PhotographyPhotoSummary) => void
}) {
  const queryClient = useQueryClient()
  const photos = album.photos
  const signature = photos.map((photo) => photo.id).join(':')
  const [localPhotos, setLocalPhotos] = useState<{ albumId: string; signature: string; photos: PhotographyPhotoSummary[] } | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const displayedPhotos = localPhotos?.albumId === album.id && localPhotos.signature === signature ? localPhotos.photos : photos
  const reorderMutation = useMutation({
    mutationFn: (photoIds: string[]) => reorderPhotographyPhotos(album.id, photoIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: photographyKeys.mine })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to reorder photos.'),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayedPhotos.findIndex((photo) => photo.id === active.id)
    const newIndex = displayedPhotos.findIndex((photo) => photo.id === over.id)
    const nextPhotos = arrayMove(displayedPhotos, oldIndex, newIndex)
    setLocalPhotos({ albumId: album.id, signature, photos: nextPhotos })
    reorderMutation.mutate(nextPhotos.map((photo) => photo.id))
  }

  if (displayedPhotos.length === 0) {
    return (
      <div className="rounded-2xl border bg-card/30 p-6 text-sm text-muted-foreground">
        Upload previews to build this album.
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={displayedPhotos.map((photo) => photo.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {displayedPhotos.map((photo) => (
            <SortablePhotoCard key={photo.id} photo={photo} isCover={album.coverPhotoId === photo.id} onEdit={() => onEdit(photo)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortablePhotoCard({
  photo,
  isCover,
  onEdit,
}: {
  photo: PhotographyPhotoSummary
  isCover: boolean
  onEdit: () => void
}) {
  const queryClient = useQueryClient()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id })
  const style = useMemo(() => ({ transform: CSS.Transform.toString(transform), transition }), [transform, transition])
  const deleteMutation = useMutation({
    mutationFn: deletePhotographyPhoto,
    onSuccess: async () => {
      toast.success('Photo deleted.')
      await queryClient.invalidateQueries({ queryKey: photographyKeys.mine })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete photo.'),
  })

  return (
    <div ref={setNodeRef} style={style} className={cn('group overflow-hidden rounded-2xl border bg-card/40', isDragging && 'opacity-70')}>
      <div className="relative aspect-square">
        <img src={photo.previewUrl} alt={photo.altText || photo.title || ''} className="size-full object-cover" />
        <div className="absolute left-2 top-2 flex gap-1">
          <Button type="button" variant="secondary" size="icon-sm" aria-label="Move photo" {...attributes} {...listeners}>
            <GripVertical />
          </Button>
          {isCover && <Badge className="normal-case tracking-normal">Cover</Badge>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-2">
        <p className="truncate text-xs text-muted-foreground">{photo.title || photo.caption || photo.status}</p>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit photo">
            <Pencil />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(photo.id)} aria-label="Delete photo">
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}

function AlbumDialog({
  open,
  album,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  album: PhotographyAlbumSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const form = useForm<PhotographyAlbumFormValues>({
    resolver: zodResolver(photographyAlbumSchema),
    values: album ? {
      title: album.title,
      description: album.description,
      status: album.status,
      shootDate: album.shootDate ? new Date(album.shootDate * 1000).toISOString().slice(0, 10) : '',
      downloadsEnabled: album.downloadsEnabled,
      coverPhotoId: album.coverPhotoId,
      hasPhotos: album.photos.length > 0,
    } : defaultAlbumValues,
  })
  const saveMutation = useMutation({
    mutationFn: (values: PhotographyAlbumFormValues) => {
      const formData = new FormData()
      formData.append('title', values.title)
      formData.append('description', values.description)
      formData.append('status', values.status)
      formData.append('downloadsEnabled', String(values.downloadsEnabled))
      if (values.shootDate) formData.append('shootDate', values.shootDate)
      if (values.coverPhotoId) formData.append('coverPhotoId', values.coverPhotoId)
      return album ? updatePhotographyAlbum(album.id, formData) : createPhotographyAlbum(formData)
    },
    onSuccess: async () => {
      toast.success(album ? 'Album updated.' : 'Album created.')
      await onSaved()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save album.'),
  })

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{album ? 'Edit album' : 'New photography album'}</DialogTitle>
          <DialogDescription>Published albums need at least one published photo and a cover.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl><Input {...field} placeholder="Album title" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} rows={4} placeholder="What members will see in this album" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
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
              <FormField control={form.control} name="shootDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shoot date</FormLabel>
                  <FormControl><Input {...field} type="date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            {album && album.photos.length > 0 && (
              <FormField control={form.control} name="coverPhotoId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cover photo</FormLabel>
                  <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Choose cover" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {album.photos.map((photo, index) => (
                          <SelectItem key={photo.id} value={photo.id}>
                            {photo.title || photo.caption || `Photo ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="downloadsEnabled" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <FormLabel>Allow original downloads</FormLabel>
                  <p className="text-xs text-muted-foreground">Members only see download buttons for photos that also allow downloads.</p>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              {album?.status === 'draft' && (
                <Button type="button" variant="outline" onClick={() => setScheduleOpen(true)}><CalendarClock data-icon="inline-start" /> Schedule</Button>
              )}
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    {album && <ScheduleDialog postId={album.postId} open={scheduleOpen} onOpenChange={setScheduleOpen} onScheduled={onSaved} />}
    </>
  )
}

function UploadPhotosDialog({
  open,
  album,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  album: PhotographyAlbumSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const form = useForm<PhotographyPhotoUploadFormValues>({
    resolver: zodResolver(photographyPhotoUploadSchema),
    values: defaultUploadValues,
  })
  const saveMutation = useMutation({
    mutationFn: (values: PhotographyPhotoUploadFormValues) => {
      if (!album) throw new Error('Album not selected')
      const formData = new FormData()
      for (const preview of values.previews) formData.append('previews', preview)
      for (const original of values.originals) formData.append('originals', original)
      formData.append('metadata', JSON.stringify(values.previews.map(() => ({
        title: values.title,
        caption: values.caption,
        altText: values.altText,
        originalDownloadEnabled: values.originalDownloadEnabled,
      }))))
      return uploadPhotographyPhotos(album.id, formData)
    },
    onSuccess: async () => {
      toast.success('Photos uploaded.')
      form.reset(defaultUploadValues)
      await onSaved()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to upload photos.'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload photos</DialogTitle>
          <DialogDescription>Previews are what members browse. Originals are optional private downloads.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormField control={form.control} name="previews" render={({ field }) => (
              <FormItem>
                <FormLabel>Preview photos</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => field.onChange(Array.from(event.target.files ?? []))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="originals" render={({ field }) => (
              <FormItem>
                <FormLabel>Original files</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/tiff,.tif,.tiff,.dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2"
                    multiple
                    onChange={(event) => field.onChange(Array.from(event.target.files ?? []))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title prefix</FormLabel>
                  <FormControl><Input {...field} placeholder="Optional shared title" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="altText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Alt text</FormLabel>
                  <FormControl><Input {...field} placeholder="Describe the photo set" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="caption" render={({ field }) => (
              <FormItem>
                <FormLabel>Caption</FormLabel>
                <FormControl><Textarea {...field} rows={3} placeholder="Optional caption applied to this upload batch" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="originalDownloadEnabled" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-xl border p-3">
                <FormLabel>Allow downloads for these originals</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !album}>
                {saveMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function PhotoEditDialog({
  open,
  photo,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  photo: PhotographyPhotoSummary | null
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const form = useForm<PhotographyPhotoEditFormValues>({
    resolver: zodResolver(photographyPhotoEditSchema),
    values: photo ? {
      title: photo.title,
      caption: photo.caption,
      altText: photo.altText,
      status: photo.status,
      originalDownloadEnabled: photo.originalDownloadEnabled,
      preview: null,
      original: null,
    } : defaultPhotoEditValues,
  })
  const saveMutation = useMutation({
    mutationFn: (values: PhotographyPhotoEditFormValues) => {
      if (!photo) throw new Error('Photo not selected')
      const formData = new FormData()
      formData.append('title', values.title)
      formData.append('caption', values.caption)
      formData.append('altText', values.altText)
      formData.append('status', values.status)
      formData.append('originalDownloadEnabled', String(values.originalDownloadEnabled))
      if (values.preview) formData.append('preview', values.preview)
      if (values.original) formData.append('original', values.original)
      return updatePhotographyPhoto(photo.id, formData)
    },
    onSuccess: async () => {
      toast.success('Photo updated.')
      await onSaved()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update photo.'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit photo</DialogTitle>
          <DialogDescription>Update metadata or replace the preview/original files.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            {photo && <img src={photo.previewUrl} alt="" className="aspect-video w-full rounded-xl border object-cover" />}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
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
            </div>
            <FormField control={form.control} name="caption" render={({ field }) => (
              <FormItem>
                <FormLabel>Caption</FormLabel>
                <FormControl><Textarea {...field} rows={3} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="altText" render={({ field }) => (
              <FormItem>
                <FormLabel>Alt text</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="preview" render={({ field }) => (
                <FormItem>
                  <FormLabel>Replace preview</FormLabel>
                  <FormControl><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => field.onChange(event.target.files?.[0] ?? null)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="original" render={({ field }) => (
                <FormItem>
                  <FormLabel>Replace original</FormLabel>
                  <FormControl><Input type="file" accept="image/jpeg,image/png,image/webp,image/tiff,.tif,.tiff,.dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2" onChange={(event) => field.onChange(event.target.files?.[0] ?? null)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="originalDownloadEnabled" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-xl border p-3">
                <FormLabel>Allow original download</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending || !photo}>
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
