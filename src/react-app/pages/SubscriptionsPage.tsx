import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { Ban, CreditCard, ExternalLink, Gift, Loader2, ShieldCheck, Timer } from 'lucide-react'
import { toast } from 'sonner'
import {
  creatorPlanQueryOptions,
  dollarsFromCents,
  paymentKeys,
  startCreatorOnboarding,
  updateCreatorPlan,
  type MembershipPlanMode,
} from '../lib/payments'
import { creatorSubscriptionPlanSchema, type CreatorSubscriptionPlanFormValues } from '../lib/schemas'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Input } from '../components/ui/input'
import { Skeleton } from '../components/ui/skeleton'
import { Textarea } from '../components/ui/textarea'
import { StudioLayout } from '../components/StudioLayout'
import { cn } from '../lib/utils'

const defaultValues: CreatorSubscriptionPlanFormValues = {
  name: 'Membership',
  description: '',
  mode: 'disabled',
  monthlyAmount: '',
  yearlyAmount: '',
  freeTrialDays: 7,
}

const modes: Array<{
  value: MembershipPlanMode
  label: string
  description: string
  icon: typeof Gift
}> = [
  { value: 'disabled', label: 'Disabled', description: 'Pause new membership signups.', icon: Ban },
  { value: 'free_permanent', label: 'Free permanent', description: 'Members keep access until they leave.', icon: Gift },
  { value: 'free_trial', label: 'Timed free trial', description: 'One no-card trial per member.', icon: Timer },
  { value: 'paid', label: 'Paid membership', description: 'Monthly with optional annual billing.', icon: CreditCard },
]

export function SubscriptionsPage() {
  const queryClient = useQueryClient()
  const planQuery = useQuery(creatorPlanQueryOptions)
  const [pendingValues, setPendingValues] = useState<CreatorSubscriptionPlanFormValues | null>(null)
  const form = useForm<CreatorSubscriptionPlanFormValues>({
    resolver: zodResolver(creatorSubscriptionPlanSchema),
    defaultValues,
  })
  const mode = useWatch({ control: form.control, name: 'mode' })
  const onboardingMutation = useMutation({
    mutationFn: startCreatorOnboarding,
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Stripe onboarding could not start.'),
  })
  const updateMutation = useMutation({
    mutationFn: updateCreatorPlan,
    onSuccess: async () => {
      setPendingValues(null)
      await queryClient.invalidateQueries({ queryKey: paymentKeys.creatorPlan })
      toast.success('Membership settings saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Membership settings could not be saved.'),
  })

  useEffect(() => {
    const plan = planQuery.data?.plan
    if (!plan) return
    form.reset({
      name: plan.name,
      description: plan.description ?? '',
      mode: plan.mode,
      monthlyAmount: dollarsFromCents(plan.prices.monthly?.amountCents),
      yearlyAmount: dollarsFromCents(plan.prices.yearly?.amountCents),
      freeTrialDays: plan.freeTrialDays ?? 7,
    })
  }, [form, planQuery.data])

  if (planQuery.isPending) {
    return (
      <StudioLayout title="Memberships" description="Choose how members access your work." contentClassName="max-w-5xl">
        <SubscriptionSkeleton />
      </StudioLayout>
    )
  }
  if (planQuery.isError) {
    return (
      <StudioLayout title="Memberships" description="Choose how members access your work." contentClassName="max-w-5xl">
        <div className="flex min-h-64 items-center justify-center rounded-md border text-sm text-muted-foreground">
          {planQuery.error.message}
        </div>
      </StudioLayout>
    )
  }

  const { account, plan, transitions } = planQuery.data
  const paidAvailable = account.connected && account.transfersEnabled && account.payoutsEnabled && account.detailsSubmitted
  const queuedTransitions = (transitions.pending ?? 0) + (transitions.processing ?? 0)

  function submit(values: CreatorSubscriptionPlanFormValues) {
    if (values.mode === 'paid' && !paidAvailable) {
      toast.error('Complete Stripe Sandbox Express onboarding before enabling paid memberships.')
      return
    }
    if (values.mode !== plan.mode) {
      setPendingValues(values)
      return
    }
    updateMutation.mutate(values)
  }

  return (
    <StudioLayout title="Memberships" description="Choose how members access your work." contentClassName="max-w-5xl">
      <Card size="sm">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="normal-case tracking-normal">Stripe Express</CardTitle>
            <CardDescription>Sandbox balances, onboarding, and payouts only.</CardDescription>
          </div>
          <Badge variant="secondary" className="normal-case tracking-normal">Test mode</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <CreditCard aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Recipient account</p>
                <AccountBadge status={account.status} connected={paidAvailable} />
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {paidAvailable
                  ? 'Transfers and simulated payouts are ready.'
                  : 'Finish test onboarding before selecting paid membership.'}
              </p>
              {account.requirementsDue.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {account.requirementsDue.length} test onboarding item{account.requirementsDue.length === 1 ? '' : 's'} remaining.
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
            {onboardingMutation.isPending
              ? <Loader2 data-icon="inline-start" className="animate-spin" />
              : <ExternalLink data-icon="inline-start" />}
            {account.providerAccountId ? 'Continue onboarding' : 'Connect Stripe'}
          </Button>
        </CardContent>
      </Card>

      {(queuedTransitions > 0 || (transitions.failed ?? 0) > 0) && (
        <div className="flex items-start gap-3 rounded-md border p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {queuedTransitions > 0
              ? `${queuedTransitions} paid membership cancellation${queuedTransitions === 1 ? '' : 's'} will be scheduled at period end.`
              : `${transitions.failed} Stripe transition job${transitions.failed === 1 ? '' : 's'} need automatic retry.`}
          </p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)}>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="normal-case tracking-normal">Membership offering</CardTitle>
              <CardDescription>Only one option can accept new members at a time.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access mode</FormLabel>
                    <FormControl>
                      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Membership access mode">
                        {modes.map((option) => {
                          const Icon = option.icon
                          const disabled = option.value === 'paid' && !paidAvailable && field.value !== 'paid'
                          return (
                            <button
                              key={option.value}
                              type="button"
                              role="radio"
                              aria-checked={field.value === option.value}
                              disabled={disabled}
                              className={cn(
                                'flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition-colors',
                                'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                field.value === option.value && 'border-foreground bg-muted/40',
                                disabled && 'cursor-not-allowed opacity-50',
                              )}
                              onClick={() => field.onChange(option.value)}
                            >
                              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{option.label}</span>
                                <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan name</FormLabel>
                      <FormControl><Input placeholder="Membership" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mode === 'free_trial' && (
                  <FormField
                    control={form.control}
                    name="freeTrialDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trial length</FormLabel>
                        <FormControl>
                          <Input
                            min={1}
                            max={90}
                            type="number"
                            inputMode="numeric"
                            name={field.name}
                            onBlur={field.onBlur}
                            ref={field.ref}
                            value={field.value ?? ''}
                            onChange={(event) => field.onChange(event.target.value === '' ? undefined : Number(event.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="What members receive." rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === 'paid' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="monthlyAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly price</FormLabel>
                        <FormControl><Input min="1" placeholder="9.00" step="0.01" type="number" inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="yearlyAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Annual price <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl><Input min="1" placeholder="90.00" step="0.01" type="number" inputMode="decimal" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Use Stripe test card <span className="font-mono text-foreground">4242 4242 4242 4242</span> and test identity data only.
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" className="normal-case tracking-normal" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Save membership
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>

      <Dialog open={pendingValues !== null} onOpenChange={(open) => !open && setPendingValues(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change membership mode?</DialogTitle>
            <DialogDescription>
              New signups will switch immediately. Existing free access remains grandfathered, trials finish normally,
              and active paid memberships are canceled at period end when leaving paid mode.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingValues(null)}>Keep current mode</Button>
            <Button
              type="button"
              disabled={!pendingValues || updateMutation.isPending}
              onClick={() => pendingValues && updateMutation.mutate(pendingValues)}
            >
              {updateMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudioLayout>
  )
}

function AccountBadge({ status, connected }: { status: string; connected: boolean }) {
  if (connected) return <Badge className="normal-case tracking-normal">Ready</Badge>
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
