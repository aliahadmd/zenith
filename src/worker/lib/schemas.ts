import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')

export const authRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const authLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const postCreateSchema = z.object({
  body: z.string().trim().min(1, 'Post body must be between 1 and 500 characters').max(500, 'Post body must be between 1 and 500 characters'),
})

export const postSlugParamSchema = z.object({
  username: z.string().min(1, 'username is required'),
  slug: z.string().min(1, 'slug is required'),
})

export const postIdParamSchema = z.object({
  postId: z.string().min(1, 'postId is required'),
})

export const replyIdParamSchema = z.object({
  replyId: z.string().min(1, 'replyId is required'),
})

export const pollIdParamSchema = z.object({
  pollId: z.string().min(1, 'pollId is required'),
})

export const attachmentIdParamSchema = z.object({
  attachmentId: z.string().min(1, 'attachmentId is required'),
})

export const replyCreateJsonSchema = z.object({
  body: z.string().trim().min(1, 'Reply body must be between 1 and 500 characters').max(500, 'Reply body must be between 1 and 500 characters'),
  parentReplyId: z.string().min(1).optional(),
})

export const pollVoteSchema = z.object({
  optionId: z.string().min(1, 'optionId is required'),
})

export const subscribeSchema = z.object({
  creatorId: z.string().min(1, 'creatorId is required'),
})

const moneyCentsSchema = z
  .number()
  .int('Amount must be a whole number of cents')
  .min(100, 'Amount must be at least $1.00')
  .max(100_000_000, 'Amount is too large')

export const creatorPlanUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required').max(80, 'Plan name must be 80 characters or fewer').default('Membership'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer').optional(),
  paidEnabled: z.boolean().default(false),
  monthlyAmountCents: moneyCentsSchema.optional(),
  yearlyAmountCents: moneyCentsSchema.optional(),
  freePermanentEnabled: z.boolean().default(false),
  freeTrialEnabled: z.boolean().default(false),
  freeTrialDays: z.number().int().min(1).max(365).optional(),
}).superRefine((value, ctx) => {
  if (value.paidEnabled) {
    if (value.monthlyAmountCents === undefined) {
      ctx.addIssue({ code: 'custom', path: ['monthlyAmountCents'], message: 'Monthly price is required' })
    }
    if (value.yearlyAmountCents === undefined) {
      ctx.addIssue({ code: 'custom', path: ['yearlyAmountCents'], message: 'Yearly price is required' })
    }
  }

  if (value.freeTrialEnabled && value.freeTrialDays === undefined) {
    ctx.addIssue({ code: 'custom', path: ['freeTrialDays'], message: 'Free trial length is required' })
  }
})

export const subscriptionOptionsParamSchema = z.object({
  username: z.string().min(1, 'username is required'),
})

export const freeSubscribeSchema = z.object({
  creatorId: z.string().min(1, 'creatorId is required'),
  kind: z.enum(['free', 'trial']),
})

export const checkoutSubscribeSchema = z.object({
  creatorId: z.string().min(1, 'creatorId is required'),
  interval: z.enum(['monthly', 'yearly']),
})

export const usernameParamSchema = z.object({
  username: z.string().min(1, 'username is required'),
})

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
})

export const usernameSettingsSchema = z.object({
  newUsername: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9_-]{1,8}[a-z0-9]$|^[a-z0-9]{3}$/,
      'Username must be 3-10 characters, lowercase letters, digits, underscores, or hyphens, and must not start or end with _ or -',
    ),
})

export const profileSettingsSchema = z.object({
  displayName: z.string().trim().min(1, 'displayName is required and must be a non-empty string'),
  tagline: z.string().trim().optional(),
  socialLinks: z
    .object({
      twitter: z.string().trim().optional(),
      github: z.string().trim().optional(),
      website: z.string().trim().optional(),
    })
    .optional(),
}).superRefine((value, ctx) => {
  if (!value.socialLinks) return

  for (const [field, url] of Object.entries(value.socialLinks)) {
    if (!url) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol')
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['socialLinks', field],
        message: `Invalid URL for ${field}`,
      })
    }
  }
})

export const passwordSettingsSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword is required'),
  newPassword: passwordSchema,
})

export const emailSettingsSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1, 'currentPassword is required'),
})

export const creatorApplicationFieldsSchema = z.object({
  fullName: z.string().trim().min(1, 'Missing required field: fullName'),
  address: z.string().trim().min(1, 'Missing required field: address'),
  city: z.string().trim().min(1, 'Missing required field: city'),
  country: z.string().trim().min(1, 'Missing required field: country'),
  nidNumber: z.string().trim().min(1, 'Missing required field: nidNumber'),
  socialLinks: z.array(z.string().url()).min(1, 'Invalid URL in socialLinks'),
  contentLinks: z.array(z.string().url()).min(1, 'Invalid URL in contentLinks'),
}).superRefine((value, ctx) => {
  for (const field of ['socialLinks', 'contentLinks'] as const) {
    for (const [index, url] of value[field].entries()) {
      if (!url.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: [field, index],
          message: `Invalid URL in ${field}`,
        })
      }
    }
  }
})
