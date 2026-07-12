import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import MDEditor from '@uiw/react-md-editor'
import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  File,
  FileAudio,
  FileVideo,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { StudioLayout } from '../components/StudioLayout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import {
  courseKeys,
  createCourse,
  createCourseLesson,
  createCourseModule,
  deleteCourse,
  deleteCourseAttachment,
  deleteCourseLesson,
  deleteCourseModule,
  formatCourseFileSize,
  mineCoursesQueryOptions,
  publishCourse,
  reorderCourseLessons,
  reorderCourseModules,
  type CourseAttachmentKind,
  type CourseLesson,
  type CourseModule,
  type CourseSummary,
  unpublishCourse,
  updateCourse,
  updateCourseLesson,
  updateCourseModule,
  uploadCourseAttachment,
} from '../lib/courses'

export function CourseStudioPage({ courseId }: { courseId: string | null }) {
  const coursesQuery = useQuery(mineCoursesQueryOptions())

  if (courseId === null) {
    return <CourseList courses={coursesQuery.data?.courses ?? []} isLoading={coursesQuery.isPending} />
  }

  if (courseId === 'new') return <NewCoursePage />

  if (coursesQuery.isPending) {
    return <StudioLayout title="Edit course" description="Loading your course."><div className="h-48 animate-pulse rounded-lg bg-muted" /></StudioLayout>
  }

  const course = coursesQuery.data?.courses.find((candidate) => candidate.id === courseId)
  if (!course) {
    return <StudioLayout title="Course not found" description="This course may have been deleted."><Button asChild><Link to="/studio/courses">Back to courses</Link></Button></StudioLayout>
  }

  return <CourseEditor key={`${course.id}-${course.updatedAt ?? 0}`} course={course} />
}

function CourseList({ courses, isLoading }: { courses: CourseSummary[]; isLoading: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteCourse,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.mine })
      toast.success('Course deleted.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete course.'),
  })

  return (
    <StudioLayout
      title="Courses"
      description="Build structured lessons for your subscribers."
      action={<Button type="button" onClick={() => navigate({ to: '/studio/courses/new' })}><Plus data-icon="inline-start" /> New course</Button>}
      contentClassName="max-w-4xl"
    >
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2"><div className="h-40 animate-pulse rounded-lg bg-muted" /><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpenCheck className="size-10 text-muted-foreground" />
            <div><p className="font-medium">No courses yet</p><p className="mt-1 text-sm text-muted-foreground">Start with a title, then add modules and lessons.</p></div>
            <Button type="button" onClick={() => navigate({ to: '/studio/courses/new' })}><Plus data-icon="inline-start" /> Create a course</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((course) => {
            const lessonCount = course.modules?.flatMap((module) => module.lessons).length ?? 0
            return (
              <Card key={course.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><CardTitle className="truncate">{course.title}</CardTitle><CardDescription className="mt-1 line-clamp-2">{course.description || 'No description yet.'}</CardDescription></div>
                    <Badge variant={course.status === 'published' ? 'default' : 'secondary'}>{course.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="mt-auto flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>{lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}</span>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm"><Link to="/studio/courses/$courseId/edit" params={{ courseId: course.id }}>Edit</Link></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${course.title}`} onClick={() => { if (window.confirm('Delete this course?')) deleteMutation.mutate(course.id) }} disabled={deleteMutation.isPending}><Trash2 /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </StudioLayout>
  )
}

function NewCoursePage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const createMutation = useMutation({
    mutationFn: () => createCourse({ title, description }),
    onSuccess: ({ course }) => {
      navigate({ to: '/studio/courses/$courseId/edit', params: { courseId: course.id } })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to create course.'),
  })

  return (
    <StudioLayout title="New course" description="Set the course basics, then build its modules and lessons." contentClassName="max-w-3xl">
      <Card>
        <CardHeader><CardTitle>Course details</CardTitle><CardDescription>These details appear on your creator profile and course page.</CardDescription></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return toast.error('Add a course title.'); createMutation.mutate() }}>
            <label className="grid gap-2 text-sm font-medium">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Build your first portfolio" maxLength={140} /></label>
            <label className="grid gap-2 text-sm font-medium">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will subscribers learn?" maxLength={2000} rows={5} /></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />} Create draft</Button><Button type="button" variant="ghost" asChild><Link to="/studio/courses">Cancel</Link></Button></div>
          </form>
        </CardContent>
      </Card>
    </StudioLayout>
  )
}

function CourseEditor({ course }: { course: CourseSummary }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(course.modules?.[0]?.lessons?.[0]?.id ?? null)
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [newLessonTitles, setNewLessonTitles] = useState<Record<string, string>>({})
  const [uploadProgress, setUploadProgress] = useState<{ lessonId: string; percent: number } | null>(null)

  const selectedLesson = useMemo(() => course.modules?.flatMap((module) => module.lessons).find((lesson) => lesson.id === selectedLessonId) ?? null, [course, selectedLessonId])
  const invalidate = () => queryClient.invalidateQueries({ queryKey: courseKeys.mine })
  const saveMutation = useMutation({ mutationFn: () => updateCourse(course.id, { title, description }), onSuccess: async () => { await invalidate(); toast.success('Course saved.') }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save course.') })
  const publishMutation = useMutation({ mutationFn: () => course.status === 'published' ? unpublishCourse(course.id) : publishCourse(course.id), onSuccess: async () => { await invalidate(); toast.success(course.status === 'published' ? 'Course moved to draft.' : 'Course published.') }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update course status.') })
  const moduleMutation = useMutation({ mutationFn: (values: { title: string }) => createCourseModule(course.id, values), onSuccess: async () => { setNewModuleTitle(''); await invalidate() }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to add module.') })
  const deleteModuleMutation = useMutation({ mutationFn: deleteCourseModule, onSuccess: invalidate, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete module.') })
  const lessonMutation = useMutation({ mutationFn: ({ moduleId, title: lessonTitle }: { moduleId: string; title: string }) => createCourseLesson(moduleId, { title: lessonTitle }), onSuccess: async ({ lesson }) => { setNewLessonTitles({}); setSelectedLessonId(lesson.id); await invalidate() }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to add lesson.') })
  const deleteLessonMutation = useMutation({ mutationFn: deleteCourseLesson, onSuccess: async () => { setSelectedLessonId(null); await invalidate() }, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete lesson.') })
  const uploadMutation = useMutation({
    mutationFn: ({ lessonId, file, kind }: { lessonId: string; file: File; kind: CourseAttachmentKind }) => uploadCourseAttachment(lessonId, file, kind, (percent) => setUploadProgress({ lessonId, percent })),
    onSuccess: async () => { setUploadProgress(null); await invalidate(); toast.success('Attachment uploaded.') },
    onError: (error) => { setUploadProgress(null); toast.error(error instanceof Error ? error.message : 'Unable to upload attachment.') },
  })
  const deleteAttachmentMutation = useMutation({ mutationFn: deleteCourseAttachment, onSuccess: invalidate, onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete attachment.') })

  const moveModule = (index: number, direction: -1 | 1) => {
    const modules = course.modules ?? []
    const target = index + direction
    if (target < 0 || target >= modules.length) return
    const ids = modules.map((module) => module.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderCourseModules(course.id, ids).then(invalidate).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to reorder modules.'))
  }

  const moveLesson = (module: CourseModule, index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= module.lessons.length) return
    const ids = module.lessons.map((lesson) => lesson.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderCourseLessons(module.id, ids).then(invalidate).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to reorder lessons.'))
  }

  return (
    <StudioLayout
      title="Edit course"
      description="Save drafts while you build. Publish when the course has ready lessons."
      action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}><Save data-icon="inline-start" /> Save draft</Button><Button type="button" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>{publishMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}{course.status === 'published' ? 'Move to draft' : 'Publish'}</Button></div>}
      contentClassName="max-w-5xl"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>Course details</CardTitle><CardDescription>Keep the promise clear and specific.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="grid gap-2 text-sm font-medium">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} /></label>
              <label className="grid gap-2 text-sm font-medium">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} /></label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Course structure</CardTitle><CardDescription>Organize lessons into modules. Only published lessons are visible to members.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {(course.modules ?? []).map((module, moduleIndex) => (
                <div key={module.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Input defaultValue={module.title} aria-label={`Module ${moduleIndex + 1} title`} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== module.title) updateCourseModule(module.id, { title: event.target.value }).then(invalidate).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to update module.')) }} />
                      <Input defaultValue={module.description ?? ''} placeholder="Optional module description" aria-label={`Module ${moduleIndex + 1} description`} onBlur={(event) => { if (event.target.value !== (module.description ?? '')) updateCourseModule(module.id, { description: event.target.value }).then(invalidate).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to update module.')) }} />
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Move module up" onClick={() => moveModule(moduleIndex, -1)} disabled={moduleIndex === 0}><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Move module down" onClick={() => moveModule(moduleIndex, 1)} disabled={moduleIndex === (course.modules?.length ?? 1) - 1}><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${module.title}`} onClick={() => { if (window.confirm('Delete this module and its lessons?')) deleteModuleMutation.mutate(module.id) }}><Trash2 /></Button>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    {module.lessons.map((lesson, lessonIndex) => (
                      <div key={lesson.id} role="button" tabIndex={0} className={`flex items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${selectedLessonId === lesson.id ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'}`} onClick={() => setSelectedLessonId(lesson.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLessonId(lesson.id) } }}>
                        <BookOpenCheck className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.title}</span>
                        <Badge variant={lesson.status === 'published' ? 'default' : 'secondary'}>{lesson.status}</Badge>
                        <span className="text-xs text-muted-foreground">{lesson.attachments.length}</span>
                        <span onClick={(event) => event.stopPropagation()} className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label="Move lesson up" onClick={() => moveLesson(module, lessonIndex, -1)} disabled={lessonIndex === 0}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Move lesson down" onClick={() => moveLesson(module, lessonIndex, 1)} disabled={lessonIndex === module.lessons.length - 1}><ArrowDown /></Button></span>
                      </div>
                    ))}
                    <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); const value = newLessonTitles[module.id]?.trim(); if (!value) return; lessonMutation.mutate({ moduleId: module.id, title: value }) }}>
                      <Input value={newLessonTitles[module.id] ?? ''} onChange={(event) => setNewLessonTitles((current) => ({ ...current, [module.id]: event.target.value }))} placeholder="New lesson title" aria-label={`New lesson for ${module.title}`} />
                      <Button type="submit" variant="outline" size="icon" aria-label={`Add lesson to ${module.title}`}><Plus /></Button>
                    </form>
                  </div>
                </div>
              ))}
              <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!newModuleTitle.trim()) return; moduleMutation.mutate({ title: newModuleTitle.trim() }) }}>
                <Input value={newModuleTitle} onChange={(event) => setNewModuleTitle(event.target.value)} placeholder="New module title" aria-label="New module title" />
                <Button type="submit" variant="outline"><Plus data-icon="inline-start" /> Add module</Button>
              </form>
            </CardContent>
          </Card>

          {selectedLesson && <LessonEditor key={selectedLesson.id} lesson={selectedLesson} uploadProgress={uploadProgress?.lessonId === selectedLesson.id ? uploadProgress.percent : null} onSave={(values) => updateCourseLesson(selectedLesson.id, values).then(invalidate).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to save lesson.'))} onDelete={() => { if (window.confirm('Delete this lesson?')) deleteLessonMutation.mutate(selectedLesson.id) }} onUpload={(file, kind) => uploadMutation.mutate({ lessonId: selectedLesson.id, file, kind })} onDeleteAttachment={(attachmentId) => deleteAttachmentMutation.mutate(attachmentId)} />}
        </div>

        <aside className="min-w-0">
          <Card className="sticky top-6">
            <CardHeader><CardTitle>Publishing checklist</CardTitle><CardDescription>{course.status === 'published' ? 'Members can access published lessons now.' : 'This course is private until published.'}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <ChecklistItem done={Boolean(course.title.trim())} label="Course title" />
              <ChecklistItem done={(course.modules?.length ?? 0) > 0} label="At least one module" />
              <ChecklistItem done={(course.modules?.flatMap((module) => module.lessons).some((lesson) => lesson.status === 'published')) ?? false} label="One published lesson" />
              <p className="pt-2 text-xs leading-5 text-muted-foreground">Non-members can see the course outline. Lesson content and attachments stay locked behind an active membership.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </StudioLayout>
  )
}

function LessonEditor({
  lesson,
  uploadProgress,
  onSave,
  onDelete,
  onUpload,
  onDeleteAttachment,
}: {
  lesson: CourseLesson
  uploadProgress: number | null
  onSave: (values: { title?: string; summary?: string; markdown?: string; status?: 'draft' | 'published' }) => void
  onDelete: () => void
  onUpload: (file: File, kind: CourseAttachmentKind) => void
  onDeleteAttachment: (attachmentId: string) => void
}) {
  const [title, setTitle] = useState(lesson.title)
  const [summary, setSummary] = useState(lesson.summary ?? '')
  const [markdown, setMarkdown] = useState(lesson.markdown ?? '')
  const uploadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const kind: CourseAttachmentKind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file'
    onUpload(file, kind)
  }

  return (
    <Card>
      <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Lesson editor</CardTitle><CardDescription>Write the lesson and attach supporting media.</CardDescription></div><Button type="button" variant="ghost" size="icon-sm" aria-label="Delete lesson" onClick={onDelete}><Trash2 /></Button></div></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <label className="grid gap-2 text-sm font-medium">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} /></label>
        <label className="grid gap-2 text-sm font-medium">Summary<Textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} rows={3} /></label>
        <div className="grid gap-2 text-sm font-medium"><span>Lesson content</span><div data-color-mode="light"><MDEditor value={markdown} onChange={(value) => setMarkdown(value ?? '')} height={300} preview="edit" /></div></div>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Attachments</p><p className="text-xs text-muted-foreground">Video, audio, or downloadable files.</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"><Upload className="size-4" /> Add file<input type="file" className="sr-only" accept="video/*,audio/*,.pdf,.zip,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={uploadFile} disabled={uploadProgress !== null} /></label></div>
          {uploadProgress !== null && <div className="rounded-md border bg-muted/30 p-3 text-sm"><div className="flex items-center justify-between"><span>Uploading attachment</span><span>{uploadProgress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-primary transition-transform duration-200 ease-[var(--ease-out)]" style={{ transform: `scaleX(${uploadProgress / 100})` }} /></div></div>}
          {lesson.attachments.length > 0 && <div className="flex flex-col gap-2">{lesson.attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-3 rounded-md border px-3 py-2"><AttachmentIcon kind={attachment.kind} /><span className="min-w-0 flex-1 truncate text-sm">{attachment.fileName}</span><span className="text-xs text-muted-foreground">{formatCourseFileSize(attachment.sizeBytes)}</span><Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${attachment.fileName}`} onClick={() => onDeleteAttachment(attachment.id)}><Trash2 /></Button></div>)}</div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Badge variant={lesson.status === 'published' ? 'default' : 'secondary'}>{lesson.status}</Badge><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => onSave({ title, summary, markdown, status: 'draft' })}><Save data-icon="inline-start" /> Save draft</Button><Button type="button" onClick={() => onSave({ title, summary, markdown, status: 'published' })}><Send data-icon="inline-start" /> Publish lesson</Button></div></div>
      </CardContent>
    </Card>
  )
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${done ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden="true" /><span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span></div>
}

function AttachmentIcon({ kind }: { kind: CourseAttachmentKind }) {
  if (kind === 'video') return <FileVideo className="size-4 shrink-0 text-primary" />
  if (kind === 'audio') return <FileAudio className="size-4 shrink-0 text-primary" />
  return <File className="size-4 shrink-0 text-primary" />
}
