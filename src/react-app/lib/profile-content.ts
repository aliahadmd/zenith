import type { ArticleSummary } from './articles'
import type { AudioItemSummary } from './audio'
import type { CourseSummary } from './courses'
import type { PhotographyAlbumSummary } from './photography'
import type { FeedPost } from './posts'

export type CreatorAllItem =
  | { key: string; kind: 'post'; post: FeedPost }
  | { key: string; kind: 'article'; article: ArticleSummary }
  | { key: string; kind: 'photography'; album: PhotographyAlbumSummary }
  | { key: string; kind: 'audio'; item: AudioItemSummary }
  | { key: string; kind: 'course'; course: CourseSummary }

export type CreatorAllContent = {
  posts: FeedPost[]
  articles: ArticleSummary[]
  photographyAlbums: PhotographyAlbumSummary[]
  audioItems: AudioItemSummary[]
  courses: CourseSummary[]
}

export function normalizeCreatorAllItems(content: CreatorAllContent): CreatorAllItem[] {
  return [
    ...content.posts.map((post) => ({ key: `post:${post.id}`, kind: 'post' as const, post })),
    ...content.articles.map((article) => ({ key: `article:${article.id}`, kind: 'article' as const, article })),
    ...content.photographyAlbums.map((album) => ({ key: `photography:${album.id}`, kind: 'photography' as const, album })),
    ...content.audioItems.map((item) => ({ key: `audio:${item.id}`, kind: 'audio' as const, item })),
    ...content.courses.map((course) => ({ key: `course:${course.id}`, kind: 'course' as const, course })),
  ]
}

export function shuffleCreatorAllItems<T>(items: T[], random: () => number = Math.random): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}
