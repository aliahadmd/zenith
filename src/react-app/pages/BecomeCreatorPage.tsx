import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { apiGetRequired, apiPostRequired } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { creatorApplicationSchema } from '../lib/schemas'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

type CreatorApplicationFormValues = z.infer<typeof creatorApplicationSchema>

// ── Component ─────────────────────────────────────────────────────────────────
export function BecomeCreatorPage() {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()

  const [alreadyApplied, setAlreadyApplied] = useState(false)

  const form = useForm<CreatorApplicationFormValues>({
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
  const { register, handleSubmit, control, formState: { errors } } = form

  type ApplicationState = {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    decisionReason: string | null
    fullName: string
    address: string
    city: string
    country: string
    nidNumber: string
    socialLinks: string[]
    contentLinks: string[]
  }
  const applicationQuery = useQuery({
    queryKey: ['creator-application', 'me'],
    queryFn: () => apiGetRequired<{ application: ApplicationState | null }>('/api/creator/application/me'),
  })

  useEffect(() => {
    const application = applicationQuery.data?.application
    if (application?.status !== 'rejected') return
    form.reset({
      fullName: application.fullName,
      address: application.address,
      city: application.city,
      country: application.country,
      nidNumber: application.nidNumber,
      nidDocument: undefined as unknown as File,
      socialLinks: application.socialLinks.map((value) => ({ value })),
      contentLinks: application.contentLinks.map((value) => ({ value })),
    })
  }, [applicationQuery.data, form])

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

  const applyMutation = useMutation({
    mutationFn: (formData: FormData) => apiPostRequired<{ application: { status: 'pending' } }>('/api/creator/apply', formData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['creator-application', 'me'] })
    },
  })

  // ── Submit handler ────────────────────────────────────────────────────────
  async function onSubmit(values: CreatorApplicationFormValues) {
    const formData = new FormData()
    formData.append('fullName', values.fullName)
    formData.append('address', values.address)
    formData.append('city', values.city)
    formData.append('country', values.country)
    formData.append('nidNumber', values.nidNumber)
    formData.append('nidDocument', values.nidDocument)
    formData.append(
      'socialLinks',
      JSON.stringify(values.socialLinks.map((l) => l.value))
    )
    formData.append(
      'contentLinks',
      JSON.stringify(values.contentLinks.map((l) => l.value))
    )

    try {
      await applyMutation.mutateAsync(formData)
    } catch (error) {
      if (error instanceof Error && 'status' in error && error.status === 409) {
        setAlreadyApplied(true)
        return
      }
      toast.error(error instanceof Error ? error.message : 'Application failed.')
      return
    }

    // Success path
    toast.success('Application submitted for review.')
  }

  // ── Already-applied state ─────────────────────────────────────────────────
  const application = applicationQuery.data?.application
  if (alreadyApplied || application?.status === 'pending') {
    return (
      <div data-page-shell="become-creator" className="w-full max-w-3xl py-2 lg:py-8">
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

  if (application?.status === 'approved' || currentUser?.role === 'creator') {
    return <div data-page-shell="become-creator" className="w-full max-w-3xl py-2 lg:py-8"><Card><CardHeader><CardTitle>Creator access active</CardTitle><CardDescription>Your application has been approved. Creator Studio is available from the sidebar.</CardDescription></CardHeader></Card></div>
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div data-page-shell="become-creator" className="flex w-full max-w-3xl flex-col gap-6 py-2 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold">Become a Creator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill out the form below to apply for creator status. All fields are required unless noted.
        </p>
      </div>

      {application?.status === 'rejected' ? <Card className="border-destructive/40"><CardHeader><CardTitle>Application needs changes</CardTitle><CardDescription>{application.decisionReason}. Update your details and upload a new identity document to resubmit.</CardDescription></CardHeader></Card> : null}

      <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              Your legal identity details for verification
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Full legal name */}
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
          <CardContent className="flex flex-col gap-4">
            {/* NID number */}
            <div className="flex flex-col gap-2">
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
            <FormField
              control={control}
              name="nidDocument"
              render={({ field: { onChange, ref, name, onBlur } }) => (
                <FormItem>
                  <FormLabel>NID document image</FormLabel>
                  <FormControl>
                    <Input
                      ref={ref}
                      name={name}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onBlur={onBlur}
                      onChange={(event) => onChange(event.target.files?.[0])}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
          <CardContent className="flex flex-col gap-4">
            {socialFields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 flex-col gap-1">
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
          <CardContent className="flex flex-col gap-4">
            {contentFields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 flex-col gap-1">
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
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Submitting…
            </>
          ) : (
            'Submit application'
          )}
        </Button>
      </form>
      </Form>
    </div>
  )
}
