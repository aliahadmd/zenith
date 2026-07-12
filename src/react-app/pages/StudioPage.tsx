import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileText, BookOpen, Camera, GraduationCap, Headphones } from 'lucide-react'
import { ContentTypeCard } from '../components/ContentTypeCard'
import { ShortPostComposer } from '../components/ShortPostComposer'
import { StudioLayout } from '../components/StudioLayout'
import { useQuery } from '@tanstack/react-query'
import { apiGetRequired } from '../lib/api'
import { Badge } from '../components/ui/badge'

export function StudioPage() {
  const navigate = useNavigate()
  const [composerOpen, setComposerOpen] = useState(false)
  const moderatedQuery = useQuery({
    queryKey: ['studio', 'moderated-content'],
    queryFn: () => apiGetRequired<{ items: Array<{ id: string; kind: string; body: string; moderationReason: string | null }> }>('/api/posts/moderated/mine'),
  })

  return (
    <StudioLayout
      title="Studio"
      description="Choose a content type to start creating."
      contentClassName="max-w-3xl"
    >
      {moderatedQuery.data?.items.length ? (
        <section className="mb-6 border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold">Content under moderation</h2>
          <div className="mt-3 grid gap-3">
            {moderatedQuery.data.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 border-t pt-3 first:border-t-0 first:pt-0">
                <div className="min-w-0"><p className="truncate text-sm">{item.body || 'Untitled content'}</p><p className="mt-1 text-xs text-muted-foreground">{item.moderationReason || 'Hidden by the moderation team.'} Editing, publishing, and deletion are disabled until restoration.</p></div>
                <Badge variant="destructive">{item.kind}</Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <ContentTypeCard
          icon={<FileText />}
          title="Post"
          description="Share a quick thought or update with your followers. Up to 500 characters."
          onClick={() => setComposerOpen(true)}
          tone="blue"
        />

        <ContentTypeCard
          icon={<BookOpen />}
          title="Article"
          description="Write an in-depth article or essay with rich formatting and media."
          onClick={() => navigate({ to: '/studio/articles/new' })}
          tone="amber"
        />

        <ContentTypeCard
          icon={<Headphones />}
          title="Audio"
          description="Publish music albums, tracks, podcast playlists, and episodes for members."
          onClick={() => navigate({ to: '/studio/audio' })}
          tone="rose"
        />

        <ContentTypeCard
          icon={<Camera />}
          title="Photography"
          description="Publish private photo albums with web previews and optional original downloads."
          onClick={() => navigate({ to: '/studio/photography' })}
          tone="emerald"
        />

        <ContentTypeCard
          icon={<GraduationCap />}
          title="Course"
          description="Create a structured multi-lesson course to teach your audience a skill."
          onClick={() => navigate({ to: '/studio/courses' })}
          tone="violet"
        />
      </div>

      <ShortPostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
      />
    </StudioLayout>
  )
}
