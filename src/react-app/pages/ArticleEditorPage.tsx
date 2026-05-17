import { useEffect, useMemo, useState } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useForm, useWatch } from 'react-hook-form'
import { BookOpen, ImagePlus, Loader2, Save, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { articleByIdQueryOptions, articleKeys, createArticle, updateArticle } from '../lib/articles'
import { articleSchema, type ArticleFormValues } from '../lib/schemas'
import { postKeys } from '../lib/posts'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { LoadingBlock } from '../components/LoadingBlock'
import { StudioLayout } from '../components/StudioLayout'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Input } from '../components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'

type ArticleEditorPageProps = {
  postId?: string
}

const defaultValues: ArticleFormValues = {
  title: '',
  excerpt: '',
  markdown: '',
  cover: null,
  hasExistingCover: false,
  status: 'draft',
}

export function ArticleEditorPage({ postId }: ArticleEditorPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentUser } = useAuth()
  const isEditing = Boolean(postId)
  const articleQuery = useQuery({
    ...articleByIdQueryOptions(postId ?? ''),
    enabled: isEditing,
  })
  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues,
  })
  const [submitIntent, setSubmitIntent] = useState<'draft' | 'published'>('draft')
  const title = useWatch({ control: form.control, name: 'title' }) ?? ''
  const excerpt = useWatch({ control: form.control, name: 'excerpt' }) ?? ''
  const markdown = useWatch({ control: form.control, name: 'markdown' }) ?? ''
  const cover = useWatch({ control: form.control, name: 'cover' })
  const existingCover = articleQuery.data?.article.coverUrl ?? null
  const coverPreview = useMemo(() => cover ? URL.createObjectURL(cover) : existingCover, [cover, existingCover])

  useEffect(() => {
    const article = articleQuery.data?.article
    if (!article) return
    form.reset({
      title: article.title,
      excerpt: article.excerpt,
      markdown: article.markdown,
      cover: null,
      hasExistingCover: Boolean(article.coverUrl),
      status: article.status,
    })
  }, [articleQuery.data?.article, form])

  useEffect(() => () => {
    if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
  }, [coverPreview])

  const saveMutation = useMutation({
    mutationFn: (values: ArticleFormValues) => {
      const formData = new FormData()
      formData.append('title', values.title)
      formData.append('excerpt', values.excerpt)
      formData.append('markdown', values.markdown)
      formData.append('status', values.status)
      if (values.cover) formData.append('cover', values.cover)
      return postId ? updateArticle(postId, formData) : createArticle(formData)
    },
    onSuccess: async ({ article }) => {
      if (!article) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: articleKeys.creator(article.author.username) }),
        queryClient.invalidateQueries({ queryKey: articleKeys.detail(article.author.username, article.slug) }),
        queryClient.invalidateQueries({ queryKey: articleKeys.byId(article.postId) }),
      ])
      toast.success(article.status === 'published' ? 'Article published.' : 'Draft saved.')
      if (article.status === 'published') {
        await navigate({
          to: '/u/$username/article/$slug',
          params: { username: article.author.username, slug: article.slug },
        })
      } else if (!postId) {
        await navigate({ to: '/studio/articles/$postId/edit', params: { postId: article.postId } })
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save article.'),
  })

  if (articleQuery.isPending && isEditing) {
    return <LoadingBlock label="Loading article" />
  }

  if (articleQuery.isError) {
    return (
      <StudioLayout title="Article" description="Edit long-form content." contentClassName="max-w-5xl">
        <div className="rounded-lg border p-5 text-sm text-muted-foreground">{articleQuery.error.message}</div>
      </StudioLayout>
    )
  }

  return (
    <StudioLayout
      title={isEditing ? 'Edit Article' : 'New Article'}
      description="Write long-form member content with a live Markdown preview."
      contentClassName="max-w-6xl"
    >
      <Form {...form}>
        <form
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate({ ...values, status: submitIntent }))}
          noValidate
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar>
                <AvatarImage src={currentUser?.avatarUrl ?? undefined} alt={currentUser?.displayName ?? 'Creator'} />
                <AvatarFallback>{currentUser?.displayName?.slice(0, 2).toUpperCase() ?? 'CR'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{currentUser?.displayName ?? 'Creator'}</p>
                <p className="text-sm text-muted-foreground">@{currentUser?.username}</p>
              </div>
              <Badge variant="secondary" className="normal-case tracking-normal">
                <BookOpen data-icon="inline-start" />
                Article
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="outline" disabled={saveMutation.isPending} onClick={() => setSubmitIntent('draft')}>
                {saveMutation.isPending && submitIntent === 'draft' ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
                Save draft
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} onClick={() => setSubmitIntent('published')}>
                {saveMutation.isPending && submitIntent === 'published' ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}
                Publish
              </Button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
            <section className="flex min-w-0 flex-col gap-4 rounded-lg border bg-background p-4">
              <FormField
                control={form.control}
                name="cover"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cover photo</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-3">
                        {coverPreview ? (
                          <div className="relative overflow-hidden rounded-lg border">
                            <img src={coverPreview} alt="" className="aspect-[16/7] w-full object-cover" />
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="secondary"
                              className="absolute right-3 top-3"
                              onClick={() => {
                                field.onChange(null)
                                form.setValue('hasExistingCover', false)
                              }}
                              aria-label="Remove cover"
                            >
                              <X data-icon="inline-start" />
                            </Button>
                          </div>
                        ) : (
                          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/30 text-sm text-muted-foreground transition-colors hover:bg-card/60">
                            <ImagePlus />
                            Add a cover photo
                            <Input
                              className="sr-only"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) => {
                                field.onChange(event.target.files?.[0] ?? null)
                                form.setValue('hasExistingCover', false)
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={140} placeholder="Give your article a clear title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="excerpt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Excerpt</FormLabel>
                    <FormControl>
                      <Textarea {...field} maxLength={280} rows={3} placeholder="Short feed preview for members" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="markdown"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Article body</FormLabel>
                    <FormControl>
                      <div data-color-mode="dark">
                        <MDEditor
                          value={field.value}
                          onChange={(value) => field.onChange(value ?? '')}
                          preview="edit"
                          height={520}
                          textareaProps={{
                            placeholder: 'Write with Markdown...',
                            maxLength: 50_000,
                          }}
                        />
                      </div>
                    </FormControl>
                    <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>Markdown, tables, links, lists, quotes, and code are supported.</span>
                      <span>{markdown.length}/50000</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <aside className="hidden min-w-0 rounded-lg border bg-background lg:block">
              <div className="border-b px-4 py-3">
                <p className="font-medium">Preview</p>
                <p className="text-sm text-muted-foreground">This is how members will read it.</p>
              </div>
              <ArticlePreview title={title} excerpt={excerpt} markdown={markdown} coverUrl={coverPreview} />
            </aside>

            <section className="lg:hidden">
              <Tabs defaultValue="write">
                <TabsList variant="line" className="w-full justify-start rounded-none border-b">
                  <TabsTrigger value="write">Write</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="rounded-lg border bg-background">
                  <ArticlePreview title={title} excerpt={excerpt} markdown={markdown} coverUrl={coverPreview} />
                </TabsContent>
              </Tabs>
            </section>
          </div>
        </form>
      </Form>
    </StudioLayout>
  )
}

function ArticlePreview({
  title,
  excerpt,
  markdown,
  coverUrl,
}: {
  title: string
  excerpt: string
  markdown: string
  coverUrl: string | null
}) {
  return (
    <article className="max-h-[720px] overflow-y-auto">
      {coverUrl && <img src={coverUrl} alt="" className="aspect-[16/7] w-full border-b object-cover" />}
      <div className="p-5">
        <Badge variant="secondary" className="mb-4 normal-case tracking-normal">Article</Badge>
        <h1 className="text-2xl font-semibold leading-tight">{title || 'Untitled article'}</h1>
        {excerpt && <p className="mt-3 text-sm leading-6 text-muted-foreground">{excerpt}</p>}
        <div className="mt-6">
          {markdown ? (
            <MarkdownRenderer markdown={markdown} />
          ) : (
            <p className="text-sm text-muted-foreground">Start writing to see your preview.</p>
          )}
        </div>
      </div>
    </article>
  )
}
