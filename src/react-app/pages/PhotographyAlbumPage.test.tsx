import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PhotographyAlbumPage } from './PhotographyAlbumPage'
import * as api from '../lib/api'
import type { PhotographyAlbumDetailResponse, PhotographyAlbumSummary, PhotographyPhotoSummary } from '../lib/photography'

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(),
  apiPostRequired: vi.fn(),
  apiDeleteRequired: vi.fn(),
  apiPatchRequired: vi.fn(),
  apiPutRequired: vi.fn(),
}))

const mockApiGetRequired = vi.mocked(api.apiGetRequired)

describe('PhotographyAlbumPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGetRequired.mockResolvedValue(makeAlbumDetail())
  })

  it('moves between photos with controls, keyboard arrows, and swipe gestures', async () => {
    const user = userEvent.setup()
    renderPhotographyAlbumPage()

    await user.click(await screen.findByRole('button', { name: 'First photo' }))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous photo' }))
    expect(screen.getByText('Photo 2 of 3')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    const imageSurface = within(dialog).getByRole('img', { name: 'Second photo' }).parentElement
    expect(imageSurface).not.toBeNull()

    fireEvent.pointerDown(imageSurface as HTMLElement, { clientX: 320, clientY: 120 })
    fireEvent.pointerUp(imageSurface as HTMLElement, { clientX: 120, clientY: 126 })
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
  })
})

function renderPhotographyAlbumPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PhotographyAlbumPage username="ali" slug="desert-light" />
    </QueryClientProvider>,
  )
}

function makeAlbumDetail(): PhotographyAlbumDetailResponse {
  const author = {
    id: 'creator-1',
    displayName: 'Ali',
    username: 'ali',
    avatarUrl: '/avatar.jpg',
  }
  const photos = [
    makePhoto('photo-1', 'First photo', 0),
    makePhoto('photo-2', 'Second photo', 1),
    makePhoto('photo-3', 'Third photo', 2),
  ]
  const album: PhotographyAlbumSummary = {
    id: 'album-1',
    postId: 'post-1',
    type: 'photography',
    slug: 'desert-light',
    title: 'Desert light',
    description: 'Warm field notes.',
    status: 'published',
    downloadsEnabled: true,
    shootDate: null,
    coverPhotoId: 'photo-1',
    coverUrl: '/api/photography/photos/photo-1/preview',
    photoCount: photos.length,
    photos,
    publishedAt: 1_700_000_000,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    author,
    likeCount: 0,
    replyCount: 0,
    viewerLiked: false,
    viewerSaved: false,
  }

  return { album, photos, replies: [] }
}

function makePhoto(id: string, title: string, displayOrder: number): PhotographyPhotoSummary {
  return {
    id,
    albumId: 'album-1',
    title,
    caption: '',
    altText: title,
    status: 'published',
    previewUrl: `/api/photography/photos/${id}/preview`,
    displayUrl: `/api/photography/photos/${id}/original`,
    originalUrl: `/api/photography/photos/${id}/original`,
    originalContentType: 'image/jpeg',
    originalFileName: `${id}.jpg`,
    originalSizeBytes: 1000,
    originalDownloadEnabled: true,
    width: 1600,
    height: 1000,
    displayOrder,
    createdAt: 1_700_000_000 + displayOrder,
    updatedAt: 1_700_000_000 + displayOrder,
  }
}
