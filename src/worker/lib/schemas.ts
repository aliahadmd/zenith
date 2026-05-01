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
  body: z.string().min(1, 'Post body must be between 1 and 500 characters').max(500, 'Post body must be between 1 and 500 characters'),
})

export const subscribeSchema = z.object({
  creatorId: z.string().min(1, 'creatorId is required'),
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
