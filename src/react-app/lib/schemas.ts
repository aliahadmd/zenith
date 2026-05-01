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
