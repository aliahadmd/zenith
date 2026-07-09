import { describe, expect, it } from 'vitest'
import { normalizeCreatorAllItems, shuffleCreatorAllItems } from './profile-content'

describe('creator profile all content', () => {
  it('normalizes each supported published content type into one stream', () => {
    const items = normalizeCreatorAllItems({
      posts: [{ id: 'post-1' } as never],
      articles: [{ id: 'article-1' } as never],
      photographyAlbums: [{ id: 'album-1' } as never],
      audioItems: [{ id: 'audio-1' } as never],
      courses: [{ id: 'course-1' } as never],
    })

    expect(items.map((item) => item.kind)).toEqual([
      'post',
      'article',
      'photography',
      'audio',
      'course',
    ])
    expect(items.map((item) => item.key)).toEqual([
      'post:post-1',
      'article:article-1',
      'photography:album-1',
      'audio:audio-1',
      'course:course-1',
    ])
  })

  it('shuffles without mutating the source array', () => {
    const source = ['a', 'b', 'c']
    const shuffled = shuffleCreatorAllItems(source, () => 0)

    expect(shuffled).toEqual(['b', 'c', 'a'])
    expect(source).toEqual(['a', 'b', 'c'])
  })
})
