import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { apiPost } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

// ── Zod schema ────────────────────────────────────────────────────────────────
const creatorApplicationSchema = z.object({
  fullName: z.string().min(1, 'Full legal name is required'),
  address: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  country: z.string().min(1, 'Country is required'),
  nidNumber: z.string().min(1, 'NID number is required'),
  socialLinks: z
    .array(
      z.object({
        value: z
          .string()
          .url('Must be a valid URL')
          .refine((v) => v.startsWith('https://'), 'Must start with https://'),
      })
    )
    .min(1, 'At least one social profile URL is required'),
  contentLinks: z
    .array(
      z.object({
        value: z
          .string()
          .url('Must be a valid URL')
          .refine((v) => v.startsWith('https://'), 'Must start with https://'),
      })
    )
    .min(1, 'At least one content sample URL is required'),
})

type CreatorApplicationFormValues = z.infer<typeof creatorApplicationSchema>

// ── NID document validation constants ────────────────────────────────────────
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

// ── Component ─────────────────────────────────────────────────────────────────
export function BecomeCreatorPage() {
  const { currentUser, refreshCurrentUser } = useAuth()
  const navigate = useNavigate()

  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [nidFile, setNidFile] = useState<File | null>(null)
  const [nidFileError, setNidFileError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreatorApplicationFormValues>({
    resolver: zodResolver(creatorApplicationSchema),
    defaultValues: {
      fullName: '',
      address: '',
      city: '',
      country: '',
      nidNumber: '',
      socialLinks: [{ value: '' }],
      contentLinks: [{ value: '' }],
    },
  })

  const {
    fields: socialFields,
    append: appendSocial,
    remove: removeSocial,
  } = useFieldArray({ control, name: 'socialLinks' })

  const {
    fields: contentFields,
    append: appendContent,
    remove: removeContent,
  } = useFieldArray({ control, name: 'contentLinks' })

  // ── NID file change handler ───────────────────────────────────────────────
  function handleNidFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setNidFile(file)
    setNidFileError(null)

    if (file) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setNidFileError('NID document must be a JPEG, PNG, or WebP image.')
      } else if (file.size > MAX_FILE_SIZE_BYTES) {
        setNidFileError('NID document must be 10 MB or smaller.')
      }
    }
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  async function onSubmit(values: CreatorApplicationFormValues) {
    // Validate NID file presence and constraints
    if (!nidFile) {
      setNidFileError('NID document is required.')
      return
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(nidFile.type)) {
      setNidFileError('NID document must be a JPEG, PNG, or WebP image.')
      return
    }
    if (nidFile.size > MAX_FILE_SIZE_BYTES) {
      setNidFileError('NID document must be 10 MB or smaller.')
      return
    }

    setIsSubmitting(true)

    const formData = new FormData()
    formData.append('fullName', values.fullName)
    formData.append('address', values.address)
    formData.append('city', values.city)
    formData.append('country', values.country)
    formData.append('nidNumber', values.nidNumber)
    formData.append('nidDocument', nidFile)
    formData.append(
      'socialLinks',
      JSON.stringify(values.socialLinks.map((l) => l.value))
    )
    formData.append(
      'contentLinks',
      JSON.stringify(values.contentLinks.map((l) => l.value))
    )

    const { error, status } = await apiPost('/api/creator/apply', formData)

    setIsSubmitting(false)

    if (status === 409) {
      setAlreadyApplied(true)
      return
    }

    if (error) {
      toast.error(error)
      return
    }

    // Success path
    await refreshCurrentUser()
    toast.success(
      `Congratulations, ${currentUser?.displayName ?? 'creator'}! Your creator status is now active. Start creating content in Studio.`
    )
    navigate('/studio')
  }

  // ── Already-applied state ─────────────────────────────────────────────────
  if (alreadyApplied) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Application Under Review</CardTitle>
            <CardDescription>
              You have already submitted a creator application. Our team is
              reviewing it and will be in touch soon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you have any questions, please contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Become a Creator</h1>
      <p className="text-sm text-muted-foreground">
        Fill out the form below to apply for creator status. All fields are
        required unless noted.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              Your legal identity details for verification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Full legal name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full legal name</Label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                aria-invalid={!!errors.fullName}
                {...register('fullName')}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">
                  {errors.fullName.message}
                </p>
              )}
            </div>

            {/* Street address */}
            <div className="space-y-2">
              <Label htmlFor="address">Street address</Label>
              <Input
                id="address"
                type="text"
                autoComplete="street-address"
                aria-invalid={!!errors.address}
                {...register('address')}
              />
              {errors.address && (
                <p className="text-sm text-destructive">
                  {errors.address.message}
                </p>
              )}
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                type="text"
                autoComplete="address-level2"
                aria-invalid={!!errors.city}
                {...register('city')}
              />
              {errors.city && (
                <p className="text-sm text-destructive">
                  {errors.city.message}
                </p>
              )}
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                type="text"
                autoComplete="country-name"
                aria-invalid={!!errors.country}
                {...register('country')}
              />
              {errors.country && (
                <p className="text-sm text-destructive">
                  {errors.country.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── NID ──────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>National Identity Document</CardTitle>
            <CardDescription>
              Your government-issued ID number and a scan or photo of the
              document (JPEG, PNG, or WebP, max 10 MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* NID number */}
            <div className="space-y-2">
              <Label htmlFor="nidNumber">NID number</Label>
              <Input
                id="nidNumber"
                type="text"
                aria-invalid={!!errors.nidNumber}
                {...register('nidNumber')}
              />
              {errors.nidNumber && (
                <p className="text-sm text-destructive">
                  {errors.nidNumber.message}
                </p>
              )}
            </div>

            {/* NID document upload */}
            <div className="space-y-2">
              <Label htmlFor="nidDocument">NID document image</Label>
              <Input
                id="nidDocument"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-invalid={!!nidFileError}
                onChange={handleNidFileChange}
              />
              {nidFileError && (
                <p className="text-sm text-destructive">{nidFileError}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Social profile URLs ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Social Profiles</CardTitle>
            <CardDescription>
              At least one social profile URL (must start with https://)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {socialFields.map((field, index) => (
              <div key={field.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`socialLinks.${index}.value`}>
                      Social profile URL {index + 1}
                    </Label>
                    <Input
                      id={`socialLinks.${index}.value`}
                      type="url"
                      placeholder="https://twitter.com/yourhandle"
                      aria-invalid={!!errors.socialLinks?.[index]?.value}
                      {...register(`socialLinks.${index}.value`)}
                    />
                  </div>
                  {socialFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mt-6 shrink-0"
                      onClick={() => removeSocial(index)}
                      aria-label={`Remove social profile URL ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {errors.socialLinks?.[index]?.value && (
                  <p className="text-sm text-destructive">
                    {errors.socialLinks[index].value?.message}
                  </p>
                )}
              </div>
            ))}
            {errors.socialLinks?.root && (
              <p className="text-sm text-destructive">
                {errors.socialLinks.root.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendSocial({ value: '' })}
            >
              <Plus />
              Add social profile URL
            </Button>
          </CardContent>
        </Card>

        {/* ── Content sample URLs ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Content Samples</CardTitle>
            <CardDescription>
              At least one content sample URL (must start with https://)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contentFields.map((field, index) => (
              <div key={field.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`contentLinks.${index}.value`}>
                      Content sample URL {index + 1}
                    </Label>
                    <Input
                      id={`contentLinks.${index}.value`}
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      aria-invalid={!!errors.contentLinks?.[index]?.value}
                      {...register(`contentLinks.${index}.value`)}
                    />
                  </div>
                  {contentFields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="mt-6 shrink-0"
                      onClick={() => removeContent(index)}
                      aria-label={`Remove content sample URL ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {errors.contentLinks?.[index]?.value && (
                  <p className="text-sm text-destructive">
                    {errors.contentLinks[index].value?.message}
                  </p>
                )}
              </div>
            ))}
            {errors.contentLinks?.root && (
              <p className="text-sm text-destructive">
                {errors.contentLinks.root.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendContent({ value: '' })}
            >
              <Plus />
              Add content sample URL
            </Button>
          </CardContent>
        </Card>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Submitting…
            </>
          ) : (
            'Submit application'
          )}
        </Button>
      </form>
    </div>
  )
}
