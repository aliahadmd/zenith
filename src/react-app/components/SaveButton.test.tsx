import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SaveButton } from './SaveButton'
import * as library from '../lib/library'

vi.mock('../lib/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/library')>()
  return { ...actual, saveToLibrary: vi.fn(), removeFromLibrary: vi.fn() }
})

const save = vi.mocked(library.saveToLibrary)
const remove = vi.mocked(library.removeFromLibrary)

describe('SaveButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    save.mockResolvedValue({ saved: true })
    remove.mockResolvedValue({ saved: false })
  })

  it('optimistically saves and removes content', async () => {
    const user = userEvent.setup()
    renderButton(false)
    const button = screen.getByRole('button', { name: 'Save to library' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Remove from library' })).toBeInTheDocument()
    await waitFor(() => expect(save).toHaveBeenCalledWith('post-1'))
  })

  it('rolls back optimistic state when saving fails', async () => {
    const user = userEvent.setup()
    save.mockRejectedValue(new Error('Save failed'))
    renderButton(false)
    await user.click(screen.getByRole('button', { name: 'Save to library' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save to library' })).toBeInTheDocument())
  })
})

function renderButton(saved: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><SaveButton postId="post-1" saved={saved} /></QueryClientProvider>)
}
