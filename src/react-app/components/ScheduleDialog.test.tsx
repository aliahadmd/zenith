import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScheduleDialog } from './ScheduleDialog'
import * as schedules from '../lib/schedules'

vi.mock('../lib/schedules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/schedules')>()
  return { ...actual, saveSchedule: vi.fn() }
})

const save = vi.mocked(schedules.saveSchedule)

describe('ScheduleDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    save.mockResolvedValue({ schedule: null })
  })

  it('converts browser-local input to UTC and closes after scheduling', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const future = new Date(Date.now() + 60 * 60_000)
    const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    renderDialog(onOpenChange)
    fireEvent.change(screen.getByLabelText('Publication time'), { target: { value: local } })
    await user.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('post-1', new Date(local).toISOString()))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByText(Intl.DateTimeFormat().resolvedOptions().timeZone)).toBeInTheDocument()
  })
})

function renderDialog(onOpenChange: (open: boolean) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ScheduleDialog postId="post-1" open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  )
}
