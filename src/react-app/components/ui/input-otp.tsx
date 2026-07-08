import * as React from 'react'
import { MinusIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

type InputOTPContextValue = {
  activeIndex: number | null
  ariaDescribedBy?: string
  ariaInvalid?: boolean | 'false' | 'true' | 'grammar' | 'spelling'
  autoComplete: string
  className?: string
  disabled?: boolean
  focusSlot: (index: number) => void
  id?: string
  inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode']
  maxLength: number
  name?: string
  readOnly?: boolean
  required?: boolean
  setSlotRef: (index: number, node: HTMLInputElement | null) => void
  updateFromInput: (index: number, rawValue: string) => void
  updateFromPaste: (index: number, rawValue: string) => void
  value: string
}

type InputOTPProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'maxLength' | 'onChange' | 'value'
> & {
  children?: React.ReactNode
  className?: string
  containerClassName?: string
  maxLength: number
  onChange?: (value: string) => void
  onComplete?: (value: string) => void
  pasteTransformer?: (value: string) => string
  value?: string
}

const InputOTPContext = React.createContext<InputOTPContextValue | null>(null)
const DIGITS_ONLY_PATTERN = '^\\d+$'

function InputOTP({
  autoComplete = 'one-time-code',
  children,
  className,
  containerClassName,
  defaultValue,
  disabled,
  id,
  inputMode = 'numeric',
  maxLength,
  name,
  onChange,
  onComplete,
  pasteTransformer = digitsOnly,
  pattern = DIGITS_ONLY_PATTERN,
  readOnly,
  required,
  value,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: InputOTPProps) {
  const slotRefs = React.useRef<Array<HTMLInputElement | null>>([])
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const [internalValue, setInternalValue] = React.useState(() => {
    if (typeof defaultValue === 'string') return digitsOnly(defaultValue).slice(0, maxLength)
    return ''
  })
  const currentValue = value ?? internalValue
  const expression = React.useMemo(() => pattern ? new RegExp(pattern) : null, [pattern])

  const normalize = React.useCallback((rawValue: string) => {
    const transformed = pasteTransformer(rawValue)
    return Array.from(transformed)
      .filter((char) => !expression || expression.test(char))
      .join('')
      .slice(0, maxLength)
  }, [expression, maxLength, pasteTransformer])

  const focusSlot = React.useCallback((index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), maxLength - 1)
    const node = slotRefs.current[nextIndex]

    node?.focus()
    node?.select()
  }, [maxLength])

  const commitValue = React.useCallback((nextValue: string, nextFocusIndex: number) => {
    const limitedValue = nextValue.slice(0, maxLength)

    if (value === undefined) setInternalValue(limitedValue)
    onChange?.(limitedValue)
    if (limitedValue.length === maxLength && currentValue.length < maxLength) {
      onComplete?.(limitedValue)
    }
    focusSlot(nextFocusIndex)
  }, [currentValue.length, focusSlot, maxLength, onChange, onComplete, value])

  const setSlotRef = React.useCallback((index: number, node: HTMLInputElement | null) => {
    slotRefs.current[index] = node
  }, [])

  const updateFromInput = React.useCallback((index: number, rawValue: string) => {
    const text = normalize(rawValue)
    if (!text) {
      const chars = Array.from(currentValue)
      chars.splice(index, 1)
      commitValue(chars.join(''), Math.max(index - 1, 0))
      return
    }

    const chars = Array.from({ length: maxLength }, (_, charIndex) => currentValue[charIndex] ?? '')
    for (let offset = 0; offset < text.length && index + offset < maxLength; offset += 1) {
      chars[index + offset] = text[offset]
    }

    const nextValue = chars.join('')
    const nextFocusIndex = Math.min(index + text.length, maxLength - 1)
    commitValue(nextValue, nextFocusIndex)
  }, [commitValue, currentValue, maxLength, normalize])

  const updateFromPaste = React.useCallback((index: number, rawValue: string) => {
    const text = normalize(rawValue)
    if (!text) return

    const nextValue = [
      currentValue.slice(0, index),
      text,
      currentValue.slice(index + text.length),
    ].join('')
    const nextFocusIndex = Math.min(index + text.length, maxLength - 1)

    commitValue(nextValue, nextFocusIndex)
  }, [commitValue, currentValue, maxLength, normalize])

  const context = React.useMemo<InputOTPContextValue>(() => ({
    activeIndex,
    ariaDescribedBy,
    ariaInvalid,
    autoComplete,
    className,
    disabled,
    focusSlot,
    id,
    inputMode,
    maxLength,
    name,
    readOnly,
    required,
    setSlotRef,
    updateFromInput,
    updateFromPaste,
    value: currentValue,
  }), [
    activeIndex,
    ariaDescribedBy,
    ariaInvalid,
    autoComplete,
    className,
    currentValue,
    disabled,
    focusSlot,
    id,
    inputMode,
    maxLength,
    name,
    readOnly,
    required,
    setSlotRef,
    updateFromInput,
    updateFromPaste,
  ])

  return (
    <InputOTPContext.Provider value={context}>
      <div
        data-input-otp-container
        data-slot="input-otp"
        className={cn('flex items-center gap-0 has-disabled:opacity-50', containerClassName)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setActiveIndex(null)
        }}
        onFocusCapture={(event) => {
          const target = event.target as HTMLElement
          const index = target.dataset.otpIndex
          if (index) setActiveIndex(Number(index))
        }}
      >
        {children}
      </div>
    </InputOTPContext.Provider>
  )
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

function useInputOTPContext() {
  const context = React.useContext(InputOTPContext)
  if (!context) {
    throw new Error('InputOTPSlot must be used within InputOTP')
  }
  return context
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn('flex items-center', className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'children' | 'onChange' | 'onPaste' | 'value'> & {
  index: number
}) {
  const {
    activeIndex,
    ariaDescribedBy,
    ariaInvalid,
    autoComplete,
    className: inputClassName,
    disabled,
    focusSlot,
    id,
    inputMode,
    maxLength,
    name,
    readOnly,
    required,
    setSlotRef,
    updateFromInput,
    updateFromPaste,
    value,
  } = useInputOTPContext()
  const char = value[index] ?? ''
  const isFirstSlot = index === 0
  const isActive = activeIndex === index

  return (
    <input
      aria-describedby={isFirstSlot ? ariaDescribedBy : undefined}
      aria-invalid={ariaInvalid}
      aria-label={isFirstSlot ? undefined : `Verification code digit ${index + 1}`}
      autoComplete={isFirstSlot ? autoComplete : 'off'}
      className={cn(
        'relative flex size-10 shrink-0 appearance-none items-center justify-center border-y border-r border-input bg-transparent p-0 text-center text-sm text-foreground outline-none transition-all first:rounded-l-md first:border-l last:rounded-r-md',
        'focus:z-10 focus:ring-2 focus:ring-ring focus:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        inputClassName,
        className,
      )}
      data-active={isActive}
      data-input-otp
      data-otp-index={index}
      data-slot="input-otp-slot"
      disabled={disabled}
      id={isFirstSlot ? id : undefined}
      inputMode={inputMode}
      maxLength={maxLength}
      name={isFirstSlot ? name : undefined}
      onChange={(event) => updateFromInput(index, event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          focusSlot(index - 1)
          return
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault()
          focusSlot(index + 1)
          return
        }

        if (event.key === 'Backspace') {
          event.preventDefault()
          updateFromInput(char ? index : Math.max(index - 1, 0), '')
          return
        }

        if (event.key === 'Delete') {
          event.preventDefault()
          updateFromInput(index, '')
          return
        }

        if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return

        event.preventDefault()
        updateFromInput(index, event.key)
      }}
      onPaste={(event) => {
        event.preventDefault()
        updateFromPaste(index, event.clipboardData.getData('text/plain'))
      }}
      pattern="\d*"
      readOnly={readOnly}
      required={isFirstSlot ? required : undefined}
      type="text"
      value={char}
      {...props}
      ref={(node) => setSlotRef(index, node)}
    />
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
