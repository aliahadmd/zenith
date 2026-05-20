import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')

export const authEmailSchema = z.object({
  email: emailSchema,
})

export const authOtpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
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

export const emailSettingsSchema = z.object({
  newEmail: emailSchema,
})

export const emailOtpSettingsSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
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

const audioCoverSchema = z
  .instanceof(File)
  .refine((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), {
    message: 'Use JPEG, PNG, or WebP.',
  })
  .refine((file) => file.size <= 5 * 1024 * 1024, {
    message: 'Cover must be 5 MB or smaller.',
  })

const audioFileSchema = z
  .instanceof(File)
  .refine((file) => ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/wave', 'audio/ogg', 'audio/webm'].includes(file.type), {
    message: 'Use MP3, M4A, WAV, OGG, or WebM.',
  })
  .refine((file) => file.size <= 90 * 1024 * 1024, {
    message: 'Audio must be 90 MB or smaller.',
  })

const photographyPreviewSchema = z
  .instanceof(File)
  .refine((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type), {
    message: 'Use JPEG, PNG, or WebP.',
  })
  .refine((file) => file.size <= 10 * 1024 * 1024, {
    message: 'Preview must be 10 MB or smaller.',
  })

const rawPhotoExtensions = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2']

const photographyOriginalSchema = z
  .instanceof(File)
  .refine((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    return ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/x-tiff', 'application/octet-stream'].includes(file.type)
      || Boolean(extension && rawPhotoExtensions.includes(extension))
  }, {
    message: 'Use JPEG, PNG, WebP, TIFF, or common RAW files.',
  })
  .refine((file) => file.size <= 90 * 1024 * 1024, {
    message: 'Original must be 90 MB or smaller.',
  })

export const audioCollectionSchema = z.object({
  kind: z.enum(['album', 'podcast']),
  title: z.string().trim().min(1, 'Title is required.').max(140, 'Title must be 140 characters or fewer.'),
  description: z.string().trim().max(1_000, 'Description must be 1,000 characters or fewer.'),
  status: z.enum(['draft', 'published']),
  releaseDate: z.string().optional(),
  cover: audioCoverSchema.nullable(),
  hasExistingCover: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.status === 'published' && !values.cover && !values.hasExistingCover) {
    ctx.addIssue({ code: 'custom', path: ['cover'], message: 'Published collections need a cover photo.' })
  }
})

export const audioItemSchema = z.object({
  collectionId: z.string().min(1, 'Choose a collection.'),
  title: z.string().trim().min(1, 'Title is required.').max(160, 'Title must be 160 characters or fewer.'),
  description: z.string().trim().max(1_000, 'Description must be 1,000 characters or fewer.'),
  status: z.enum(['draft', 'published']),
  durationSeconds: z.number().int().min(0).optional().nullable(),
  audio: audioFileSchema.nullable(),
  cover: audioCoverSchema.nullable(),
  hasExistingAudio: z.boolean(),
  hasExistingCover: z.boolean(),
  hasCollectionCover: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.status === 'published' && !values.audio && !values.hasExistingAudio) {
    ctx.addIssue({ code: 'custom', path: ['audio'], message: 'Published audio needs an audio file.' })
  }
  if (values.status === 'published' && !values.cover && !values.hasExistingCover && !values.hasCollectionCover) {
    ctx.addIssue({ code: 'custom', path: ['cover'], message: 'Published audio needs an item cover or collection cover.' })
  }
})

export const photographyAlbumSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(140, 'Title must be 140 characters or fewer.'),
  description: z.string().trim().max(1_000, 'Description must be 1,000 characters or fewer.'),
  status: z.enum(['draft', 'published']),
  shootDate: z.string().optional(),
  downloadsEnabled: z.boolean(),
  coverPhotoId: z.string().nullable(),
  hasPhotos: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.status === 'published' && !values.hasPhotos) {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'Published albums need at least one photo.' })
  }
  if (values.status === 'published' && !values.coverPhotoId) {
    ctx.addIssue({ code: 'custom', path: ['coverPhotoId'], message: 'Choose a cover photo before publishing.' })
  }
})

export const photographyPhotoUploadSchema = z.object({
  previews: z.array(photographyPreviewSchema).min(1, 'Upload at least one preview.').max(30, 'Upload 30 photos or fewer at once.'),
  originals: z.array(photographyOriginalSchema).max(30, 'Upload 30 originals or fewer at once.'),
  title: z.string().trim().max(140, 'Title must be 140 characters or fewer.'),
  caption: z.string().trim().max(1_000, 'Caption must be 1,000 characters or fewer.'),
  altText: z.string().trim().max(280, 'Alt text must be 280 characters or fewer.'),
  originalDownloadEnabled: z.boolean(),
}).superRefine((values, ctx) => {
  if (values.originals.length > values.previews.length) {
    ctx.addIssue({ code: 'custom', path: ['originals'], message: 'Original files must match uploaded previews by position.' })
  }
})

export const photographyPhotoEditSchema = z.object({
  title: z.string().trim().max(140, 'Title must be 140 characters or fewer.'),
  caption: z.string().trim().max(1_000, 'Caption must be 1,000 characters or fewer.'),
  altText: z.string().trim().max(280, 'Alt text must be 280 characters or fewer.'),
  status: z.enum(['draft', 'published']),
  originalDownloadEnabled: z.boolean(),
  preview: photographyPreviewSchema.nullable(),
  original: photographyOriginalSchema.nullable(),
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
export type AudioCollectionFormValues = z.infer<typeof audioCollectionSchema>
export type AudioItemFormValues = z.infer<typeof audioItemSchema>
export type PhotographyAlbumFormValues = z.infer<typeof photographyAlbumSchema>
export type PhotographyPhotoUploadFormValues = z.infer<typeof photographyPhotoUploadSchema>
export type PhotographyPhotoEditFormValues = z.infer<typeof photographyPhotoEditSchema>
export type RichPostFormValues = z.infer<typeof richPostSchema>
export type ReplyFormValues = z.infer<typeof replySchema>
