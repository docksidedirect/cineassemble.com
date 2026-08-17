import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BookOpenCheck,
  Bot,
  Captions,
  Check,
  Clapperboard,
  Film,
  Image as ImageIcon,
  MessageSquareText,
  Package,
  Play,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
  Sun,
  Users,
  WandSparkles,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ApiError,
  api,
  mediaUrl,
  type MetaOptions,
  type Product,
  type ReferenceAsset,
} from "../api";
import { useAuth } from "../auth";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Textarea,
  selectClassName,
} from "../components/ui";
import { cn } from "../lib/utils";

const typeIcons = {
  cartoon_story: WandSparkles,
  product_promo: Package,
  realistic_human: Users,
  social_ad: RectangleVertical,
  explainer: MessageSquareText,
  cinematic_story: Clapperboard,
  reference_video: ImageIcon,
} as const;

const styleOptions = [
  ["cinematic_3d", "Cinematic 3D"],
  ["product_photography", "Premium product photography"],
  ["documentary_realism", "Documentary realism"],
  ["clean_editorial", "Clean editorial"],
  ["high_energy_social", "High-energy social"],
  ["cinematic_realism", "Cinematic realism"],
  ["reference_faithful", "Reference-faithful"],
];

const voices = [
  "nova",
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "ballad",
  "marin",
  "cedar",
];

const TRANSITIONS = [
  ["none", "Hard cut"],
  ["fade", "Fade dissolve"],
  ["crossfade", "Cross dissolve"],
];

const COLOR_GRADES = [
  ["bright_clean", "Bright clean (recommended)"],
  ["none", "Neutral (no grade)"],
  ["warm", "Warm vintage"],
  ["cool", "Cool teal"],
  ["high_contrast", "Cinematic contrast"],
];

interface CharacterProfile {
  id: string;
  name: string;
  voice: string;
  description: string;
  referenceAssetId?: string;
  color?: string;
}

export default function CreateProduction() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { user } = useAuth();
  const [meta, setMeta] = useState<MetaOptions | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [characters, setCharacters] = useState<CharacterProfile[]>([]);

  const [form, setForm] = useState({
    filmType: search.get("type") || "cinematic_story",
    prompt: "",
    languageCode: "en",
    aspectRatio: search.get("type") === "social_ad" ? "9:16" : "16:9",
    targetMinutes: 1,
    voice: "nova",
    qualityTier: "standard",
    stylePreset:
      search.get("type") === "social_ad"
        ? "high_energy_social"
        : "cinematic_3d",
    mode: "dialogue",
    subtitles: false,
    karaokeCaptions: false,
    lipsync: true,
    productIds: [] as string[],
    referenceIds: [] as string[],
    transition: "fade",
    colorGrade: "bright_clean",
  });

  useEffect(() => {
    Promise.all([api.meta(), api.library()])
      .then(([metaResult, library]) => {
        setMeta(metaResult);
        setProducts(library.products);
        setReferences(library.references);
      })
      .catch((caught) =>
        setError(
          caught instanceof ApiError
            ? caught.message
            : "The production options could not be loaded.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (
      form.referenceIds.length > 0 &&
      form.stylePreset !== "reference_faithful"
    ) {
      setForm((current) => ({ ...current, stylePreset: "reference_faithful" }));
    }
  }, [form.referenceIds]);

  useEffect(() => {
    if (form.referenceIds.length > 0 && references.length > 0) {
      const selected = references.filter((r) =>
        form.referenceIds.includes(r.assetId),
      );
      const newChars: CharacterProfile[] = selected.map((ref, idx) => ({
        id: ref.assetId,
        name: ref.name || `Character ${idx + 1}`,
        voice: voices[idx % voices.length],
        description: ref.name || "",
        referenceAssetId: ref.assetId,
        color: ["#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6"][idx % 5],
      }));
      setCharacters(newChars);
    } else if (form.referenceIds.length === 0) {
      setCharacters([]);
    }
  }, [form.referenceIds, references]);

  const uploadReferences = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setError("");

    try {
      const csrf = await api.csrf();
      api.setCsrf(csrf.csrfToken);
    } catch {
      setError("Could not prepare upload. Please refresh.");
      setIsUploading(false);
      return;
    }

    try {
      const newRefs: ReferenceAsset[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
        formData.append("referenceType", "character");

        const result = await api.uploadReference(formData);
        newRefs.push(result.reference);
      }

      setReferences((prev) => [...prev, ...newRefs]);
      setForm((current) => ({
        ...current,
        referenceIds: [
          ...current.referenceIds,
          ...newRefs.map((r) => r.assetId),
        ],
      }));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Upload failed. Check the file size and try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const selectedType = useMemo(
    () => meta?.videoTypes.find((type) => type.id === form.filmType) || null,
    [form.filmType, meta],
  );

  const chooseType = (filmType: string) => {
    const type = meta?.videoTypes.find((item) => item.id === filmType);
    setForm((current) => ({
      ...current,
      filmType,
      targetMinutes: Math.max(
        type?.minMinutes || 1,
        Math.min(current.targetMinutes, type?.maxMinutes || 5),
      ),
      aspectRatio: filmType === "social_ad" ? "9:16" : current.aspectRatio,
      karaokeCaptions:
        filmType === "social_ad" ? true : current.karaokeCaptions,
      stylePreset: type?.defaultStyle || current.stylePreset || "cinematic_3d",
    }));
  };

  const toggleId = (field: "productIds" | "referenceIds", id: string) => {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((value) => value !== id)
        : [...current[field], id],
    }));
  };

  const updateCharacter = (
    assetId: string,
    updates: Partial<CharacterProfile>,
  ) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === assetId ? { ...c, ...updates } : c)),
    );
  };

  const validateStep = (targetStep: number): string[] => {
    const errs: string[] = [];

    if (targetStep >= 2) {
      if (!form.filmType) errs.push("Select a production type.");
      if (selectedType?.requiredReferences?.product) {
        if (form.productIds.length === 0)
          errs.push("Select at least one product for this production type.");
      }
      if (
        form.filmType === "reference_video" &&
        form.referenceIds.length === 0
      ) {
        errs.push("Upload at least one reference image for Reference Video.");
      }
    }

    if (targetStep >= 3) {
      const p = form.prompt.trim();
      if (!p || p.length < 10)
        errs.push("Enter a creative brief with at least 10 characters.");
      if (!form.languageCode) errs.push("Select a language.");
      if (!form.voice) errs.push("Select a voice.");
      if (!form.qualityTier) errs.push("Select a quality tier.");
      if (!form.mode) errs.push("Select a voice mode (narration or dialogue).");
    }

    if (targetStep >= 4) {
      if (!form.aspectRatio) errs.push("Select an aspect ratio.");
      if (form.mode === "dialogue" && !form.lipsync) {
        errs.push("Lip-sync must be enabled for Dialogue mode.");
      }
    }

    return errs;
  };

  const step1Valid = validateStep(2).length === 0;
  const step2Valid = validateStep(3).length === 0;
  const step3Valid = validateStep(4).length === 0;

  const next = () => {
    setError("");
    const errs = validateStep(step + 1);
    if (errs.length > 0) {
      setError(errs[0]);
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    const errs = validateStep(4);
    if (errs.length > 0) {
      setError("Cannot generate: " + errs.join(" "));
      return;
    }

    if (form.filmType === "product_promo" && form.productIds.length === 0) {
      setError(
        "Cannot generate: Product Promo requires at least one saved product.",
      );
      return;
    }

    setSubmitting(true);
    try {
      setStatus("Saving your private production draft…");

      const payload = {
        ...form,
        stylePreset: form.stylePreset || "cinematic_3d",
        prompt: form.prompt.trim(),
        targetMinutes: Number(form.targetMinutes),
        productIds: [...new Set(form.productIds.filter(Boolean))],
        referenceIds: [...new Set(form.referenceIds.filter(Boolean))],
        characters: characters.map((c) => ({
          name: c.name,
          voice: c.voice,
          description: c.description,
          referenceAssetId: c.referenceAssetId,
        })),
      };
      console.log("[Create] draft payload:", payload);

      const draft = await api.createDraft(payload);
      setStatus("Writing the editable scene script…");
      await api.generateScript(draft.job.id);
      navigate(`/studio/jobs/${draft.job.id}?review=1`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        console.error("[Create] draft failed:", {
          status: caught.status,
          code: caught.code,
          message: caught.message,
          fields: caught.fields,
        });
        setError(`[${caught.code}] ${caught.message}`);
      } else {
        console.error("[Create] draft failed:", caught);
        setError("The draft could not be created.");
      }
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingBlock label="Preparing production options…" />;
  if (!meta)
    return (
      <Card className="p-6 text-sm text-red-200">
        {error || "Production options are unavailable."}
      </Card>
    );

  return (
    <form onSubmit={submit} className="space-y-8">
      <PageHeader
        eyebrow="New production"
        title="Direct the film before it renders."
        description="Choose a purpose-built production mode, add your private assets, assign character voices, then review an editable scene script and exact credit estimate before approval."
      />

      {/* ── Step indicators with validation state ── */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { label: "Production type", valid: step1Valid },
          { label: "Creative direction", valid: step2Valid },
          { label: "Review settings", valid: step3Valid },
        ].map(({ label, valid }, index) => {
          const number = index + 1;
          const clickable = number < step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => clickable && setStep(number)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                step === number
                  ? "border-amber-400/30 bg-amber-400/[0.07]"
                  : step > number
                    ? "border-emerald-400/20 bg-emerald-400/[0.04]"
                    : "border-white/[0.07] bg-white/[0.025]",
                clickable && "cursor-pointer",
                !clickable && number !== step && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-lg text-xs font-bold",
                  step > number
                    ? "bg-emerald-400/15 text-emerald-300"
                    : step === number
                      ? "bg-amber-400 text-zinc-950"
                      : "bg-white/[0.05] text-zinc-500",
                )}
              >
                {step > number ? <Check className="h-3.5 w-3.5" /> : number}
              </span>
              <span className="text-xs font-semibold text-zinc-300">
                {label}
              </span>
              {step === number && !valid && (
                <span className="ml-auto rounded bg-red-400/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                  REQUIRED
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          STEP 1 — Production Type + References + Character Voices
      ═══════════════════════════════════════════════════════════════ */}
      {step === 1 ? (
        <div className="space-y-8">
          {form.referenceIds.length > 0 &&
            form.filmType === "cartoon_story" &&
            form.stylePreset === "cinematic_3d" && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-200">
                <strong>Heads up:</strong> You chose{" "}
                <strong>Cartoon Story</strong> (flat 2D) but your style is set
                to <strong>Cinematic 3D</strong>. Pick{" "}
                <strong>Reference-faithful</strong> style if you want your
                uploaded characters matched exactly, or switch to{" "}
                <strong>Cinematic Story</strong>
                for true 3D depth.
              </div>
            )}
          {form.filmType === "cartoon_story" && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-200">
              <strong>Tip:</strong> "Cartoon story" produces flat 2D animation.
              For 3D characters with depth and realistic lighting, choose{" "}
              <strong>Cinematic story</strong> or{" "}
              <strong>Realistic human</strong>.
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-white">
              What are you making?
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              The choice changes script structure, imagery, references, pacing,
              and preservation policy.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {meta.videoTypes.map((type) => {
              const Icon = typeIcons[type.id as keyof typeof typeIcons] || Film;
              const selected = form.filmType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => chooseType(type.id)}
                  className={cn(
                    "group min-h-48 rounded-2xl border p-5 text-left transition",
                    selected
                      ? "border-amber-400/35 bg-amber-400/[0.075] shadow-[0_20px_60px_rgba(245,158,11,0.08)]"
                      : "border-white/[0.08] bg-[#12141a] hover:-translate-y-0.5 hover:border-white/15",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-xl",
                        selected
                          ? "bg-amber-400 text-zinc-950"
                          : "bg-white/[0.05] text-amber-300",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {selected ? <Badge tone="amber">Selected</Badge> : null}
                  </div>
                  <h3 className="mt-6 font-semibold text-white">
                    {type.label}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {type.description}
                  </p>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                    {type.minMinutes}–{type.maxMinutes} min ·{" "}
                    {type.preservationMode?.replaceAll("_", " ") ||
                      "reference-aware"}
                  </p>
                </button>
              );
            })}
          </div>

          {/* ── Products (if required) ── */}
          {selectedType?.requiredReferences?.product ? (
            <Card className="border-emerald-400/15 p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-semibold text-white">
                    Choose the real product to preserve *
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Strict products are composited from the original upload
                    instead of being redrawn.
                  </p>
                </div>
                <Link to="/studio/library">
                  <Button type="button" variant="secondary" size="sm">
                    Add product
                  </Button>
                </Link>
              </div>
              {products.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {products.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => toggleId("productIds", product.id)}
                      className={cn(
                        "overflow-hidden rounded-xl border text-left transition",
                        form.productIds.includes(product.id)
                          ? "border-emerald-400/40 bg-emerald-400/[0.06]"
                          : "border-white/[0.08] bg-black/20",
                      )}
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-white/[0.03]">
                        <img
                          src={mediaUrl(product.originalAssetId)}
                          alt=""
                          className="h-full w-full object-contain p-3"
                        />
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold text-white">
                          {product.name}
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-300">
                          {product.strictFidelity
                            ? "Strict fidelity"
                            : "Reference fidelity"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                  No saved products yet. Add the original product image in your
                  private library.
                </p>
              )}
            </Card>
          ) : null}

          {/* ── References Card ── */}
          <Card className="p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-semibold text-white">Your references</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Click existing references to select them, or upload new
                  images.
                </p>
              </div>
              <div className="relative">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => uploadReferences(e.target.files)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isUploading}
                >
                  <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                  {isUploading ? "Uploading…" : "Upload new photos"}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="amber">
                {form.productIds.length} products selected
              </Badge>
              <Badge tone="amber">
                {form.referenceIds.length} references selected
              </Badge>
            </div>

            {products.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Saved products{" "}
                  <span className="text-amber-400">
                    ({form.productIds.length} selected)
                  </span>
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {products.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => toggleId("productIds", product.id)}
                      className={cn(
                        "w-32 shrink-0 overflow-hidden rounded-xl border text-left transition",
                        form.productIds.includes(product.id)
                          ? "border-amber-400/40 bg-amber-400/[0.06] ring-1 ring-amber-400/30"
                          : "border-white/[0.08] opacity-60 hover:opacity-100",
                      )}
                    >
                      <div className="aspect-square bg-black/20">
                        <img
                          src={mediaUrl(product.originalAssetId)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-semibold text-white">
                          {product.name}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-emerald-300">
                          Product
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {references.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Saved references{" "}
                  <span className="text-amber-400">
                    ({form.referenceIds.length} selected)
                  </span>
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {references.map((reference) => (
                    <button
                      type="button"
                      key={reference.id}
                      onClick={() =>
                        toggleId("referenceIds", reference.assetId)
                      }
                      className={cn(
                        "w-32 shrink-0 overflow-hidden rounded-xl border text-left transition",
                        form.referenceIds.includes(reference.assetId)
                          ? "border-amber-400/40 bg-amber-400/[0.06] ring-1 ring-amber-400/30"
                          : "border-white/[0.08] opacity-60 hover:opacity-100",
                      )}
                    >
                      <div className="aspect-square bg-black/20">
                        <img
                          src={mediaUrl(reference.assetId)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-semibold text-white">
                          {reference.name}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                          {reference.kind}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {products.length === 0 && references.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                No references yet. Upload character sheets or style images
                above, or add them in your{" "}
                <Link to="/studio/library" className="text-amber-300">
                  library
                </Link>{" "}
                first.
              </p>
            ) : null}
          </Card>

          {/* ── Character Voice Assignment (NEW) ── */}
          {characters.length > 0 && (
            <Card className="border-emerald-400/15 p-5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-300" />
                <h3 className="font-semibold text-white">Character Voices</h3>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Assign a unique voice to each character. The pipeline will use
                these voices for dialogue lines.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    className="rounded-xl border border-white/[0.08] bg-black/20 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: char.color }}
                      />
                      <span className="text-sm font-semibold text-white">
                        {char.name}
                      </span>
                    </div>
                    <div className="mt-2">
                      <label className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Voice
                      </label>
                      <select
                        className={cn(selectClassName, "mt-1 text-xs py-1.5")}
                        value={char.voice}
                        onChange={(e) =>
                          updateCharacter(char.id, { voice: e.target.value })
                        }
                      >
                        {voices.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 2 — Creative Direction
      ═══════════════════════════════════════════════════════════════ */}
      {step === 2 ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/10 text-amber-300">
                <BookOpenCheck className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold text-white">Creative brief</h2>
                <p className="text-xs text-zinc-500">
                  One clear brief becomes the complete scene plan.
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-5">
              <Field label="Describe the film *" hint="10–2,500 characters">
                <Textarea
                  rows={8}
                  maxLength={2500}
                  value={form.prompt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      prompt: event.target.value,
                    }))
                  }
                  placeholder={
                    form.filmType === "product_promo"
                      ? "Create an energetic launch film for my uploaded product. Open with the problem, reveal the real package, demonstrate three benefits, and close with a clear call to action…"
                      : "A 3D Pixar insect mystery: Benny the blue pill-bug detective and his insect friends solve a case on a kitchen floor. NO humans, NO mammals. Characters talk to each other with expressive faces…"
                  }
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language *">
                  <select
                    className={selectClassName}
                    value={form.languageCode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        languageCode: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(meta.languages).map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Target duration *">
                  <Input
                    type="number"
                    min={selectedType?.minMinutes || 1}
                    max={Math.min(
                      selectedType?.maxMinutes || 5,
                      user?.plan.maxVideoMinutes || 5,
                    )}
                    step={1}
                    value={form.targetMinutes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetMinutes: Number(event.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label="Voice mode *">
                  <select
                    className={selectClassName}
                    value={form.mode}
                    onChange={(event) => {
                      const newMode = event.target.value;
                      setForm((current) => ({
                        ...current,
                        mode: newMode,
                        lipsync: newMode === "dialogue" ? true : false,
                      }));
                    }}
                  >
                    <option value="narration">
                      Narrator or presenter (voiceover)
                    </option>
                    <option value="dialogue">
                      Dialogue — characters talk to each other (lip-sync)
                    </option>
                  </select>
                </Field>
                <Field label="Voice *">
                  <select
                    className={selectClassName}
                    value={form.voice}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        voice: event.target.value,
                      }))
                    }
                  >
                    {voices.map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Visual direction *">
                  <select
                    className={selectClassName}
                    value={form.stylePreset}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        stylePreset: event.target.value,
                      }))
                    }
                  >
                    {styleOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quality tier *">
                  <select
                    className={selectClassName}
                    value={form.qualityTier}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        qualityTier: event.target.value,
                      }))
                    }
                  >
                    {meta.qualityTiers.map((tier) => (
                      <option
                        key={tier.id}
                        value={tier.id}
                        disabled={
                          user?.role !== "admin" &&
                          !(
                            (user?.plan.entitlements.quality_tiers as
                              | string[]
                              | undefined) || ["budget"]
                          ).includes(tier.id)
                        }
                      >
                        {tier.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </Card>
          <Card className="h-fit p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
              Selected strategy
            </p>
            <h3 className="mt-4 font-display text-2xl font-semibold text-white">
              {selectedType?.label}
            </h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {selectedType?.description}
            </p>
            <div className="my-5 h-px bg-white/[0.07]" />
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Script framework</dt>
                <dd className="text-right text-zinc-300">
                  {selectedType?.scriptFramework?.replaceAll("_", " ") ||
                    "purpose-built"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Preservation</dt>
                <dd className="text-right text-zinc-300">
                  {selectedType?.preservationMode?.replaceAll("_", " ") ||
                    "reference-aware"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Products attached</dt>
                <dd className="text-zinc-300">{form.productIds.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">References attached</dt>
                <dd className="text-zinc-300">{form.referenceIds.length}</dd>
              </div>
              {characters.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Character voices</dt>
                  <dd className="text-zinc-300">{characters.length}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 3 — Format & Finishing + Assembly Controls
      ═══════════════════════════════════════════════════════════════ */}
      {step === 3 ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card className="p-6">
            <h2 className="font-semibold text-white">Format and finishing</h2>
            <p className="mt-1 text-sm text-zinc-500">
              The renderer builds every scene directly for the selected canvas.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {meta.aspectRatios.map((ratio) => {
                const Icon =
                  ratio.id === "9:16"
                    ? RectangleVertical
                    : ratio.id === "1:1"
                      ? Square
                      : RectangleHorizontal;
                return (
                  <button
                    type="button"
                    key={ratio.id}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        aspectRatio: ratio.id,
                      }))
                    }
                    className={cn(
                      "rounded-xl border p-4 text-left transition",
                      form.aspectRatio === ratio.id
                        ? "border-amber-400/35 bg-amber-400/[0.07]"
                        : "border-white/[0.08] bg-black/20",
                    )}
                  >
                    <Icon className="h-5 w-5 text-amber-300" />
                    <p className="mt-4 text-sm font-semibold text-white">
                      {ratio.id}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{ratio.label}</p>
                  </button>
                );
              })}
            </div>

            {/* ── Assembly controls (NEW) ── */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Scene transition">
                <select
                  className={selectClassName}
                  value={form.transition}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, transition: e.target.value }))
                  }
                >
                  {TRANSITIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color grade">
                <select
                  className={selectClassName}
                  value={form.colorGrade}
                  onChange={(e) =>
                    setForm((c) => ({ ...c, colorGrade: e.target.value }))
                  }
                >
                  {COLOR_GRADES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                {
                  key: "subtitles",
                  label: "Burned-in subtitles",
                  copy: "Readable captions positioned within format-safe areas.",
                  icon: Captions,
                },
                {
                  key: "karaokeCaptions",
                  label: "Karaoke captions",
                  copy: "Words highlight progressively for social-first viewing.",
                  icon: Sparkles,
                },
                {
                  key: "lipsync",
                  label: "Lip-sync (REQUIRED for talking characters)",
                  copy: "Characters will move their mouths and faces when speaking. Without this, characters stay frozen.",
                  icon: Bot,
                },
              ].map(({ key, label, copy, icon: Icon }) => {
                const selected =
                  form[key as "subtitles" | "karaokeCaptions" | "lipsync"];
                const isForced = key === "lipsync" && form.mode === "dialogue";
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => {
                      if (isForced) return;
                      setForm((current) => ({ ...current, [key]: !selected }));
                    }}
                    className={cn(
                      "rounded-xl border p-4 text-left relative",
                      selected || isForced
                        ? "border-emerald-400/25 bg-emerald-400/[0.05]"
                        : "border-white/[0.08]",
                      isForced && "opacity-90 cursor-not-allowed",
                    )}
                  >
                    {isForced && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold text-emerald-400 uppercase">
                        Required
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4",
                          selected || isForced
                            ? "text-emerald-300"
                            : "text-zinc-600",
                        )}
                      />
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          {copy}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="h-fit p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
              Before you render
            </p>
            <h3 className="mt-4 font-display text-2xl font-semibold text-white">
              The script comes first.
            </h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Continue to generate a private, editable scene script. You can
              change narration, image direction, and camera motion before
              approving any credits.
            </p>
            <div className="my-5 h-px bg-white/[0.07]" />
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Production</dt>
                <dd className="text-zinc-200">{selectedType?.label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Canvas</dt>
                <dd className="text-zinc-200">{form.aspectRatio}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Duration</dt>
                <dd className="text-zinc-200">{form.targetMinutes} min</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Transition</dt>
                <dd className="text-zinc-200">
                  {TRANSITIONS.find(([v]) => v === form.transition)?.[1]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Color grade</dt>
                <dd className="text-zinc-200">
                  {COLOR_GRADES.find(([v]) => v === form.colorGrade)?.[1]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Products</dt>
                <dd className="text-zinc-200">{form.productIds.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">References</dt>
                <dd className="text-zinc-200">{form.referenceIds.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Watermark</dt>
                <dd className="text-zinc-200">
                  {user?.role === "admin" || !user?.plan.watermarkRequired
                    ? "None"
                    : "Trial watermark"}
                </dd>
              </div>
            </dl>
            {status ? (
              <p className="mt-5 rounded-xl bg-amber-400/[0.06] p-3 text-xs text-amber-200">
                {status}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* ── Global error banner ── */}
      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-white/[0.07] pt-6">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 1 || submitting}
          onClick={() => setStep((current) => current - 1)}
        >
          Back
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            onClick={next}
            disabled={validateStep(step + 1).length > 0}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="submit"
            loading={submitting}
            disabled={validateStep(4).length > 0}
          >
            <BookOpenCheck className="h-4 w-4" /> Generate editable script
          </Button>
        )}
      </div>
    </form>
  );
}
