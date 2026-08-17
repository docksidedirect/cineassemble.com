import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight,
  Clapperboard,
  Film,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  UserCircle,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { api, type JobSummary, type User } from "@/api";

const statusColor: Record<string, string> = {
  queued: "border-zinc-700 bg-zinc-800 text-zinc-300",
  running: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
};

const fieldClassName =
  "h-11 border-white/10 bg-black/20 text-sm shadow-none transition-colors hover:border-white/20 focus:border-amber-400/60";

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">
      {children}
    </p>
  );
}

function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition-all ${
        selected
          ? "border-amber-400/60 bg-amber-400/10 shadow-[0_0_30px_rgba(245,158,11,0.08)]"
          : "border-white/10 bg-black/20 hover:border-white/25"
      }`}
    >
      <div className="mb-1 text-sm font-medium text-zinc-100">
        <span className="mr-2">{icon}</span>
        {title}
      </div>
      <div className="text-xs leading-relaxed text-zinc-500">{desc}</div>
    </button>
  );
}

const TIER_INFO: Record<string, { icon: string; name: string; desc: string }> =
  {
    budget: {
      icon: "🖼️",
      name: "Budget — free",
      desc: "Still images with a slow zoom. Characters do NOT move. Good for cheap drafts.",
    },
    standard: {
      icon: "🏃",
      name: "Standard — best value",
      desc: "~$0.20/clip. Characters really move (fal.ai animation). Best quality per dollar.",
    },
    premium: {
      icon: "✨",
      name: "Premium — smoothest",
      desc: "~$0.25/clip. Best motion quality (Kling). Costs the most per film.",
    },
  };

const TYPE_INFO: Record<string, { icon: string; name: string; desc: string }> =
  {
    story: {
      icon: "🎬",
      name: "Story cartoon",
      desc: "Animated characters act out your story — bedtime tales, adventures, mysteries.",
    },
    product: {
      icon: "🚀",
      name: "Product boost",
      desc: "Promo for a product or brand: hook → problem → product hero → benefits → call to action.",
    },
    human: {
      icon: "🧑",
      name: "Realistic human",
      desc: "Photoreal people instead of cartoons — cinematic, film-like scenes with real actors.",
    },
  };

const PROMPT_PLACEHOLDER: Record<string, string> = {
  story:
    "A curious little silverfish detective named Silvie investigates a mysterious crumb theft in a cozy kitchen…",
  product:
    "A promo for 'Bubbles', a strawberry-scented kids' shampoo that makes bath time fun — show happy kids and the shiny bottle…",
  human:
    "A young teacher discovers a mysterious letter on her desk and follows its clues across the city at dusk…",
};

export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [minutes, setMinutes] = useState(3);
  const [voice, setVoice] = useState("auto");
  const [tier, setTier] = useState("standard");
  const [style, setStyle] = useState("");
  const [mode, setMode] = useState("narration");
  const [videoType, setVideoType] = useState("story");
  const [language, setLanguage] = useState("English");
  const [subtitles, setSubtitles] = useState(true);
  const [lipsync, setLipsync] = useState(false);
  const [lipsyncConfigured, setLipsyncConfigured] = useState(false);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [voices, setVoices] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [tiers, setTiers] = useState<
    { id: string; label: string; clipCost: number }[]
  >([]);
  const [typeIds, setTypeIds] = useState<string[]>([
    "story",
    "product",
    "human",
  ]);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [saasMode, setSaasMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // one-time banners after PayPal redirects back (?sub=ok / ?pack=ok)
  const banner =
    searchParams.get("sub") === "ok"
      ? "✅ Subscription active — credits arrive with the first PayPal payment confirmation (usually within a minute)."
      : searchParams.get("pack") === "ok"
        ? "✅ Credit pack purchased — credits added to your account."
        : "";

  useEffect(() => {
    api.options().then((o) => {
      setVoices(o.voices);
      setStyles(o.styles);
      setStyle(o.styles[0]);
      setTiers(o.tiers || []);
      setLipsyncConfigured(Boolean(o.lipsyncConfigured));
      if (o.videoTypes?.length)
        setTypeIds(
          o.videoTypes.map((v: any) => (typeof v === "string" ? v : v.id)),
        );
      if (o.languages?.length) setLanguages(o.languages);
      setSaasMode(Boolean(o.saasMode));
      // server-chosen defaults (env DEFAULT_TIER / DEFAULT_MODE)
      if (o.defaults?.tier) setTier(o.defaults.tier);
      if (o.defaults?.mode) {
        setMode(o.defaults.mode);
        setSubtitles(o.defaults.mode !== "dialogue");
      }
    });
    api
      .me()
      .then((r) => {
        // SaaS mode: nobody uses the studio without logging in first
        if (r.saasMode && !r.user) {
          navigate("/login", { replace: true });
          return;
        }
        setUser(r.user);
        setSaasMode(r.saasMode);
      })
      .catch(() => {});

    const load = () =>
      api
        .jobs()
        .then(setJobs)
        .catch(() => {});
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, []);

  // picking a film type suggests the matching art direction (user can still change it)
  const STYLE_FOR_TYPE: Record<string, string> = {
    story: "Pixar-style cozy 3D cartoon",
    product: "Clean studio product commercial",
    human: "Photorealistic cinematic (real people)",
  };

  function onRefImageFile(file: File | null) {
    if (!file) return setRefImage(null);
    if (file.size > 4 * 1024 * 1024) {
      setError("Reference photo must be smaller than 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRefImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  // live rough-cost estimate for the current selections (USD)
  const sceneCount = Math.max(1, Math.round((minutes * 60) / 9));
  const imgCost = tier === "budget" ? 0.02 : tier === "premium" ? 0.19 : 0.05;
  const tierClipCost = tiers.find((t) => t.id === tier)?.clipCost ?? 0;
  const estimatedCost =
    0.01 +
    sceneCount *
      (imgCost + (mode === "dialogue" ? 0.009 : 0.003) + tierClipCost) +
    (mode === "dialogue" && lipsync ? sceneCount * 9.3 * (0.4 / 60) : 0);

  async function generate() {
    setBusy(true);
    setError("");

    const res = await api.create({
      prompt,
      targetMinutes: minutes,
      voice,
      qualityTier: tier,
      stylePreset: style,
      mode,
      videoType,
      language,
      subtitles,
      lipsync: mode === "dialogue" && lipsync,
      referenceImage: refImage,
    });

    setBusy(false);
    if ("error" in res) {
      setError(
        "needCredits" in res && res.needCredits
          ? `${res.error} — top up on the pricing page.`
          : res.error,
      );
      if ("needCredits" in res && res.needCredits) navigate("/pricing");
    } else navigate(`/job/${res.id}`);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(circle_at_50%_-10%,rgba(245,158,11,0.14),transparent_62%)]" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="mb-8 flex flex-col gap-7 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 shadow-[0_0_40px_rgba(245,158,11,0.12)] sm:h-14 sm:w-14">
              <Clapperboard className="h-6 w-6 text-amber-300 sm:h-7 sm:w-7" />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">
                AI film studio
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                StoryMotion
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
                Turn a single idea into an illustrated, animated, voiced film —
                cartoon, product promo or realistic.
              </p>
            </div>
          </div>

          {saasMode ? (
            user ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2.5 backdrop-blur-xl">
                <UserCircle className="h-6 w-6 text-amber-300" />
                <div className="text-sm">
                  <div className="max-w-[160px] truncate font-medium text-zinc-100">
                    {user.email}
                  </div>
                  <div className="text-xs text-zinc-500">
                    <span className="font-semibold text-amber-300">
                      {user.credits}
                    </span>{" "}
                    credits
                  </div>
                </div>
                <Link
                  to="/pricing"
                  className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/20"
                >
                  Top up
                </Link>
                <button
                  onClick={() => api.logout().then(() => navigate("/"))}
                  className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Log out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-400/20"
              >
                Log in
              </Link>
            )
          ) : (
            <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              Studio ready
            </div>
          )}
        </header>

        {banner && (
          <div className="mb-8 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <span>{banner}</span>
            <button
              onClick={() => setSearchParams({}, { replace: true })}
              className="text-emerald-500 transition-colors hover:text-emerald-300"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Card className="overflow-hidden rounded-3xl border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20 backdrop-blur-xl">
            <CardHeader className="border-b border-white/10 px-5 py-5 sm:px-8 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionEyebrow>Production brief</SectionEyebrow>
                  <CardTitle className="flex items-center gap-2 text-xl text-white sm:text-2xl">
                    <Sparkles className="h-5 w-5 text-amber-300" />
                    Create a new film
                  </CardTitle>
                </div>
                <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 sm:block">
                  ≈ ${estimatedCost.toFixed(2)}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
              {/* ---- type of film ---- */}
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-200">
                  Type of film
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {typeIds.map((id) => {
                    const info = TYPE_INFO[id] || {
                      icon: "🎬",
                      name: id,
                      desc: "",
                    };
                    return (
                      <ChoiceCard
                        key={id}
                        selected={videoType === id}
                        onClick={() => {
                          setVideoType(id);
                          const match = STYLE_FOR_TYPE[id];
                          if (match && styles.includes(match)) setStyle(match);
                        }}
                        icon={info.icon}
                        title={info.name}
                        desc={info.desc}
                      />
                    );
                  })}
                </div>
              </div>

              {/* ---- prompt ---- */}
              <div>
                <label
                  htmlFor="story-prompt"
                  className="mb-3 block text-sm font-medium text-zinc-200"
                >
                  {videoType === "product"
                    ? "Describe your product and who it's for"
                    : "What should happen in your film?"}
                </label>
                <Textarea
                  id="story-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder={
                    PROMPT_PLACEHOLDER[videoType] || PROMPT_PLACEHOLDER.story
                  }
                  className="min-h-[140px] resize-y rounded-2xl border-white/10 bg-black/20 px-4 py-3.5 text-sm leading-6 placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-amber-400/20"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    Be specific about characters, setting, and the emotional
                    arc.
                  </span>
                  <span>{prompt.length}/2000</span>
                </div>
              </div>

              {/* ---- who tells the story ---- */}
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-200">
                  Who tells the story?
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    selected={mode === "narration"}
                    onClick={() => {
                      setMode("narration");
                      setSubtitles(true);
                      setLipsync(false);
                    }}
                    icon="🎙"
                    title="Narrator tells the story"
                    desc="One warm storyteller voice over the whole film — like an audiobook with moving pictures."
                  />
                  <ChoiceCard
                    selected={mode === "dialogue"}
                    onClick={() => {
                      setMode("dialogue");
                      setSubtitles(false); // clean screen by default
                    }}
                    icon="💬"
                    title="Characters talk to each other"
                    desc="Each character speaks with their OWN voice — kids sound like kids. Best with lip-sync below."
                  />
                </div>
              </div>

              {/* ---- animation quality ---- */}
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-200">
                  Animation quality — decides if characters really move
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {tiers.map((t) => {
                    const info = TIER_INFO[t.id] || {
                      icon: "🎬",
                      name: t.label,
                      desc:
                        t.clipCost === 0 ? "Free." : `~$${t.clipCost}/clip.`,
                    };
                    return (
                      <ChoiceCard
                        key={t.id}
                        selected={tier === t.id}
                        onClick={() => setTier(t.id)}
                        icon={info.icon}
                        title={info.name}
                        desc={info.desc}
                      />
                    );
                  })}
                </div>
              </div>

              {/* ---- details ---- */}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="mb-3 flex items-center justify-between text-sm font-medium text-zinc-200">
                    <span>Film length</span>
                    <span className="font-semibold text-amber-300">
                      {minutes} min
                    </span>
                  </label>
                  <Slider
                    value={[minutes]}
                    onValueChange={([value]) => setMinutes(value)}
                    min={1}
                    max={5}
                    step={1}
                    aria-label="Film length in minutes"
                    className="py-2"
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-zinc-600">
                    <span>1 min</span>
                    <span>
                      ≈ {Math.round((minutes * 60) / 9)} scenes · 5 min
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-200">
                    Film language
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className={fieldClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {language !== "English" && (
                    <p className="mt-2 text-xs text-zinc-500">
                      🗣 Voices speak {language.split(" ")[0]} · subtitles too.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-200">
                    Art direction
                  </label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger className={fieldClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {styles.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-200">
                    {mode === "dialogue"
                      ? "Character voices"
                      : "Narrator voice"}
                  </label>
                  <Select
                    value={voice}
                    onValueChange={setVoice}
                    disabled={mode === "dialogue"}
                  >
                    <SelectTrigger className={fieldClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        ✨ Auto — match the story
                      </SelectItem>
                      {voices.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mode === "dialogue" && (
                    <p className="mt-2 text-xs text-zinc-500">
                      ✨ Automatic — each character gets a distinct voice; kids
                      get kid-like voices.
                    </p>
                  )}
                </div>
              </div>

              {/* ---- finishing options ---- */}
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <WandSparkles className="h-4 w-4 text-amber-300" />
                  Finishing options
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
                    <Checkbox
                      checked={subtitles}
                      onCheckedChange={(value) => setSubtitles(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium text-zinc-200">
                        On-screen subtitles
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        Words at the bottom. Off = clean screen (only the
                        opening title has text).
                      </span>
                    </span>
                  </label>

                  {mode === "dialogue" && (
                    <label
                      className={`flex items-start gap-3 text-sm ${
                        lipsyncConfigured
                          ? "cursor-pointer text-zinc-300"
                          : "cursor-not-allowed text-zinc-600"
                      }`}
                      title={
                        lipsyncConfigured
                          ? undefined
                          : "Add FAL_KEY to .env to enable lip-sync"
                      }
                    >
                      <Checkbox
                        checked={lipsync}
                        disabled={!lipsyncConfigured}
                        onCheckedChange={(value) => setLipsync(value === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-medium">
                          Lip-sync dialogue
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">
                          Mouths move with the words · ~$0.40/min (fal.ai)
                          {!lipsyncConfigured && " · needs FAL_KEY"}.
                        </span>
                      </span>
                    </label>
                  )}
                </div>

                {/* reference photo → same character/product in every scene */}
                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-amber-300 transition-colors hover:text-amber-200">
                      <ImagePlus className="h-4 w-4" />
                      {refImage
                        ? videoType === "product"
                          ? "Change product photo"
                          : "Change reference photo"
                        : videoType === "product"
                          ? "📦 Upload YOUR product photo (recommended!)"
                          : "Upload a character reference photo (optional)"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          onRefImageFile(e.target.files?.[0] || null)
                        }
                      />
                    </label>
                    {refImage && (
                      <>
                        <img
                          src={refImage}
                          alt="reference"
                          className="h-12 w-12 rounded-xl border border-white/15 object-cover"
                        />
                        <button
                          onClick={() => setRefImage(null)}
                          className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" /> Remove
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {videoType === "product"
                      ? "Your REAL product photo — the AI features this exact product (shape, label, colors) in the film. Max 4 MB."
                      : "A drawing or photo of your hero — every scene keeps the same face & outfit. Max 4 MB."}
                  </p>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                >
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-lg text-xs leading-5 text-zinc-500">
                  {minutes}-minute film · ≈{sceneCount} scenes · rough cost{" "}
                  <span className="font-semibold text-amber-300">
                    ≈ ${estimatedCost.toFixed(2)}
                  </span>{" "}
                  · render time 15–45 minutes.
                </p>
                <Button
                  onClick={generate}
                  disabled={busy || prompt.trim().length < 5}
                  className="h-12 w-full shrink-0 rounded-xl bg-amber-400 px-6 font-semibold text-zinc-950 shadow-lg shadow-amber-500/10 transition-all hover:bg-amber-300 sm:w-auto"
                  size="lg"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Film className="mr-2 h-5 w-5" />
                  )}
                  {busy ? "Preparing film…" : "Generate my film"}
                  {!busy && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-4 xl:sticky xl:top-8">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
              <p className="mb-4 text-sm font-semibold text-white">
                Your production pipeline
              </p>
              <div className="space-y-4 text-sm text-zinc-400">
                {[
                  "Script & voices",
                  "Illustration & animation",
                  "Music & final render",
                ].map((step, index) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10 text-xs font-semibold text-amber-300">
                      0{index + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="px-1 text-xs leading-5 text-zinc-600">
              You can track each film's progress and revisit completed projects
              below.
            </p>
          </aside>
        </div>

        <section className="mt-14 sm:mt-20">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <SectionEyebrow>Project library</SectionEyebrow>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Your films
              </h2>
            </div>
            {jobs.length > 0 && (
              <span className="text-sm text-zinc-500">
                {jobs.length} project{jobs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center sm:py-14">
              <Film className="mx-auto mb-3 h-7 w-7 text-zinc-700" />
              <p className="text-sm text-zinc-500">
                No films yet — your first story starts above.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((job) => (
                <Card
                  key={job.id}
                  className="rounded-2xl border-white/10 bg-white/[0.035] transition-colors hover:border-white/20"
                >
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <Link
                        to={`/job/${job.id}`}
                        className="line-clamp-2 font-medium leading-6 text-zinc-100 transition-colors hover:text-amber-300"
                      >
                        {job.title}
                      </Link>
                      <Badge
                        variant="outline"
                        className={`shrink-0 capitalize ${statusColor[job.status] || statusColor.queued}`}
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <Progress
                      value={job.progress}
                      className="h-1.5 bg-white/10"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <span>
                        {job.targetMinutes} min · {job.stage} · {job.progress}%
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          api
                            .remove(job.id)
                            .then(() => api.jobs().then(setJobs))
                        }
                        className="rounded-md p-1 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Delete film"
                        aria-label={`Delete ${job.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
