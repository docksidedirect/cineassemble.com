export type UserRole = "user" | "admin";
export type JobStatus =
  | "draft"
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled";

export interface Plan {
  code: string;
  name: string;
  monthlyCredits: number;
  maxVideoMinutes: number;
  maxConcurrentJobs: number;
  watermarkRequired: boolean;
  entitlements: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  trialUsed: boolean;
  plan: Plan;
  unlimited: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreditSummary {
  unlimited: boolean;
  balance: number | null;
  planCode: string;
  planName: string;
}

export interface VideoType {
  id: string;
  label: string;
  description: string;
  icon: string;
  requiredReferences: Record<string, number>;
  optionalReferences: string[];
  minMinutes: number;
  maxMinutes: number;
  defaultStyle: string;
  preservationMode: string;
  scriptFramework: string;
  visualPolicy: string;
  supportedFormats: string[];
}

export interface MetaOptions {
  productName: string;
  videoTypes: VideoType[];
  aspectRatios: Array<{ id: string; label: string; width: number; height: number }>;
  languages: Record<string, string>;
  voiceModes: Array<{ id: string; label: string }>;
  qualityTiers: Array<{ id: string; label: string }>;
}

export interface MediaAsset {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  originalAssetId: string;
  cutoutAssetId: string | null;
  strictFidelity: boolean;
  preservationNotes: string | null;
  productProfile: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  originalAsset: MediaAsset | null;
}

export interface ReferenceAsset {
  id: string;
  kind: "character" | "human" | "style" | "general";
  name: string;
  description: string | null;
  assetId: string;
  createdAt: string;
  updatedAt: string;
  asset: MediaAsset | null;
}

export interface DialogueLine {
  character: string;
  text: string;
}

export interface Scene {
  id: string;
  jobId: string;
  index: number;
  revision: number;
  narration: string;
  lines: DialogueLine[] | null;
  imagePrompt: string;
  motionPrompt: string;
  audioDurationMs: number | null;
  imageAssetId: string | null;
  audioAssetId: string | null;
  clipAssetId: string | null;
  lipsyncAssetId: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  userId: string;
  title: string | null;
  prompt: string;
  filmType: string;
  languageCode: string;
  aspectRatio: string;
  targetMinutes: number;
  voice: string;
  qualityTier: string;
  stylePreset: string;
  mode: string;
  subtitles: boolean;
  karaokeCaptions: boolean;
  lipsync: boolean;
  brandKitId: string | null;
  status: JobStatus;
  stage: string;
  progress: number;
  script: Record<string, unknown> | null;
  resolvedVoice: string | null;
  finalAssetId: string | null;
  watermarkRequired: boolean;
  estimatedCostUsd: number;
  actualCostUsd: number;
  estimatedCredits: number;
  reservedCredits: number;
  chargedCredits: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  scenes?: Scene[];
  attachedAssets?: Array<{
    attachmentId: string;
    role: string;
    position: number;
    productId: string | null;
    referenceId: string | null;
  }>;
  events?: Array<{
    id: number;
    level: string;
    eventType: string;
    message: string;
    progress: number | null;
    createdAt: string;
  }>;
}

export interface Estimate {
  sceneCount: number;
  estimatedCostUsd: number;
  estimatedCredits: number;
  breakdown: Record<string, number>;
  qualityTier: string;
  animationEngine: string;
}

export interface DraftInput {
  prompt: string;
  filmType: string;
  languageCode: string;
  aspectRatio: string;
  targetMinutes: number;
  voice: string;
  qualityTier: string;
  stylePreset: string;
  mode: string;
  subtitles: boolean;
  karaokeCaptions: boolean;
  lipsync: boolean;
  productIds: string[];
  referenceIds: string[];
}

export interface BillingPlan extends Plan {
  id: string;
  priceMonthlyCents: number;
  enabled: boolean;
  purchasable: boolean;
}

export interface BillingOverview {
  plans: BillingPlan[];
  subscription: null | {
    id: string;
    providerSubscriptionId: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    planCode: string;
    planName: string;
    priceMonthlyCents: number;
  };
  billingConfigured: boolean;
}

export interface AdminDashboard {
  users: { total: number; active: number; administrators: number; new30d: number };
  jobs: {
    total: number;
    completed: number;
    failed: number;
    active: number;
    jobs30d: number;
    averageRenderSeconds: number;
  };
  financial: {
    mrrCents: number;
    activeSubscriptions: number;
    providerCostUsd: number;
    outstandingCredits: number;
  };
  recentErrors: Array<{
    id: string;
    userId: string;
    userEmail: string;
    title: string | null;
    filmType: string;
    errorCode: string | null;
    errorMessage: string | null;
    updatedAt: string;
  }>;
}

export interface AdminJob {
  id: string;
  userId: string;
  userEmail: string;
  title: string | null;
  filmType: string;
  aspectRatio: string;
  qualityTier: string;
  status: JobStatus;
  stage: string;
  progress: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  estimatedCredits: number;
  chargedCredits: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  plan: { code: string; name: string };
  creditBalance: number;
  jobCount: number;
  unlimited: boolean;
}

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Array<{ path: string; message: string }>;

  constructor(message: string, code = "REQUEST_FAILED", status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

let csrfToken = "";
let csrfRefreshPromise: Promise<string> | null = null;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

// Try to restore CSRF token from common cookie names on module load
csrfToken = getCookie("csrf_token") || getCookie("XSRF-TOKEN") || getCookie("csrfToken") || "";

async function refreshCsrfToken(): Promise<string> {
  if (csrfRefreshPromise) return csrfRefreshPromise;
  csrfRefreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/csrf", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { csrfToken?: string };
      csrfToken = data.csrfToken || "";
      return csrfToken;
    } finally {
      csrfRefreshPromise = null;
    }
  })();
  return csrfRefreshPromise;
}

async function requestJson<T>(
  url: string,
  options: Omit<RequestInit, "body"> & {
    body?: BodyInit | Record<string, unknown> | null;
  } = {},
  isRetry = false,
): Promise<T> {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const needsCsrf = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (needsCsrf && !csrfToken) {
    await refreshCsrfToken();
  }
  if (needsCsrf && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(url, {
    ...options,
    method,
    body: body as BodyInit | null | undefined,
    headers,
    credentials: "include"
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") || "";
  let payload: {
    error?: {
      code?: string;
      message?: string;
      fields?: Array<{ path: string; message: string }>;
    };
  } & Record<string, unknown> = {};

  if (contentType.includes("application/json")) {
    payload = (await response.json().catch(() => ({}))) as typeof payload;
  } else {
    const text = await response.text().catch(() => "");
    payload = {
      error: {
        code: "NON_JSON_RESPONSE",
        message: text || "The server returned an empty response."
      }
    };
  }

  // Auto-retry once on CSRF failure
  if (response.status === 403 && payload.error?.code === "CSRF_VALIDATION_FAILED" && !isRetry) {
    csrfToken = "";
    await refreshCsrfToken();
    return requestJson(url, options, true);
  }

  if (!response.ok) {
    const error = new ApiError(
      payload.error?.message || `Request failed with status ${response.status}.`,
      payload.error?.code || "REQUEST_FAILED",
      response.status,
    );
    error.fields = payload.error?.fields;
    throw error;
  }
  return payload as T;
}

export const mediaUrl = (assetId: string, download = false) =>
  `/api/media/assets/${encodeURIComponent(assetId)}${download ? "?download=1" : ""}`;

export const api = {
  setCsrf(value: string) {
    csrfToken = value;
  },
  clearCsrf() {
    csrfToken = "";
  },
  meta: () => requestJson<MetaOptions>("/api/meta?contract=2"),
  register: (body: { email: string; password: string; displayName: string }) =>
    requestJson<{ ok: true; message: string }>("/api/auth/register", {
      method: "POST",
      body
    }),
  login: (body: { email: string; password: string }) =>
    requestJson<{ ok: true; user: User; csrfToken: string; sessionExpiresAt: string }>(
      "/api/auth/login",
      { method: "POST", body },
    ),
  me: () => requestJson<{ user: User; credits: CreditSummary }>("/api/auth/me"),
  csrf: () => requestJson<{ csrfToken: string }>("/api/auth/csrf"),
  logout: () => requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  logoutOthers: () =>
    requestJson<{ ok: true; revoked: number }>("/api/auth/logout-others", { method: "POST" }),
  sessions: () =>
    requestJson<{
      sessions: Array<{
        id: string;
        current: boolean;
        lastSeenAt: string;
        idleExpiresAt: string;
        absoluteExpiresAt: string;
        createdAt: string;
      }>;
    }>("/api/auth/sessions"),
  verifyEmail: (token: string) =>
    requestJson<{ ok: boolean; message: string }>("/api/auth/verify-email", {
      method: "POST",
      body: { token }
    }),
  resendVerification: (email: string) =>
    requestJson<{ ok: true; message: string }>("/api/auth/resend-verification", {
      method: "POST",
      body: { email }
    }),
  forgotPassword: (email: string) =>
    requestJson<{ ok: true; message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: { email }
    }),
  resetPassword: (token: string, password: string) =>
    requestJson<{ ok: true; message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: { token, password }
    }),
  library: () =>
    requestJson<{ products: Product[]; references: ReferenceAsset[] }>("/api/library"),
  uploadProduct: (form: FormData) =>
    requestJson<{ ok: true; product: Product }>("/api/library/products", {
      method: "POST",
      body: form
    }),
  
  uploadReference: (form: FormData) =>
    requestJson<{ ok: true; reference: ReferenceAsset }>("/api/library/references", {
      method: "POST",
      body: form
    }),
  
  deleteProduct: (id: string) =>
    requestJson<void>(`/api/library/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  deleteReference: (id: string) =>
    requestJson<void>(`/api/library/references/${encodeURIComponent(id)}`, { method: "DELETE" }),
  jobs: () => requestJson<{ jobs: Job[] }>("/api/jobs"),
  job: (id: string) => requestJson<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}`),
  createDraft: (body: DraftInput) =>
    requestJson<{ ok: true; job: Job; estimate: Estimate; nextAction: string }>(
      "/api/jobs/draft",
      { method: "POST", body: body as unknown as Record<string, unknown> },
    ),
  generateScript: (id: string) =>
    requestJson<{ ok: true; job: Job; nextAction: string }>(
      `/api/jobs/${encodeURIComponent(id)}/script-preview`,
      { method: "POST" },
    ),
  updateDraft: (id: string, version: number, body: Partial<DraftInput>) =>
    requestJson<{ ok: true; job: Job; estimate: Estimate }>(
      `/api/jobs/${encodeURIComponent(id)}/draft`,
      { method: "PATCH", body: { ...body, version } as Record<string, unknown> },
    ),
  updateScene: (
    jobId: string,
    sceneId: string,
    body: Pick<Scene, "narration" | "imagePrompt" | "motionPrompt">,
  ) =>
    requestJson<{ ok: true; job: Job }>(
      `/api/jobs/${encodeURIComponent(jobId)}/scenes/${encodeURIComponent(sceneId)}`,
      { method: "PATCH", body },
    ),
  approveDraft: (id: string) =>
    requestJson<{ ok: true; job: Job }>(`/api/jobs/${encodeURIComponent(id)}/approve`, {
      method: "POST"
    }),
  regenerateScene: (jobId: string, sceneId: string) =>
    requestJson<{ ok: true; job: Job; estimate: Estimate }>(
      `/api/jobs/${encodeURIComponent(jobId)}/scenes/${encodeURIComponent(sceneId)}/regenerate`,
      { method: "POST" },
    ),
  retryJob: (id: string) =>
    requestJson<{ ok: true }>(`/api/jobs/${encodeURIComponent(id)}/retry`, {
      method: "POST"
    }),
  cancelJob: (id: string) =>
    requestJson<{ ok: true }>(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST"
    }),
  deleteJob: (id: string) =>
    requestJson<void>(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  billing: () => requestJson<BillingOverview>("/api/billing/overview"),
  subscribe: (planCode: string) =>
    requestJson<{ ok: true; approvalUrl: string }>("/api/billing/subscribe", {
      method: "POST",
      body: { planCode }
    }),
  adminDashboard: () => requestJson<AdminDashboard>("/api/admin/dashboard"),
  adminUsers: (search = "") =>
    requestJson<{ users: AdminUser[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`),
  adminJobs: (status = "") =>
    requestJson<{ jobs: AdminJob[] }>(
      `/api/admin/jobs${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  adminUserStatus: (id: string, status: "active" | "suspended") =>
    requestJson<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status }
    }),
  adminUserRole: (id: string, role: UserRole) =>
    requestJson<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/role`, {
      method: "PATCH",
      body: { role }
    }),
  adminCredits: (id: string, amount: number, reason: string) =>
    requestJson<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/credits`, {
      method: "POST",
      body: { amount, reason }
    }),
  uploadSceneImage: (jobId: string, sceneId: string, formData: FormData) =>
    requestJson<{ ok: true; asset: MediaAsset; message: string }>(
      `/api/jobs/${encodeURIComponent(jobId)}/scenes/${encodeURIComponent(sceneId)}/image`,
      { method: "POST", body: formData },
    ),
  getJob: (id: string) =>
    requestJson<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}`),

  pauseJob: (id: string) =>
    requestJson<{ ok: true; status: string }>(`/api/jobs/${encodeURIComponent(id)}/pause`, {
      method: "POST"
    }),

  resumeJob: (id: string) =>
    requestJson<{ ok: true; status: string }>(`/api/jobs/${encodeURIComponent(id)}/resume`, {
      method: "POST"
    })
};