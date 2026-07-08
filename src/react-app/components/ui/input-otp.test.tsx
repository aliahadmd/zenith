import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InputOTP, InputOTPGroup, InputOTPSlot } from './input-otp'

describe('InputOTP', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.activeElement ?? document.body),
    })
  })

  it('renders typed and pasted digits in the OTP slots', async () => {
    const user = userEvent.setup()
    render(<OtpHarness />)

    const input = screen.getByLabelText('Verification code', { exact: true })

    await user.click(input)
    expect(input).toHaveFocus()
    await user.keyboard('123456')

    expect(slotValue()).toBe('123456')

    await user.click(input)
    await user.paste('987-654')

    expect(slotValue()).toBe('987654')

    await user.keyboard('{Backspace}')

    expect(slotValue()).toBe('98765')
  })
})

function slotValue() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('[data-input-otp]'))
    .map((input) => input.value)
    .join('')
}

function OtpHarness() {
  const [value, setValue] = useState('')

  return (
    <div>
      <label htmlFor="otp-code">Verification code</label>
      <InputOTP id="otp-code" maxLength={6} value={value} onChange={setValue}>
        <InputOTPGroup data-testid="otp-slots">
          {Array.from({ length: 6 }).map((_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  )
}
