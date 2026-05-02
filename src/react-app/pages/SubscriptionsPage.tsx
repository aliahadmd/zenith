import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { CreditCard, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  creatorPlanQueryOptions,
  dollarsFromCents,
  paymentKeys,
  startCreatorOnboarding,
  updateCreatorPlan,
} from '../lib/payments'
import { creatorSubscriptionPlanSchema, type CreatorSubscriptionPlanFormValues } from '../lib/schemas'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form'
import { Input } from '../components/ui/input'
import { Skeleton } from '../components/ui/skeleton'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'
import { StudioLayout } from '../components/StudioLayout'

const defaultValues: CreatorSubscriptionPlanFormValues = {
  name: 'Membership',
  description: '',
  paidEnabled: false,
  monthlyAmount: '',
  yearlyAmount: '',
  freePermanentEnabled: false,
  freeTrialEnabled: false,
  freeTrialDays: 7,
}

export function SubscriptionsPage() {
  const queryClient = useQueryClient()
  const planQuery = useQuery(creatorPlanQueryOptions)
  const form = useForm<CreatorSubscriptionPlanFormValues>({
    resolver: zodResolver(creatorSubscriptionPlanSchema),
    defaultValues,
  })
  const paidEnabled = useWatch({ control: form.control, name: 'paidEnabled' })
  const freeTrialEnabled = useWatch({ control: form.control, name: 'freeTrialEnabled' })
  const onboardingMutation = useMutation({
    mutationFn: startCreatorOnboarding,
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Stripe onboarding could not start.')
    },
  })
  const updateMutation = useMutation({
    mutationFn: updateCreatorPlan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentKeys.creatorPlan })
      toast.success('Subscription settings saved.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Subscription settings could not be saved.')
    },
  })

  useEffect(() => {
    const plan = planQuery.data?.plan
    if (!plan) return

    form.reset({
      name: plan.name,
      description: plan.description ?? '',
      paidEnabled: plan.paidEnabled,
      monthlyAmount: dollarsFromCents(plan.prices.monthly?.amountCents),
      yearlyAmount: dollarsFromCents(plan.prices.yearly?.amountCents),
      freePermanentEnabled: plan.freePermanentEnabled,
      freeTrialEnabled: plan.freeTrialEnabled,
      freeTrialDays: plan.freeTrialDays ?? 7,
    })
  }, [form, planQuery.data])

  if (planQuery.isPending) {
    return (
      <StudioLayout
        title="Subscriptions"
        description="Configure paid memberships, free access, and creator trials."
        contentClassName="max-w-5xl"
      >
        <SubscriptionSkeleton />
      </StudioLayout>
    )
  }

  if (planQuery.isError) {
    return (
      <StudioLayout
        title="Subscriptions"
        description="Configure paid memberships, free access, and creator trials."
        contentClassName="max-w-5xl"
      >
        <div className="flex min-h-64 items-center justify-center rounded-md border text-sm text-muted-foreground">
          {planQuery.error.message}
        </div>
      </StudioLayout>
    )
  }

  const account = planQuery.data.account
  const paidAvailable = account.connected && account.chargesEnabled && account.payoutsEnabled

  function handleSubmit(values: CreatorSubscriptionPlanFormValues) {
    if (values.paidEnabled && !paidAvailable) {
      toast.error('Complete Stripe onboarding before enabling paid subscriptions.')
      return
    }
    updateMutation.mutate(values)
  }

  return (
    <StudioLayout
      title="Subscriptions"
      description="Configure paid memberships, free access, and creator trials."
      contentClassName="max-w-5xl"
    >
      <Card size="sm">
        <CardHeader>
          <CardTitle className="normal-case tracking-normal">Stripe Connect</CardTitle>
          <CardDescription>
            Paid memberships use Stripe test mode and destination charges to your connected account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <CreditCard aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Stripe account</p>
                <AccountBadge status={account.status} connected={paidAvailable} />
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {paidAvailable
                  ? 'Charges and payout routing are ready for paid memberships.'
                  : 'Connect Stripe before you can create monthly and yearly paid prices.'}
              </p>
              {account.requirementsDue.length > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Stripe still needs {account.requirementsDue.length} onboarding item
                  {account.requirementsDue.length === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant={paidAvailable ? 'outline' : 'default'}
            className="normal-case tracking-normal"
            disabled={onboardingMutation.isPending}
            onClick={() => onboardingMutation.mutate()}
          >
            {onboardingMutation.isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <ExternalLink data-icon="inline-start" />
            )}
            {account.providerAccountId ? 'Refresh onboarding' : 'Connect Stripe'}
          </Button>
        </CardContent>
      </Card>

      <Form {...form}>
        <form className="flex flex-col gap-6" onSubmit={form.handleSubmit(handleSubmit)}>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="normal-case tracking-normal">Membership plan</CardTitle>
              <CardDescription>
                One creator plan can expose free access, a timed trial, and paid monthly or yearly billing.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan name</FormLabel>
                    <FormControl>
                      <Input placeholder="Membership" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What subscribers get from this membership."
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="freePermanentEnabled"
                render={({ field }) => (
                  <FormItem className="flex min-h-14 flex-row items-start justify-between gap-4 rounded-md border p-4">
                    <div className="flex flex-col gap-1">
                      <FormLabel>Free permanent access</FormLabel>
                      <FormDescription>
                        Let viewers subscribe without Stripe and keep access until you change it later.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="freeTrialEnabled"
                render={({ field }) => (
                  <FormItem className="flex min-h-14 flex-row items-start justify-between gap-4 rounded-md border p-4">
                    <div className="flex flex-col gap-1">
                      <FormLabel>Timed free trial</FormLabel>
                      <FormDescription>
                        Grant temporary feed access without payment for a creator-defined window.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {freeTrialEnabled && (
                <FormField
                  control={form.control}
                  name="freeTrialDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trial length in days</FormLabel>
                      <FormControl>
                        <Input
                          min={1}
                          max={365}
                          type="number"
                          inputMode="numeric"
                          name={field.name}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          value={field.value ?? ''}
                          onChange={(event) => {
                            field.onChange(event.target.value === '' ? undefined : Number(event.target.value))
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="paidEnabled"
                render={({ field }) => (
                  <FormItem className="flex min-h-14 flex-row items-start justify-between gap-4 rounded-md border p-4">
                    <div className="flex flex-col gap-1">
                      <FormLabel>Paid memberships</FormLabel>
                      <FormDescription>
                        Monthly and yearly prices are available after Stripe onboarding is complete.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        disabled={!paidAvailable && !field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="monthlyAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly price</FormLabel>
                      <FormControl>
                        <Input
                          disabled={!paidEnabled || !paidAvailable}
                          min="1"
                          placeholder="9.00"
                          step="0.01"
                          type="number"
                          inputMode="decimal"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="yearlyAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yearly price</FormLabel>
                      <FormControl>
                        <Input
                          disabled={!paidEnabled || !paidAvailable}
                          min="1"
                          placeholder="90.00"
                          step="0.01"
                          type="number"
                          inputMode="decimal"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {!paidAvailable && (
                <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <Sparkles aria-hidden="true" />
                  <p>
                    Free subscriptions and trials work now. Connect Stripe when you are ready to collect paid monthly
                    and yearly subscriptions.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                type="submit"
                className="normal-case tracking-normal"
                disabled={updateMutation.isPending || form.formState.isSubmitting}
              >
                {updateMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Save settings
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </StudioLayout>
  )
}

function AccountBadge({ status, connected }: { status: string; connected: boolean }) {
  if (connected) {
    return <Badge className="normal-case tracking-normal">Ready</Badge>
  }

  return (
    <Badge variant={status === 'not_connected' ? 'secondary' : 'destructive'} className="normal-case tracking-normal">
      {status.replace('_', ' ')}
    </Badge>
  )
}

function SubscriptionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-[34rem] w-full" />
    </div>
  )
}
