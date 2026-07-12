import { useQuery } from '@tanstack/react-query'
import { Discussion } from '../components/Discussion'
import { LoadingBlock } from '../components/LoadingBlock'
import { PostCard } from '../components/PostCard'
import { postDetailQueryOptions, postKeys } from '../lib/posts'

type PostDetailPageProps = {
  username: string
  slug: string
}

export function PostDetailPage({ username, slug }: PostDetailPageProps) {
  const detailQuery = useQuery(postDetailQueryOptions(username, slug))

  if (detailQuery.isPending) return <LoadingBlock label="Loading post" />
  if (detailQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load post</p>
        <p className="text-sm">{detailQuery.error.message}</p>
      </div>
    )
  }

  const { post, replies } = detailQuery.data
  return (
    <div className="mx-auto min-h-screen max-w-[640px] border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">Post</h1>
      </header>
      <PostCard post={post} showReplyAction={false} />
      <Discussion post={post} comments={replies} detailKey={postKeys.detail(username, slug)} />
    </div>
  )
}
