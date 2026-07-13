import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Compass,
  ExternalLink,
  FileClock,
  HeartPulse,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { apiGetRequired, apiPostRequired } from "../lib/api";
import {
  adminDecision,
  getAdminPage,
  revokeAdministrator,
  type AdminApplication,
  type AdminRole,
  type ManagedUser,
  type ModerationCase,
} from "../lib/admin";
import { cn } from "../lib/utils";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { AdminDiscoveryPanel } from "../components/AdminDiscoveryPanel";

export type AdminSection =
  | "overview"
  | "applications"
  | "reports"
  | "users"
  | "health"
  | "audit"
  | "administrators"
  | "discovery";

const sections: Array<{
  key: AdminSection;
  label: string;
  icon: typeof Activity;
  ownerOnly?: boolean;
}> = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "applications", label: "Creator Applications", icon: ClipboardCheck },
  { key: "reports", label: "Reports", icon: FileClock },
  { key: "users", label: "Users", icon: Users },
  { key: "discovery", label: "Discovery", icon: Compass, ownerOnly: true },
  { key: "health", label: "Platform Health", icon: HeartPulse },
  { key: "audit", label: "Audit Log", icon: ShieldCheck },
  {
    key: "administrators",
    label: "Administrators",
    icon: ShieldPlus,
    ownerOnly: true,
  },
];

function titleFor(section: AdminSection) {
  return sections.find((item) => item.key === section)?.label ?? "Admin";
}

function formatDate(value: number | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusBadge({ value }: { value: string }) {
  const destructive = ["suspended", "hidden", "attention", "rejected"].includes(
    value,
  );
  return (
    <Badge
      variant={
        destructive
          ? "destructive"
          : value === "healthy" || value === "approved" || value === "active"
            ? "default"
            : "secondary"
      }
    >
      {value.replace(/_/g, " ")}
    </Badge>
  );
}

function AdminActionDialog({
  title,
  description,
  confirmLabel,
  trigger,
  destructive,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  trigger: ReactNode;
  destructive?: boolean;
  onConfirm: (reason: string, note: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () => onConfirm(reason.trim(), note.trim()),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      setNote("");
      toast.success(`${confirmLabel} completed.`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Action failed."),
  });
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`reason-${title}`}>Reason</Label>
              <Textarea
                id={`reason-${title}`}
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Required for the audit log"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`note-${title}`}>Private note (optional)</Label>
              <Textarea
                id={`note-${title}`}
                value={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={reason.trim().length < 3 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PageControls({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t px-3 py-3 text-sm text-muted-foreground">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function AdminPage({ section }: { section: AdminSection }) {
  const { currentUser } = useAuth();
  const visibleSections = sections.filter(
    (item) => !item.ownerOnly || currentUser?.adminRole === "owner",
  );
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1500px] py-4 lg:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold">{titleFor(section)}</h1>
        </div>
        <Badge variant="outline">{currentUser?.adminRole}</Badge>
      </div>
      <div className="grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:overflow-visible">
          <nav className="flex min-w-max gap-1 border-b pb-3 xl:min-w-0 xl:flex-col xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4">
            {visibleSections.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return item.key === "overview" ? (
                <Link
                  key={item.key}
                  to="/admin"
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              ) : (
                <Link
                  key={item.key}
                  to="/admin/$section"
                  params={{ section: item.key }}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">
          {section === "overview" ? <Overview /> : null}
          {section === "applications" ? <Applications /> : null}
          {section === "reports" ? <Reports /> : null}
          {section === "users" ? <UsersPage /> : null}
          {section === "discovery" && currentUser?.adminRole === "owner" ? <AdminDiscoveryPanel /> : null}
          {section === "health" ? <Health /> : null}
          {section === "audit" ? <AuditLog /> : null}
          {section === "administrators" &&
          currentUser?.adminRole === "owner" ? (
            <Administrators />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Overview() {
  const query = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () =>
      apiGetRequired<{ counts: Record<string, number> }>("/api/admin/overview"),
  });
  const labels: Record<string, string> = {
    users: "Users",
    creators: "Creators",
    content: "Content",
    pendingApplications: "Pending applications",
    openReports: "Open reports",
    suspendedUsers: "Suspended users",
    hiddenContent: "Hidden content",
  };
  return (
    <LoadingState query={query}>
      {(data) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.counts).map(([key, value]) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {labels[key] ?? key}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </LoadingState>
  );
}

function Applications() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending");
  const query = useQuery({
    queryKey: ["admin", "applications", page, search, status],
    queryFn: () =>
      getAdminPage<AdminApplication>("/api/admin/applications", {
        page,
        pageSize: 20,
        search,
        status,
      }),
  });
  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "applications"] });
  return (
    <section className="grid gap-4">
      <FilterBar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <Select
          value={status || "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <LoadingState query={query}>
        {(data) => (
          <TablePanel controls={<PageControls {...data} onPage={setPage} />}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.email} · @{item.username}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.city}, {item.country}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={item.status} />
                    </TableCell>
                    <TableCell>{formatDate(item.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                              <ApplicationDetailDialog id={item.id} />
                              <Button size="sm" variant="outline" asChild>
                          <a
                            href={`/api/admin/applications/${item.id}/document`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink />
                            NID
                          </a>
                        </Button>
                        {item.status === "pending" ? (
                          <>
                            <AdminActionDialog
                              title="Approve creator application"
                              description={`Approve ${item.fullName} and grant Creator Studio access.`}
                              confirmLabel="Approve"
                              trigger={
                                <Button size="sm">
                                  <CheckCircle2 />
                                  Approve
                                </Button>
                              }
                              onConfirm={async (reason, note) => {
                                await adminDecision(
                                  `/api/admin/applications/${item.id}/approve`,
                                  reason,
                                  note,
                                );
                                await refresh();
                              }}
                            />
                            <AdminActionDialog
                              title="Reject creator application"
                              description="The applicant will see the reason and may resubmit."
                              confirmLabel="Reject"
                              destructive
                              trigger={
                                <Button size="sm" variant="destructive">
                                  Reject
                                </Button>
                              }
                              onConfirm={async (reason, note) => {
                                await adminDecision(
                                  `/api/admin/applications/${item.id}/reject`,
                                  reason,
                                  note,
                                );
                                await refresh();
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </LoadingState>
    </section>
  );
}

function ApplicationDetailDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["admin", "application", id],
    queryFn: () => apiGetRequired<Record<string, unknown>>(`/api/admin/applications/${id}`),
    enabled: open,
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Details</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Creator application</DialogTitle>
            <DialogDescription>Identity, profile links, samples, and review metadata.</DialogDescription>
          </DialogHeader>
          {query.isPending ? <Loader2 className="mx-auto animate-spin" /> : query.data ? (
            <dl className="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
              {Object.entries(query.data).filter(([key]) => key !== "nidDocumentR2Key").map(([key, value]) => (
                <div key={key} className="border-b pb-2">
                  <dt className="text-xs font-medium text-muted-foreground">{key.replace(/_/g, " ")}</dt>
                  <dd className="mt-1 break-words text-sm">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="text-sm text-destructive">Unable to load application.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Reports() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("open");
  const query = useQuery({
    queryKey: ["admin", "reports", page, status],
    queryFn: () =>
      getAdminPage<ModerationCase>("/api/admin/reports", {
        page,
        pageSize: 20,
        status,
      }),
  });
  const act = async (
    item: ModerationCase,
    action: string,
    reason: string,
    note: string,
  ) => {
    await apiPostRequired(`/api/admin/reports/${item.id}/action`, {
      action,
      reason,
      note,
    });
    await queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
  };
  return (
    <section className="grid gap-4">
      <div className="flex justify-end">
        <Select
          value={status || "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="reviewing">Reviewing</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <LoadingState query={query}>
        {(data) => (
          <TablePanel controls={<PageControls {...data} onPage={setPage} />}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium capitalize">
                        {item.target_type}
                      </div>
                      <code className="text-xs text-muted-foreground">
                        {item.target_id}
                      </code>
                    </TableCell>
                    <TableCell>{item.reportCount}</TableCell>
                    <TableCell>
                      <StatusBadge value={item.status} />
                    </TableCell>
                    <TableCell>{formatDate(item.updated_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {item.status === "open" ||
                        item.status === "reviewing" ? (
                          <>
                            <AdminActionDialog
                              title="Assign moderation case"
                              description="Assign this case to yourself and move it into review."
                              confirmLabel="Assign to me"
                              trigger={
                                <Button size="sm" variant="outline">
                                  Assign
                                </Button>
                              }
                              onConfirm={async (reason) => {
                                await apiPostRequired(
                                  `/api/admin/reports/${item.id}/assign`,
                                  { adminId: currentUser?.id ?? null, reason },
                                );
                                await queryClient.invalidateQueries({
                                  queryKey: ["admin", "reports"],
                                });
                              }}
                            />
                            <AdminActionDialog
                              title="Dismiss report"
                              description="Close this case without changing the target."
                              confirmLabel="Dismiss"
                              trigger={
                                <Button size="sm" variant="outline">
                                  Dismiss
                                </Button>
                              }
                              onConfirm={(reason, note) =>
                                act(item, "dismiss", reason, note)
                              }
                            />
                            {item.target_type === "user" ? (
                              <AdminActionDialog
                                title="Suspend user"
                                description="A transactional email is attempted before every session is revoked."
                                confirmLabel="Suspend"
                                destructive
                                trigger={
                                  <Button size="sm" variant="destructive">
                                    Suspend
                                  </Button>
                                }
                                onConfirm={(reason, note) =>
                                  act(item, "suspend", reason, note)
                                }
                              />
                            ) : (
                              <AdminActionDialog
                                title={`Hide ${item.target_type}`}
                                description="The target will disappear from member-facing APIs and private media routes."
                                confirmLabel="Hide"
                                destructive
                                trigger={
                                  <Button size="sm" variant="destructive">
                                    Hide
                                  </Button>
                                }
                                onConfirm={(reason, note) =>
                                  act(item, "hide", reason, note)
                                }
                              />
                            )}
                          </>
                        ) : item.status === "resolved" &&
                          ["hide", "suspend"].includes(
                            item.resolution_action ?? "",
                          ) ? (
                          <AdminActionDialog
                            title={
                              item.target_type === "user"
                                ? "Restore user"
                                : `Restore ${item.target_type}`
                            }
                            description="Reverse the previous moderation action while retaining its audit history."
                            confirmLabel="Restore"
                            trigger={<Button size="sm">Restore</Button>}
                            onConfirm={(reason, note) =>
                              act(
                                item,
                                item.target_type === "user"
                                  ? "restore_user"
                                  : "restore",
                                reason,
                                note,
                              )
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </LoadingState>
    </section>
  );
}

function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [role, setRole] = useState("");
  const [admin, setAdmin] = useState("");
  const query = useQuery({
    queryKey: ["admin", "users", page, search, accountStatus, role, admin],
    queryFn: () =>
      getAdminPage<ManagedUser>("/api/admin/users", {
        page,
        pageSize: 20,
        search,
        accountStatus,
        role,
        admin,
      }),
  });
  const mutate = async (
    item: ManagedUser,
    action: string,
    reason: string,
    note: string,
  ) => {
    await adminDecision(`/api/admin/users/${item.id}/${action}`, reason, note);
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  };
  return (
    <section className="grid gap-4">
      <FilterBar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <Select
          value={accountStatus || "all"}
          onValueChange={(value) => {
            setAccountStatus(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={role || "all"}
          onValueChange={(value) => {
            setRole(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All personas</SelectItem>
            <SelectItem value="subscriber">Subscribers</SelectItem>
            <SelectItem value="creator">Creators</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={admin || "all"}
          onValueChange={(value) => {
            setAdmin(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any admin state</SelectItem>
            <SelectItem value="yes">Administrators</SelectItem>
            <SelectItem value="no">Non-administrators</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <LoadingState query={query}>
        {(data) => (
          <TablePanel controls={<PageControls {...data} onPage={setPage} />}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.email} · @{item.username}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{item.role}</TableCell>
                    <TableCell>
                      {item.adminRole ? (
                        <Badge variant="outline">{item.adminRole}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={item.accountStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <AdminActionDialog
                          title="Revoke sessions"
                          description="Sign the user out on every device."
                          confirmLabel="Revoke"
                          trigger={
                            <Button size="sm" variant="outline">
                              Sessions
                            </Button>
                          }
                          onConfirm={(reason, note) =>
                            mutate(item, "revoke-sessions", reason, note)
                          }
                        />
                        {item.accountStatus === "active" ? (
                          <AdminActionDialog
                            title="Suspend user"
                            description="Block sign-in, revoke sessions, and hide the user's content."
                            confirmLabel="Suspend"
                            destructive
                            trigger={
                              <Button size="sm" variant="destructive">
                                Suspend
                              </Button>
                            }
                            onConfirm={(reason, note) =>
                              mutate(item, "suspend", reason, note)
                            }
                          />
                        ) : (
                          <AdminActionDialog
                            title="Restore user"
                            description="Restore sign-in and member-facing content visibility."
                            confirmLabel="Restore"
                            trigger={<Button size="sm">Restore</Button>}
                            onConfirm={(reason, note) =>
                              mutate(item, "restore", reason, note)
                            }
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </LoadingState>
    </section>
  );
}

type HealthPayload = {
  overall: "healthy" | "attention";
  signals: Record<string, { status: string; value: unknown }>;
  cloudflareDashboardUrl: string | null;
};
function Health() {
  const query = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => apiGetRequired<HealthPayload>("/api/admin/health"),
    refetchInterval: 60_000,
  });
  return (
    <LoadingState query={query}>
      {(data) => (
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <StatusBadge value={data.overall} />
            {data.cloudflareDashboardUrl ? (
              <Button variant="outline" asChild>
                <a
                  href={data.cloudflareDashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink />
                  Cloudflare metrics
                </a>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(data.signals).map(([key, signal]) => (
              <Card key={key}>
                <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
                  <CardTitle className="text-sm capitalize">
                    {key.replace(/([A-Z])/g, " $1")}
                  </CardTitle>
                  <StatusBadge value={signal.status} />
                </CardHeader>
                <CardContent>
                  <pre className="overflow-auto text-xs text-muted-foreground">
                    {typeof signal.value === "object"
                      ? JSON.stringify(signal.value, null, 2)
                      : String(signal.value ?? "No data")}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </LoadingState>
  );
}

type AuditEntry = {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: number;
};
function AuditLog() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "audit", page],
    queryFn: () =>
      getAdminPage<AuditEntry>("/api/admin/audit-log", { page, pageSize: 30 }),
  });
  return (
    <LoadingState query={query}>
      {(data) => (
        <TablePanel controls={<PageControls {...data} onPage={setPage} />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Administrator</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.actorEmail}</TableCell>
                  <TableCell>
                    <code className="text-xs">{item.action}</code>
                  </TableCell>
                  <TableCell>
                    <div>{item.targetType}</div>
                    <code className="text-xs text-muted-foreground">
                      {item.targetId}
                    </code>
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    {item.reason ?? "—"}
                  </TableCell>
                  <TableCell>{formatDate(item.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TablePanel>
      )}
    </LoadingState>
  );
}

type Administrator = {
  userId: string;
  role: AdminRole;
  email: string;
  username: string;
  accountStatus: string;
  createdAt: number;
};
function Administrators() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AdminRole>("moderator");
  const query = useQuery({
    queryKey: ["admin", "administrators"],
    queryFn: () =>
      apiGetRequired<{ items: Administrator[] }>("/api/admin/administrators"),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "administrators"] });
  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Grant administrator access
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="User ID"
          />
          <Select
            value={role}
            onValueChange={(value) => setRole(value as AdminRole)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="moderator">Moderator</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
          <AdminActionDialog
            title="Grant administrator access"
            description="Administrative access is separate from the creator or subscriber persona."
            confirmLabel="Grant"
            trigger={
              <Button disabled={!userId.trim()}>
                <ShieldPlus />
                Grant
              </Button>
            }
            onConfirm={async (reason) => {
              await apiPostRequired(
                `/api/admin/administrators/${userId.trim()}`,
                { role, reason },
              );
              setUserId("");
              await refresh();
            }}
          />
        </CardContent>
      </Card>
      <LoadingState query={query}>
        {(data) => (
          <TablePanel>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Administrator</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.userId}>
                    <TableCell>
                      <div className="font-medium">{item.email}</div>
                      <div className="text-xs text-muted-foreground">
                        @{item.username}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={item.accountStatus} />
                    </TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <AdminActionDialog
                          title="Change administrator role"
                          description="The final owner cannot be demoted."
                          confirmLabel={
                            item.role === "owner" ? "Demote" : "Promote"
                          }
                          trigger={
                            <Button size="sm" variant="outline">
                              {item.role === "owner" ? "Moderator" : "Owner"}
                            </Button>
                          }
                          onConfirm={async (reason) => {
                            await apiPostRequired(
                              `/api/admin/administrators/${item.userId}`,
                              {
                                role:
                                  item.role === "owner" ? "moderator" : "owner",
                                reason,
                              },
                            );
                            await refresh();
                          }}
                        />
                        <AdminActionDialog
                          title="Revoke administrator access"
                          description="The final owner cannot be removed."
                          confirmLabel="Revoke"
                          destructive
                          trigger={
                            <Button size="sm" variant="destructive">
                              Revoke
                            </Button>
                          }
                          onConfirm={async (reason) => {
                            await revokeAdministrator(item.userId, reason);
                            await refresh();
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </LoadingState>
    </section>
  );
}

function FilterBar({
  search,
  onSearch,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search"
        />
      </div>
      {children}
    </div>
  );
}

function TablePanel({
  children,
  controls,
}: {
  children: ReactNode;
  controls?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="overflow-x-auto">{children}</div>
      {controls}
    </div>
  );
}

function LoadingState<T>({
  query,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data?: T;
    refetch: () => unknown;
    isFetching: boolean;
  };
  children: (data: T) => ReactNode;
}) {
  if (query.isPending)
    return (
      <div className="flex min-h-52 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <Card>
        <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-destructive">
            {query.error?.message ?? "Unable to load admin data."}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            <RefreshCw />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  return <>{children(query.data)}</>;
}
