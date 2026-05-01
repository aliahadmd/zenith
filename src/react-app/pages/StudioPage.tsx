import { useState } from 'react'
import { FileText, BookOpen, GraduationCap } from 'lucide-react'
import { ContentTypeCard } from '../components/ContentTypeCard'
import { ShortPostComposer } from '../components/ShortPostComposer'

export function StudioPage() {
  const [composerOpen, setComposerOpen] = useState(false)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Studio</h1>
      <p className="text-sm text-muted-foreground">
        Choose a content type to start creating.
      </p>

      <div className="grid gap-4 sm:grid-cols-1">
        <ContentTypeCard
          icon={<FileText />}
          title="Short Post"
          description="Share a quick thought or update with your followers. Up to 500 characters."
          onClick={() => setComposerOpen(true)}
        />

        <ContentTypeCard
          icon={<BookOpen />}
          title="Long Post"
          description="Write an in-depth article or essay with rich formatting and media."
          disabled
          comingSoon
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
    </div>
  )
}
