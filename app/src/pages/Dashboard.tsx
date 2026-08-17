import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Film,
  FolderOpen,
  PlayCircle,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ApiError, api, type Job } from "../api";
import { useAuth } from "../auth";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  MetricCard,
  PageHeader,
  ProgressBar,
} from "../components/ui";

type FilterTab = "all" | "active" | "done" | "draft";

function statusTone(status: Job["status"]) {
  if (status === "done") return "green" as const;
  if (status === "error" || status === "cancelled") return "red" as const;
  if (status === "running" || status === "queued") return "blue" as const;
  if (status === "draft") return "amber" as const;
  return "neutral" as const;
}

function statusLabel(status: Job["status"]) {
  if (status === "done") return "Ready";
  if (status === "running") return "Rendering";
  if (status === "queued") return "Queued";
  if (status === "error") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "draft") return "Draft";
  return status;
}

export default function Dashboard() {
  const { user, credits } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.jobs();
    setJobs(result.jobs);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const interval = window.setInterval(() => load().catch(() => {}), 10000);
    return () => window.clearInterval(interval);
  }, [load]);

  const { activeJobs, doneJobs, draftJobs, stats } = useMemo(() => {
    const active = jobs.filter((j) => ["queued", "running"].includes(j.status));
    const done = jobs.filter((j) => j.status === "done");
    const draft = jobs.filter((j) => j.status === "draft");
    const minutes = done.reduce((sum, j) => sum + j.targetMinutes, 0);
    return {
      activeJobs: active,
      doneJobs: done,
      draftJobs: draft,
      stats: {
        active: active.length,
        done: done.length,
        draft: draft.length,
        minutes,
      },
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (filter === "active") return activeJobs;
    if (filter === "done") return doneJobs;
    if (filter === "draft") return draftJobs;
    return jobs;
  }, [jobs, activeJobs, doneJobs, draftJobs, filter]);

  const handleDelete = async (jobId: string, jobTitle: string) => {
    if (
      !window.confirm(
        `Delete "${jobTitle || "this project"}"? This cannot be undone.`,
      )
    )
      return;
    setDeletingId(jobId);
    try {
      await api.deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success("Project deleted.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Delete failed.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <LoadingBlock label="Opening your studio…" />;

  const hasJobs = jobs.length > 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <PageHeader
        eyebrow="Production workspace"
        title={`Good to see you, ${user?.displayName?.split(" ")[0] || "creator"}.`}
        description="Start a new film, track active renders, and manage your library."
        actions={
          <Link to="/studio/create">
            <Button>
              <Plus className="h-4 w-4" /> New production
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Available credits"
          value={
            credits?.unlimited ? "Unlimited" : String(credits?.balance ?? 0)
          }
          detail={
            user?.role === "admin" ? "Owner administrator" : user?.plan.name
          }
        />
        <MetricCard
          icon={Clock3}
          label="Active renders"
          value={String(stats.active)}
          detail={
            user?.role === "admin"
              ? "No concurrency limit"
              : `${user?.plan.maxConcurrentJobs ?? 1} concurrent on your plan`
          }
        />
        <MetricCard
          icon={Film}
          label="Completed films"
          value={String(stats.done)}
          detail="Private to your account"
        />
        <MetricCard
          icon={PlayCircle}
          label="Produced minutes"
          value={String(stats.minutes)}
          detail="Across completed films"
        />
      </div>

      {/* Active Renders — pulled to top, impossible to miss */}
      {activeJobs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
            </span>
            <h2 className="text-lg font-semibold text-white">Now Rendering</h2>
            <Badge tone="amber">{activeJobs.length} active</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeJobs.map((job) => (
              <Card key={job.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-white">
                      {job.title || job.prompt}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {job.filmType.replaceAll("_", " ")} · {job.aspectRatio}
                    </p>
                  </div>
                  <Badge tone={statusTone(job.status)}>
                    {statusLabel(job.status)}
                  </Badge>
                </div>
                <div className="mt-4">
                  <ProgressBar value={job.progress} />
                  <p className="mt-2 text-right text-xs text-zinc-500">
                    {job.progress}%
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-zinc-600">
                    {formatDistanceToNow(new Date(job.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <Link
                    to={`/studio/jobs/${job.id}`}
                    className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                  >
                    View details →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Main content: Films + Sidebar */}
      {hasJobs ? (
        <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
          {/* Film history */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Your Films</h2>
              <div className="flex rounded-lg bg-white/[0.04] p-1">
                {(["all", "active", "done", "draft"] as FilterTab[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setFilter(tab)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        filter === tab
                          ? "bg-white/[0.1] text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {tab === "all" && `All (${jobs.length})`}
                      {tab === "active" && `Active (${activeJobs.length})`}
                      {tab === "done" && `Completed (${doneJobs.length})`}
                      {tab === "draft" && `Drafts (${draftJobs.length})`}
                    </button>
                  ),
                )}
              </div>
            </div>

            {filteredJobs.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-sm text-zinc-500">
                  No films match this filter.
                </p>
                <button
                  onClick={() => setFilter("all")}
                  className="mt-2 text-xs font-semibold text-amber-300"
                >
                  Show all
                </button>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredJobs.map((job) => (
                  <div key={job.id} className="group relative">
                    <Link to={`/studio/jobs/${job.id}`} className="block">
                      <Card className="overflow-hidden transition hover:ring-1 hover:ring-amber-500/30">
                        {/* Thumbnail placeholder */}
                        <div className="flex h-32 items-center justify-center bg-white/[0.03]">
                          {job.status === "done" ? (
                            <PlayCircle className="h-8 w-8 text-zinc-600 transition group-hover:text-amber-300" />
                          ) : job.status === "error" ? (
                            <XCircle className="h-8 w-8 text-red-400" />
                          ) : (
                            <Film className="h-8 w-8 text-zinc-600" />
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="min-w-0 truncate text-sm font-semibold text-white">
                              {job.title || job.prompt}
                            </h3>
                            <Badge
                              tone={statusTone(job.status)}
                              className="shrink-0"
                            >
                              {statusLabel(job.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {job.filmType.replaceAll("_", " ")} ·{" "}
                            {job.aspectRatio} · {job.qualityTier}
                          </p>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-zinc-600">
                              {formatDistanceToNow(new Date(job.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                            {job.status === "done" && (
                              <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Ready
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    </Link>

                    {/* Delete button */}
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(job.id, job.title || job.prompt);
                      }}
                      className="absolute right-2 top-2 z-10 cursor-pointer rounded-lg bg-black/60 p-1.5 text-zinc-400 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                      role="button"
                      title="Delete project"
                    >
                      <Trash2
                        className={`h-3.5 w-3.5 ${deletingId === job.id ? "animate-pulse" : ""}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="overflow-hidden bg-[radial-gradient(circle_at_80%_0%,rgba(245,158,11,0.16),transparent_40%),#12141a] p-6">
              <Badge tone="amber">Recommended next</Badge>
              <h2 className="mt-4 font-display text-xl font-semibold text-white">
                Make a vertical social ad
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                9:16 format with karaoke captions. Built for Reels, TikTok, and
                Shorts.
              </p>
              <Link to="/studio/create?type=social_ad" className="mt-5 block">
                <Button variant="secondary" className="w-full">
                  Start social ad <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Reusable asset library
                  </p>
                  <p className="text-xs text-zinc-500">
                    Save products and characters once.
                  </p>
                </div>
              </div>
              <Link
                to="/studio/library"
                className="mt-4 block text-sm font-semibold text-amber-300"
              >
                Open library <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
              </Link>
            </Card>
          </div>
        </div>
      ) : (
        /* Empty state */
        <EmptyState
          icon={Film}
          title="Your first production is waiting"
          description="Choose a film type, set the format, add products or references, then review the script before spending credits."
          action={
            <Link to="/studio/create">
              <Button>
                Create your first film <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
