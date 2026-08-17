import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus:ring-2 focus:ring-amber-400/70 focus:ring-offset-2 focus:ring-offset-[#0a0b0f] disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-amber-400 text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.16)] hover:bg-amber-300",
        variant === "secondary" &&
          "border border-white/10 bg-white/[0.06] text-zinc-100 hover:border-white/20 hover:bg-white/[0.1]",
        variant === "ghost" && "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
        variant === "danger" &&
          "border border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/20",
        size === "sm" && "h-9 px-3 text-xs",
        size === "md" && "h-11 px-4 text-sm",
        size === "lg" && "h-13 px-6 text-base",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-[#12141a]/90 shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "green" | "red" | "blue" | "purple";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tone === "neutral" && "border-white/10 bg-white/[0.05] text-zinc-300",
        tone === "amber" && "border-amber-400/20 bg-amber-400/10 text-amber-300",
        tone === "green" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        tone === "red" && "border-red-400/20 bg-red-400/10 text-red-300",
        tone === "blue" && "border-sky-400/20 bg-sky-400/10 text-sky-300",
        tone === "purple" && "border-violet-400/20 bg-violet-400/10 text-violet-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-200">
        {label}
        {hint ? <span className="text-xs font-normal text-zinc-500">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs text-red-300">{error}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10",
        className,
      )}
      {...props}
    />
  );
}

export const selectClassName =
  "h-11 w-full rounded-xl border border-white/10 bg-[#0b0c10] px-3.5 text-sm text-zinc-100 outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-7 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="grid min-h-72 place-items-center p-8 text-center">
      <div className="max-w-md">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </Card>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-64 place-items-center">
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <LoaderCircle className="h-4 w-4 animate-spin text-amber-400" />
        {label}
      </div>
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
          {detail ? <p className="mt-2 text-xs text-zinc-500">{detail}</p> : null}
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-amber-300">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}
