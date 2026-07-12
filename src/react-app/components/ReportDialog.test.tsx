import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReportDialog } from './ReportDialog'
import * as admin from '../lib/admin'

vi.mock('../lib/admin', () => ({ reportContent: vi.fn() }))

describe('ReportDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits a validated report with optional context', async () => {
    const user = userEvent.setup()
    vi.mocked(admin.reportContent).mockResolvedValue({ caseId: 'case-1', reported: true })
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><ReportDialog targetType="post" targetId="post-1" /></QueryClientProvider>)
    await user.click(screen.getByRole('button', { name: 'Report post' }))
    await user.type(screen.getByLabelText('Details (optional)'), 'Repeated unsolicited promotion')
    await user.click(screen.getByRole('button', { name: 'Submit report' }))
    expect(admin.reportContent).toHaveBeenCalledWith({ targetType: 'post', targetId: 'post-1', reason: 'spam', details: 'Repeated unsolicited promotion' })
  })
})
