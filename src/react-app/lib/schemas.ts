import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const profileSettingsSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required'),
  tagline: z.string().trim().max(160, 'Tagline must be 160 characters or fewer').optional(),
  twitter: z.string().trim().optional(),
  github: z.string().trim().optional(),
  website: z.string().trim().optional(),
}).superRefine((values, ctx) => {
  for (const field of ['twitter', 'github', 'website'] as const) {
    const value = values[field]
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid protocol')
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: 'Enter a valid URL',
      })
    }
  }
})

export const usernameSettingsSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$|^[a-z0-9]{3}$/,
      'Username must be 3-10 characters, lowercase letters, numbers, _ and - only',
    ),
})

export const avatarSettingsSchema = z.object({
  avatar: z
    .instanceof(File, { error: 'Choose an image file' })
    .refine((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), {
      message: 'Use JPEG, PNG, or WebP.',
    })
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: 'File must be 5 MB or smaller.',
    }),
})

export const passwordSettingsSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Confirm your new password'),
}).refine((values) => values.newPassword === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'New passwords do not match.',
})

export const emailSettingsSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1, 'Current password is required'),
})

const httpsUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .refine((value) => value.startsWith('https://'), 'Must start with https://')

export const creatorApplicationSchema = z.object({
  fullName: z.string().trim().min(1, 'Full legal name is required'),
  address: z.string().trim().min(1, 'Street address is required'),
  city: z.string().trim().min(1, 'City is required'),
  country: z.string().trim().min(1, 'Country is required'),
  nidNumber: z.string().trim().min(1, 'NID number is required'),
  socialLinks: z.array(z.object({ value: httpsUrlSchema })).min(1, 'At least one social profile URL is required'),
  contentLinks: z.array(z.object({ value: httpsUrlSchema })).min(1, 'At least one content sample URL is required'),
  nidDocument: z
    .instanceof(File, { error: 'NID document is required.' })
    .refine((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), {
      message: 'NID document must be a JPEG, PNG, or WebP image.',
    })
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'NID document must be 10 MB or smaller.',
    }),
})

export const shortPostSchema = z.object({
  body: z
    .string()
    .min(1, 'Post body cannot be empty.')
    .max(500, 'Post body must be 500 characters or fewer.'),
})

const imageListSchema = z
  .array(z.instanceof(File))
  .max(4, 'Upload 4 images or fewer.')
  .refine((files) => files.every((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)), {
    message: 'Use JPEG, PNG, or WebP images.',
  })
  .refine((files) => files.every((file) => file.size <= 5 * 1024 * 1024), {
    message: 'Each image must be 5 MB or smaller.',
  })

const pollOptionSchema = z.object({
  value: z.string().trim().max(80, 'Poll options must be 80 characters or fewer.'),
})

export const richPostSchema = z.object({
  body: z.string().trim().max(500, 'Post body must be 500 characters or fewer.'),
  images: imageListSchema,
  pollEnabled: z.boolean(),
  pollQuestion: z.string().trim().max(140, 'Poll question must be 140 characters or fewer.'),
  pollOptions: z.array(pollOptionSchema).min(2).max(4),
}).superRefine((values, ctx) => {
  const hasBody = values.body.length > 0
  const hasImages = values.images.length > 0
  const hasPoll = values.pollEnabled

  if (!hasBody && !hasImages && !hasPoll) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'Add post text, images, or a poll.' })
  }

  if (hasPoll) {
    if (!values.pollQuestion) {
      ctx.addIssue({ code: 'custom', path: ['pollQuestion'], message: 'Poll question is required.' })
    }

    const filledOptions = values.pollOptions.map((option) => option.value.trim()).filter(Boolean)
    if (filledOptions.length < 2 || filledOptions.length > 4) {
      ctx.addIssue({ code: 'custom', path: ['pollOptions'], message: 'Polls must include 2 to 4 options.' })
    }
  }
})

export const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Reply body cannot be empty.')
    .max(500, 'Reply body must be 500 characters or fewer.'),
  images: imageListSchema,
})

const articleCoverSchema = z
  .instanceof(File)
  .refine((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), {
    message: 'Use JPEG, PNG, or WebP.',
  })
  .refine((file) => file.size <= 5 * 1024 * 1024, {
    message: 'Cover must be 5 MB or smaller.',
  })

export const articleSchema = z.object({
  title: z.string().trim().max(140, 'Title must be 140 characters or fewer.'),
  excerpt: z.string().trim().max(280, 'Excerpt must be 280 characters or fewer.'),
  markdown: z.string().trim().max(50_000, 'Article body must be 50,000 characters or fewer.'),
  cover: articleCoverSchema.nullable(),
  hasExistingCover: z.boolean(),
  status: z.enum(['draft', 'published']),
}).superRefine((values, ctx) => {
  if (values.status === 'draft') {
    if (!values.title && !values.markdown) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Drafts need at least a title or article body.' })
    }
    return
  }

  if (!values.title) {
    ctx.addIssue({ code: 'custom', path: ['title'], message: 'Published articles need a title.' })
  }
  if (!values.markdown) {
    ctx.addIssue({ code: 'custom', path: ['markdown'], message: 'Published articles need an article body.' })
  }
  if (!values.cover && !values.hasExistingCover) {
    ctx.addIssue({ code: 'custom', path: ['cover'], message: 'Published articles need a cover photo.' })
  }
})

const priceInputSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || /^\d+(\.\d{1,2})?$/.test(value), {
    message: 'Use a valid USD amount.',
  })

function centsFromPriceInput(value: string | undefined) {
  if (!value) return null
  return Math.round(Number(value) * 100)
}

export const creatorSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required').max(80, 'Plan name must be 80 characters or fewer'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer').optional(),
  paidEnabled: z.boolean(),
  monthlyAmount: priceInputSchema,
  yearlyAmount: priceInputSchema,
  freePermanentEnabled: z.boolean(),
  freeTrialEnabled: z.boolean(),
  freeTrialDays: z
    .number({ error: 'Trial length is required.' })
    .int('Trial length must be a whole number of days.')
    .min(1, 'Trial must be at least 1 day.')
    .max(365, 'Trial must be 365 days or fewer.')
    .optional(),
}).superRefine((values, ctx) => {
  if (values.paidEnabled) {
    const monthlyCents = centsFromPriceInput(values.monthlyAmount)
    const yearlyCents = centsFromPriceInput(values.yearlyAmount)

    if (monthlyCents === null) {
      ctx.addIssue({ code: 'custom', path: ['monthlyAmount'], message: 'Monthly price is required.' })
    } else if (monthlyCents < 100) {
      ctx.addIssue({ code: 'custom', path: ['monthlyAmount'], message: 'Monthly price must be at least $1.00.' })
    }

    if (yearlyCents === null) {
      ctx.addIssue({ code: 'custom', path: ['yearlyAmount'], message: 'Yearly price is required.' })
    } else if (yearlyCents < 100) {
      ctx.addIssue({ code: 'custom', path: ['yearlyAmount'], message: 'Yearly price must be at least $1.00.' })
    }
  }

  if (values.freeTrialEnabled && values.freeTrialDays === undefined) {
    ctx.addIssue({ code: 'custom', path: ['freeTrialDays'], message: 'Trial length is required.' })
  }
})

export type CreatorSubscriptionPlanFormValues = z.infer<typeof creatorSubscriptionPlanSchema>
export type ArticleFormValues = z.infer<typeof articleSchema>
export type RichPostFormValues = z.infer<typeof richPostSchema>
export type ReplyFormValues = z.infer<typeof replySchema>
