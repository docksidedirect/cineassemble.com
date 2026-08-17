import { useState } from "react";
import {
  BadgeDollarSign,
  BookImage,
  ChevronRight,
  CircleUserRound,
  Clapperboard,
  CreditCard,
  Film,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../auth";
import { cn } from "../lib/utils";
import { Badge, Button } from "./ui";

const navigation = [
  { to: "/studio", label: "Studio", icon: LayoutDashboard },
  { to: "/studio/create", label: "Create film", icon: Plus },
  { to: "/studio/library", label: "Product & character library", icon: BookImage },
  { to: "/studio/billing", label: "Plans & credits", icon: CreditCard },
  { to: "/studio/account", label: "Account security", icon: CircleUserRound },
];

export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-amber-400 text-zinc-950 shadow-[0_10px_30px_rgba(251,191,36,0.2)]">
        <Clapperboard className="h-5 w-5" />
        <span className="absolute inset-x-0 bottom-0 h-1 bg-zinc-950/80" />
      </span>
      {!compact ? (
        <span>
          <span className="block font-display text-base font-semibold tracking-tight text-white">
            CineAssemble
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            AI film studio
          </span>
        </span>
      ) : null}
    </div>
  );
}

function SidebarContent({ close }: { close?: () => void }) {
  const { user, credits, signOut } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await signOut();
    toast.success("Signed out securely.");
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-5">
        <AppLogo />
      </div>
      <div className="px-3">
        <NavLink
          to="/studio/create"
          onClick={close}
          className="flex h-11 items-center justify-between rounded-xl bg-amber-400 px-3.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
        >
          <span className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4" /> New production
          </span>
          <ChevronRight className="h-4 w-4" />
        </NavLink>
      </div>
      <nav className="mt-5 space-y-1 px-3" aria-label="Studio navigation">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/studio"}
              onClick={close}
              className={({ isActive }) =>
                cn(
                  "flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition",
                  isActive
                    ? "bg-white/[0.08] font-semibold text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="line-clamp-1">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      {user?.role === "admin" ? (
        <div className="mt-6 border-y border-amber-400/10 bg-amber-400/[0.035] px-3 py-4">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/80">
            Owner controls
          </p>
          <NavLink
            to="/admin"
            onClick={close}
            className={({ isActive }) =>
              cn(
                "mt-2 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition",
                isActive
                  ? "bg-amber-400/10 font-semibold text-amber-200"
                  : "text-amber-300/70 hover:bg-amber-400/[0.07] hover:text-amber-200",
              )
            }
          >
            <ShieldCheck className="h-4 w-4" /> Administrator
            <Badge tone="amber" className="ml-auto">
              Unlimited
            </Badge>
          </NavLink>
        </div>
      ) : null}
      <div className="mt-auto border-t border-white/[0.07] p-3">
        <div className="rounded-xl bg-white/[0.035] p-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-sm font-semibold text-amber-300">
              {user?.displayName?.slice(0, 1).toUpperCase() || "U"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-100">{user?.displayName}</p>
              <p className="truncate text-xs text-zinc-500">{user?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
            <span className="flex items-center gap-2 text-xs text-zinc-400">
              <BadgeDollarSign className="h-3.5 w-3.5 text-amber-400" /> Credits
            </span>
            <span className="text-xs font-bold text-zinc-100">
              {credits?.unlimited ? "Unlimited" : (credits?.balance ?? "—")}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, credits } = useAuth();

  return (
    <div className="min-h-screen bg-[#08090c] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/[0.07] bg-[#0c0d11]/95 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#08090c]/90 px-4 backdrop-blur-xl lg:hidden">
        <AppLogo />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,320px)] border-r border-white/10 bg-[#0c0d11]">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.06]"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent close={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="min-h-screen lg:pl-72">
        <div className="hidden h-16 items-center justify-end border-b border-white/[0.06] px-8 lg:flex">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
              Studio ready
            </span>
            <span className="h-4 w-px bg-white/10" />
            <Film className="h-3.5 w-3.5" />
            {user?.role === "admin"
              ? "Administrator · unlimited rendering"
              : `${credits?.balance ?? 0} credits available`}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
