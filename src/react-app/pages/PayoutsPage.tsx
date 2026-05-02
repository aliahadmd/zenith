import { useMutation, useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import { ExternalLink, Loader2, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import {
  creatorAnalyticsQueryOptions,
  formatCurrency,
  formatUnixDate,
  openCreatorDashboard,
  type CreatorAnalyticsResponse,
} from '../lib/payments'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../components/ui/chart'
import { Skeleton } from '../components/ui/skeleton'
import { StudioLayout } from '../components/StudioLayout'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'

const chartConfig = {
  netCents: {
    label: 'Net revenue',
    color: 'var(--chart-1)',
  },
  grossCents: {
    label: 'Gross revenue',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

export function PayoutsPage() {
  const analyticsQuery = useQuery(creatorAnalyticsQueryOptions)
  const dashboardMutation = useMutation({
    mutationFn: openCreatorDashboard,
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Stripe dashboard could not be opened.')
    },
  })

  if (analyticsQuery.isPending) {
    return (
      <StudioLayout
        title="Money"
        description="Track subscription revenue, payout readiness, and paying members."
      >
        <PayoutsSkeleton />
      </StudioLayout>
    )
  }

  if (analyticsQuery.isError) {
    return (
      <StudioLayout
        title="Money"
        description="Track subscription revenue, payout readiness, and paying members."
      >
        <div className="flex min-h-64 items-center justify-center rounded-md border text-sm text-muted-foreground">
          {analyticsQuery.error.message}
        </div>
      </StudioLayout>
    )
  }

  const analytics = analyticsQuery.data
  const currency = analytics.balance.currency || 'usd'
  const stripeReady = analytics.account.connected

  return (
    <StudioLayout
      title="Money"
      description="Track subscription revenue, payout readiness, and paying members."
      action={
        <Button
          type="button"
          variant={stripeReady ? 'default' : 'outline'}
          className="normal-case tracking-normal"
          disabled={!analytics.account.providerAccountId || dashboardMutation.isPending}
          onClick={() => dashboardMutation.mutate()}
        >
          {dashboardMutation.isPending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <ExternalLink data-icon="inline-start" />
          )}
          Open Stripe Dashboard
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Available balance" value={formatCurrency(analytics.balance.availableCents, currency)} />
        <MetricCard label="Pending balance" value={formatCurrency(analytics.balance.pendingCents, currency)} />
        <MetricCard label="Estimated MRR" value={formatCurrency(analytics.metrics.mrrCents, currency)} />
        <MetricCard label="Net revenue" value={formatCurrency(analytics.metrics.totalNetCents, currency)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="normal-case tracking-normal">Revenue trend</CardTitle>
            <CardDescription>Net and gross revenue from Stripe webhook events over the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto">
              <AreaChart accessibilityLayer data={analytics.chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(value) => formatChartDate(String(value))}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(value) => formatChartDate(String(value))}
                      formatter={(value, name) => (
                        <>
                          <span className="text-muted-foreground">
                            {name === 'grossCents' ? 'Gross revenue' : 'Net revenue'}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatCurrency(Number(value), currency)}
                          </span>
                        </>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="grossCents"
                  type="natural"
                  fill="var(--color-grossCents)"
                  fillOpacity={0.12}
                  stroke="var(--color-grossCents)"
                  stackId="a"
                />
                <Area
                  dataKey="netCents"
                  type="natural"
                  fill="var(--color-netCents)"
                  fillOpacity={0.25}
                  stroke="var(--color-netCents)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="normal-case tracking-normal">Audience mix</CardTitle>
            <CardDescription>Active memberships that currently grant feed access.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AudienceRow label="Paid subscribers" value={analytics.metrics.paidSubscribers} />
            <AudienceRow label="Free subscribers" value={analytics.metrics.freeSubscribers} />
            <AudienceRow label="Trial users" value={analytics.metrics.trialSubscribers} />
            <AudienceRow label="Total active" value={analytics.metrics.activeSubscribers} emphasis />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <SubscribersTable analytics={analytics} />
        <PayoutSummary analytics={analytics} />
      </div>
    </StudioLayout>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function AudienceRow({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className={emphasis ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function SubscribersTable({ analytics }: { analytics: CreatorAnalyticsResponse }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="normal-case tracking-normal">Members</CardTitle>
        <CardDescription>Who is paying, trialing, or using free access.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Renews or ends</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.subscribers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No subscribers yet.
                  </TableCell>
                </TableRow>
              ) : (
                analytics.subscribers.map((subscriber) => (
                  <TableRow key={subscriber.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{subscriber.displayName}</span>
                        <span className="text-sm text-muted-foreground">@{subscriber.username}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="normal-case tracking-normal" variant={subscriber.paying ? 'default' : 'secondary'}>
                        {subscriber.interval ? `${subscriber.accessType} ${subscriber.interval}` : subscriber.accessType}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{subscriber.status.replace('_', ' ')}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatUnixDate(subscriber.currentPeriodEnd ?? subscriber.trialEndsAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function PayoutSummary({ analytics }: { analytics: CreatorAnalyticsResponse }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="normal-case tracking-normal">Payouts</CardTitle>
        <CardDescription>Recent Stripe payout activity for this connected account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-md border p-3">
          <WalletCards aria-hidden="true" />
          <div>
            <p className="font-medium">{analytics.account.connected ? 'Stripe payouts enabled' : 'Stripe setup incomplete'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Withdrawals and bank settings are managed from Stripe Express.
            </p>
          </div>
        </div>
        {analytics.payouts.length === 0 ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">No payout history yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {analytics.payouts.map((payout) => (
              <div key={payout.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div>
                  <p className="font-medium">{formatCurrency(payout.amountCents, payout.currency)}</p>
                  <p className="text-sm text-muted-foreground">{formatUnixDate(payout.arrivalDate ?? payout.createdAt)}</p>
                </div>
                <Badge className="normal-case tracking-normal" variant="secondary">
                  {payout.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00Z`))
}

function PayoutsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-28 w-full" key={index} />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
