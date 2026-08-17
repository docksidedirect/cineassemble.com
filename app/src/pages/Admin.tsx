import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  CircleAlert,
  Clock3,
  Film,
  Infinity as InfinityIcon,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  api,
  type AdminDashboard,
  type AdminJob,
  type AdminUser,
} from "../api";
import { useAuth } from "../auth";
import {
  Badge,
  Button,
  Card,
  Input,
  LoadingBlock,
  MetricCard,
  PageHeader,
  ProgressBar,
  selectClassName,
} from "../components/ui";
import { cn } from "../lib/utils";

export default function Admin() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "jobs">("overview");
  const [search, setSearch] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [summary, userResult, jobResult] = await Promise.all([
      api.adminDashboard(),
      api.adminUsers(search),
      api.adminJobs(jobStatus),
    ]);
    setDashboard(summary);
    setUsers(userResult.users);
    setJobs(jobResult.jobs);
  }, [jobStatus, search]);

  useEffect(() => {
    load()
      .catch((error) => toast.error(error instanceof ApiError ? error.message : "Admin data unavailable."))
      .finally(() => setLoading(false));
  }, [load]);

  const changeStatus = async (target: AdminUser) => {
    const next = target.status === "active" ? "suspended" : "active";
    if (!window.confirm(`${next === "suspended" ? "Suspend" : "Reactivate"} ${target.email}?`)) return;
    setBusy(target.id);
    try {
      await api.adminUserStatus(target.id, next);
      await load();
      toast.success(`Account ${next}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Status change failed.");
    } finally {
      setBusy("");
    }
  };

  const changeRole = async (target: AdminUser) => {
    const next = target.role === "admin" ? "user" : "admin";
    if (!window.confirm(`Change ${target.email} to ${next}? Administrator accounts have unlimited rendering.`)) return;
    setBusy(target.id);
    try {
      await api.adminUserRole(target.id, next);
      await load();
      toast.success(`Role changed to ${next}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Role change failed.");
    } finally {
      setBusy("");
    }
  };

  const adjustCredits = async (target: AdminUser) => {
    const raw = window.prompt(`Credits to add or remove for ${target.email}:`, "10");
    if (raw == null) return;
    const amount = Number(raw);
    const reason = window.prompt("Reason for this audited adjustment:", "Customer support adjustment");
    if (!Number.isInteger(amount) || amount === 0 || !reason) {
      toast.error("Enter a non-zero whole number and a reason.");
      return;
    }
    setBusy(target.id);
    try {
      await api.adminCredits(target.id, amount, reason);
      await load();
      toast.success("Credits adjusted and audit-logged.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Credit adjustment failed.");
    } finally {
      setBusy("");
    }
  };

  if (loading || !dashboard) return <LoadingBlock label="Opening protected administrator workspace…" />;

  const tabs = [
    ["overview", "Overview"],
    ["users", "Users"],
    ["jobs", "Jobs"],
  ] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protected owner controls"
        title="Administrator command center"
        description="Operational visibility and audited account controls. Your administrator role is enforced server-side and bypasses credit and render limits."
        actions={<Badge tone="amber" className="h-10 gap-2 px-4"><InfinityIcon className="h-4 w-4" /> Unlimited access</Badge>}
      />

      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1">
        {tabs.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition", tab === value ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300")}>{label}</button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Users} label="Total users" value={String(dashboard.users.total)} detail={`${dashboard.users.new30d} joined in 30 days`} />
            <MetricCard icon={Activity} label="Active renders" value={String(dashboard.jobs.active)} detail={`${dashboard.jobs.jobs30d} jobs in 30 days`} />
            <MetricCard icon={BadgeDollarSign} label="Estimated MRR" value={`$${(dashboard.financial.mrrCents / 100).toLocaleString()}`} detail={`${dashboard.financial.activeSubscriptions} active subscriptions`} />
            <MetricCard icon={CircleAlert} label="Failed jobs" value={String(dashboard.jobs.failed)} detail={`${dashboard.jobs.completed} completed`} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <Card className="overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4"><h2 className="font-semibold text-white">Recent production errors</h2><p className="mt-1 text-xs text-zinc-500">Latest failures across all tenants, visible only to administrators.</p></div>
              {dashboard.recentErrors.length ? <div className="divide-y divide-white/[0.06]">{dashboard.recentErrors.map((error) => <div key={error.id} className="px-5 py-4"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">{error.title || "Untitled production"}</p><Badge tone="red">{error.errorCode || "failed"}</Badge></div><p className="mt-1 text-xs text-zinc-500">{error.userEmail} · {error.filmType.replaceAll("_", " ")}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-red-200/60">{error.errorMessage || "No error message recorded."}</p></div>)}</div> : <div className="p-8 text-sm text-zinc-500">No production failures recorded.</div>}
            </Card>
            <div className="space-y-4">
              <Card className="p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-600">Provider economics</p><p className="mt-4 text-3xl font-semibold text-white">${dashboard.financial.providerCostUsd.toFixed(2)}</p><p className="mt-2 text-xs text-zinc-500">Recorded completed-job provider cost</p></Card>
              <Card className="p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-600">Average render time</p><p className="mt-4 flex items-center gap-2 text-3xl font-semibold text-white"><Clock3 className="h-5 w-5 text-amber-300" />{Math.round(dashboard.jobs.averageRenderSeconds / 60)}m</p><p className="mt-2 text-xs text-zinc-500">Across completed productions</p></Card>
              <Card className="border-amber-400/15 bg-amber-400/[0.04] p-5"><ShieldCheck className="h-5 w-5 text-amber-300" /><p className="mt-4 text-sm font-semibold text-amber-100">Admin identity</p><p className="mt-1 text-xs text-amber-100/50">{user?.email}</p></Card>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "users" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center">
            <div><h2 className="font-semibold text-white">Tenant accounts</h2><p className="mt-1 text-xs text-zinc-500">Role, status, credits, plan, and activity.</p></div>
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-600" /><Input className="w-full pl-9 sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or name" /></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.16em] text-zinc-600"><tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Credits</th><th className="px-5 py-3">Jobs</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Controls</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{users.map((target) => <tr key={target.id} className="hover:bg-white/[0.02]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.05] text-xs font-semibold text-amber-300">{target.displayName.slice(0, 1).toUpperCase()}</span><div><p className="font-semibold text-white">{target.displayName}</p><p className="text-xs text-zinc-500">{target.email}</p></div></div></td><td className="px-5 py-4"><Badge tone={target.role === "admin" ? "amber" : "neutral"}>{target.role === "admin" ? "Unlimited admin" : target.plan.name}</Badge></td><td className="px-5 py-4 font-semibold text-white">{target.unlimited ? "∞" : target.creditBalance}</td><td className="px-5 py-4 text-zinc-400">{target.jobCount}</td><td className="px-5 py-4"><Badge tone={target.status === "active" ? "green" : "red"}>{target.status}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy === target.id} onClick={() => adjustCredits(target)}>Credits</Button><Button size="sm" variant="ghost" disabled={busy === target.id || target.id === user?.id} onClick={() => changeRole(target)}>{target.role === "admin" ? "Make user" : "Make admin"}</Button><Button size="sm" variant={target.status === "active" ? "danger" : "secondary"} disabled={busy === target.id || target.id === user?.id} onClick={() => changeStatus(target)}>{target.status === "active" ? "Suspend" : "Activate"}</Button></div></td></tr>)}</tbody></table></div>
        </Card>
      ) : null}

      {tab === "jobs" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-white">All tenant jobs</h2><p className="mt-1 text-xs text-zinc-500">Operational state and provider economics across the service.</p></div><select className={`${selectClassName} w-full sm:w-52`} value={jobStatus} onChange={(event) => setJobStatus(event.target.value)}><option value="">All statuses</option><option value="queued">Queued</option><option value="running">Running</option><option value="done">Done</option><option value="error">Error</option><option value="cancelled">Cancelled</option></select></div>
          <div className="divide-y divide-white/[0.06]">{jobs.map((job) => <div key={job.id} className="px-5 py-4"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-amber-300"><Film className="h-4 w-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-white">{job.title || "Untitled production"}</p><Badge tone={job.status === "done" ? "green" : job.status === "error" ? "red" : "blue"}>{job.status}</Badge></div><p className="mt-1 text-xs text-zinc-500">{job.userEmail} · {job.filmType.replaceAll("_", " ")} · {job.aspectRatio} · {job.qualityTier}</p>{["queued", "running"].includes(job.status) ? <ProgressBar value={job.progress} className="mt-3 max-w-xl" /> : null}</div></div><div className="grid shrink-0 grid-cols-3 gap-4 text-right text-xs"><div><p className="text-zinc-600">Estimated</p><p className="mt-1 font-semibold text-zinc-300">${job.estimatedCostUsd.toFixed(2)}</p></div><div><p className="text-zinc-600">Actual</p><p className="mt-1 font-semibold text-zinc-300">${job.actualCostUsd.toFixed(2)}</p></div><div><p className="text-zinc-600">Credits</p><p className="mt-1 font-semibold text-zinc-300">{job.chargedCredits || job.estimatedCredits}</p></div></div></div></div>)}</div>
        </Card>
      ) : null}
    </div>
  );
}
