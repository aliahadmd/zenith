import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileText, BookOpen, GraduationCap, Headphones } from 'lucide-react'
import { ContentTypeCard } from '../components/ContentTypeCard'
import { ShortPostComposer } from '../components/ShortPostComposer'
import { StudioLayout } from '../components/StudioLayout'

export function StudioPage() {
  const navigate = useNavigate()
  const [composerOpen, setComposerOpen] = useState(false)

  return (
    <StudioLayout
      title="Studio"
      description="Choose a content type to start creating."
      contentClassName="max-w-3xl"
    >
      <div className="grid gap-4">
        <ContentTypeCard
          icon={<FileText />}
          title="Post"
          description="Share a quick thought or update with your followers. Up to 500 characters."
          onClick={() => setComposerOpen(true)}
        />

        <ContentTypeCard
          icon={<BookOpen />}
          title="Article"
          description="Write an in-depth article or essay with rich formatting and media."
          onClick={() => navigate({ to: '/studio/articles/new' })}
        />

        <ContentTypeCard
          icon={<Headphones />}
          title="Audio"
          description="Publish music albums, tracks, podcast playlists, and episodes for members."
          onClick={() => navigate({ to: '/studio/audio' })}
        />

        <ContentTypeCard
          icon={<GraduationCap />}
          title="Course"
          description="Create a structured multi-lesson course to teach your audience a skill."
          disabled
          comingSoon
        />
      </div>

      <ShortPostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
      />
    </StudioLayout>
  )
}
