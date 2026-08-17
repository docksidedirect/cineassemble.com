import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  CheckCircle2,
  Clock3,
  Download,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  PencilLine,
  Play,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError, api, mediaUrl, type Job, type Scene } from "../api";
import {
  Badge,
  Button,
  Card,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  Textarea,
} from "../components/ui";

function statusTone(status: Job["status"]) {
  if (status === "done") return "green" as const;
  if (status === "error" || status === "cancelled") return "red" as const;
  if (status === "running" || status === "queued") return "blue" as const;
  return "amber" as const;
}

function SceneEditor({
  jobId,
  scene,
  editable,
  canRegenerate,
  onChanged,
}: {
  jobId: string;
  scene: Scene;
  editable: boolean;
  canRegenerate: boolean;
  onChanged: (job: Job) => void;
}) {
  const [narration, setNarration] = useState(scene.narration);
  const [imagePrompt, setImagePrompt] = useState(scene.imagePrompt);
  const [motionPrompt, setMotionPrompt] = useState(scene.motionPrompt);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [localImageAssetId, setLocalImageAssetId] = useState(
    scene.imageAssetId,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const replaceImage = async (file: File) => {
    setIsReplacing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.uploadSceneImage(jobId, scene.id, formData);
      setLocalImageAssetId(result.asset.id);
      toast.success(`Scene ${scene.index + 1} image replaced.`);
      const refreshed = await api.job(jobId);
      onChanged(refreshed.job);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to replace image.",
      );
    } finally {
      setIsReplacing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.updateScene(jobId, scene.id, {
        narration,
        imagePrompt,
        motionPrompt,
      });
      onChanged(result.job);
      toast.success(`Scene ${scene.index + 1} saved.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "The scene could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (
      !window.confirm(
        `Regenerate scene ${scene.index + 1}? Its narration and audio stay, while its image and motion are replaced.`,
      )
    )
      return;
    setRegenerating(true);
    try {
      const result = await api.regenerateScene(jobId, scene.id);
      onChanged(result.job);
      toast.success(`Scene ${scene.index + 1} queued for regeneration.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "The scene could not be regenerated.",
      );
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="group relative min-h-48 border-b border-white/[0.07] bg-black/25 md:border-b-0 md:border-r">
          {localImageAssetId ? (
            <img
              src={mediaUrl(localImageAssetId)}
              alt={`Scene ${scene.index + 1}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <Film className="h-8 w-8 text-zinc-800" />
            </div>
          )}

          {/* Hover overlay — Replace Image */}
          <div className="absolute inset-0 hidden items-center justify-center bg-black/60 group-hover:flex">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) replaceImage(file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isReplacing}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              {isReplacing ? "Uploading…" : "Replace image"}
            </Button>
          </div>

          <div className="absolute left-3 top-3 flex gap-2">
            <Badge tone="neutral">Scene {scene.index + 1}</Badge>
            <Badge
              tone={
                scene.status === "ready"
                  ? "green"
                  : scene.status === "error"
                    ? "red"
                    : "blue"
              }
            >
              {scene.status}
            </Badge>
          </div>
          <span className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2 py-1 text-[10px] text-zinc-300 backdrop-blur">
            Revision {scene.revision}
          </span>
        </div>

        <div className="p-5">
          {editable ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-zinc-400">
                  Narration or dialogue
                </span>
                <Textarea
                  rows={3}
                  value={narration}
                  onChange={(event) => setNarration(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-zinc-400">
                  Visual direction
                </span>
                <Textarea
                  rows={3}
                  value={imagePrompt}
                  onChange={(event) => setImagePrompt(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-zinc-400">
                  Camera and motion
                </span>
                <Textarea
                  rows={2}
                  value={motionPrompt}
                  onChange={(event) => setMotionPrompt(event.target.value)}
                />
              </label>
              <Button type="button" size="sm" loading={saving} onClick={save}>
                <Save className="h-3.5 w-3.5" /> Save scene
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm leading-6 text-zinc-200">
                {scene.narration}
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                    Visual direction
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {scene.imagePrompt}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                    Motion
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {scene.motionPrompt}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {scene.clipAssetId ? (
                  <a
                    href={mediaUrl(scene.clipAssetId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button type="button" variant="secondary" size="sm">
                      <Play className="h-3.5 w-3.5" /> Preview clip
                    </Button>
                  </a>
                ) : null}
                {canRegenerate ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={regenerating}
                    onClick={regenerate}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate this scene
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {scene.errorMessage ? (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-xs leading-5 text-red-200">
              {scene.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default function JobPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api.job(id);
      setJob(result.job);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The film could not be loaded.",
      );
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const interval = window.setInterval(() => load(), 5000);
    return () => window.clearInterval(interval);
  }, [job, load]);

  const approve = async () => {
    if (!job) return;
    if (
      !window.confirm(
        `Approve this script and reserve ${job.estimatedCredits} credit(s) for rendering?`,
      )
    )
      return;
    setAction("approve");
    try {
      const result = await api.approveDraft(job.id);
      setJob(result.job);
      toast.success("Film approved and queued.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError
          ? caught.message
          : "The film could not be approved.",
      );
    } finally {
      setAction("");
    }
  };

  const retry = async () => {
    if (!job) return;
    setAction("retry");
    try {
      await api.retryJob(job.id);
      await load();
      toast.success(
        "The film was re-queued and completed scenes will be reused.",
      );
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Retry failed.",
      );
    } finally {
      setAction("");
    }
  };

  const cancel = async () => {
    if (
      !job ||
      !window.confirm("Cancel this render and refund its reserved credits?")
    )
      return;
    setAction("cancel");
    try {
      await api.cancelJob(job.id);
      await load();
      toast.success("Render cancelled and reserved credits refunded.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Cancellation failed.",
      );
    } finally {
      setAction("");
    }
  };

  const remove = async () => {
    if (!job || !window.confirm("Delete this project from your workspace?"))
      return;
    setAction("delete");
    try {
      await api.deleteJob(job.id);
      navigate("/studio");
      toast.success("Project deleted.");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Deletion failed.",
      );
    } finally {
      setAction("");
    }
  };

  if (loading) return <LoadingBlock label="Loading film workspace…" />;
  if (!job)
    return (
      <Card className="p-6 text-sm text-red-200">
        {error || "Film not found."}
        <Link to="/studio" className="mt-4 block text-amber-300">
          Return to studio
        </Link>
      </Card>
    );

  const active = ["queued", "running"].includes(job.status);
  const editable = job.status === "draft";
  const canRegenerate = ["done", "error"].includes(job.status);

  return (
    <div className="space-y-8">
      <Link
        to="/studio"
        className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-zinc-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to studio
      </Link>
      <PageHeader
        eyebrow={editable ? "Script review" : "Film production"}
        title={job.title || job.prompt}
        description={`${job.filmType.replaceAll("_", " ")} · ${job.aspectRatio} · ${job.targetMinutes} min · ${job.qualityTier}`}
        actions={
          <>
            <Badge tone={statusTone(job.status)} className="h-9 px-3">
              {job.status}
            </Badge>
            {job.status === "done" && job.finalAssetId ? (
              <a href={mediaUrl(job.finalAssetId, true)}>
                <Button variant="secondary">
                  <Download className="h-4 w-4" /> Download
                </Button>
              </a>
            ) : null}
          </>
        }
      />

      {active ? (
        <Card className="border-sky-400/15 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/10 text-sky-300">
                <LoaderCircle className="h-4 w-4 animate-spin" />
              </span>
              <div>
                <p className="text-sm font-semibold capitalize text-white">
                  {job.stage.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  The durable worker can resume completed scenes after an
                  interruption.
                </p>
              </div>
            </div>
            <span className="text-sm font-bold text-sky-300">
              {job.progress}%
            </span>
          </div>
          <ProgressBar value={job.progress} className="mt-5" />
          <Button
            variant="ghost"
            size="sm"
            loading={action === "cancel"}
            onClick={cancel}
            className="mt-3"
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel render
          </Button>
        </Card>
      ) : null}

      {job.status === "error" ? (
        <Card className="border-red-400/20 bg-red-400/[0.045] p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div className="flex-1">
              <p className="font-semibold text-red-100">Production paused</p>
              <p className="mt-2 text-sm leading-6 text-red-100/70">
                {job.errorMessage ||
                  "The worker could not complete this production."}
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={action === "retry"}
                onClick={retry}
                className="mt-4"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Resume missing work
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {job.status === "done" && job.finalAssetId ? (
        <Card className="overflow-hidden">
          <div className="aspect-video bg-black">
            <video
              className="h-full w-full"
              controls
              preload="metadata"
              src={mediaUrl(job.finalAssetId)}
            />
          </div>
          <div className="flex flex-col justify-between gap-4 border-t border-white/[0.07] p-5 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Final film
                ready
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {job.actualCostUsd
                  ? `$${job.actualCostUsd.toFixed(2)} provider cost`
                  : "Completed"}{" "}
                · {job.chargedCredits} credit(s)
              </p>
            </div>
            <a href={mediaUrl(job.finalAssetId, true)}>
              <Button>
                <Download className="h-4 w-4" /> Download MP4
              </Button>
            </a>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Estimated credits
          </p>
          <p className="mt-2 text-xl font-semibold text-white">
            {job.estimatedCredits}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Estimated provider cost
          </p>
          <p className="mt-2 text-xl font-semibold text-white">
            ${job.estimatedCostUsd.toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Captions
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Captions className="h-4 w-4 text-amber-300" />
            {job.karaokeCaptions
              ? "Karaoke"
              : job.subtitles
                ? "Standard"
                : "Off"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Created
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Clock3 className="h-4 w-4 text-amber-300" />
            {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
          </p>
        </Card>
      </div>

      <section>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
              {editable ? "Editable script" : "Scene timeline"}
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-white">
              {job.scenes?.length || 0} planned scenes
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              {editable
                ? "Save any scene edits, then approve only when the entire script feels right."
                : "Completed scenes stay reusable when one scene needs another pass."}
            </p>
          </div>
          {editable ? (
            <Button loading={action === "approve"} onClick={approve}>
              <PencilLine className="h-4 w-4" /> Approve script & render
            </Button>
          ) : null}
        </div>
        <div className="space-y-4">
          {job.scenes?.map((scene) => (
            <SceneEditor
              key={scene.id}
              jobId={job.id}
              scene={scene}
              editable={editable}
              canRegenerate={canRegenerate}
              onChanged={setJob}
            />
          ))}
        </div>
      </section>

      {job.events?.length ? (
        <Card className="p-5">
          <h2 className="font-semibold text-white">Production activity</h2>
          <div className="mt-4 space-y-3">
            {job.events
              .slice()
              .reverse()
              .slice(0, 12)
              .map((event) => (
                <div key={event.id} className="flex gap-3 text-xs">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400/70" />
                  <div>
                    <p className="text-zinc-300">{event.message}</p>
                    <p className="mt-1 text-zinc-600">
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ) : null}

      {!active ? (
        <div className="flex justify-end border-t border-white/[0.07] pt-6">
          <Button
            variant="danger"
            loading={action === "delete"}
            onClick={remove}
          >
            <Trash2 className="h-4 w-4" /> Delete project
          </Button>
        </div>
      ) : null}
    </div>
  );
}
