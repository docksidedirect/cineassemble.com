import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { KeyRound, Laptop, LogOut, MailCheck, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, LoadingBlock, PageHeader } from "../components/ui";

interface SessionInfo {
  id: string;
  current: boolean;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  createdAt: string;
}

export default function Account() {
  const { user, credits } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  const load = async () => {
    const result = await api.sessions();
    setSessions(result.sessions);
  };

  useEffect(() => {
    load()
      .catch((error) => toast.error(error instanceof ApiError ? error.message : "Sessions unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const revokeOthers = async () => {
    setRevoking(true);
    try {
      const result = await api.logoutOthers();
      await load();
      toast.success(`${result.revoked} other session${result.revoked === 1 ? "" : "s"} signed out.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Sessions could not be revoked.");
    } finally {
      setRevoking(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading account security…" />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account security"
        title="Your identity and sessions"
        description="Native email/password authentication uses Argon2id passwords, opaque server-side sessions, CSRF protection, and single-use recovery tokens."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-400/10 text-xl font-semibold text-amber-300">
              {user?.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{user?.displayName}</h2>
                {user?.role === "admin" ? <Badge tone="amber">Unlimited admin</Badge> : null}
              </div>
              <p className="mt-1 truncate text-sm text-zinc-500">{user?.email}</p>
              <p className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
                <MailCheck className="h-4 w-4" /> Email verified
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-xs text-zinc-500">Plan</p>
              <p className="mt-2 text-sm font-semibold text-white">{user?.role === "admin" ? "Administrator" : user?.plan.name}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <p className="text-xs text-zinc-500">Credits</p>
              <p className="mt-2 text-sm font-semibold text-white">{credits?.unlimited ? "Unlimited" : credits?.balance ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card className="border-emerald-400/15 bg-emerald-400/[0.035] p-6">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
          <h2 className="mt-5 font-semibold text-white">Security controls active</h2>
          <div className="mt-4 grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
            {["Argon2id password hashing", "Hashed session tokens", "CSRF validation", "Idle and absolute expiry", "Single-use reset links", "Audit-logged security actions"].map((item) => (
              <p key={item} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{item}</p>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-white"><Laptop className="h-4 w-4 text-amber-300" /> Active sessions</h2>
            <p className="mt-1 text-xs text-zinc-500">Sign out other browsers if you no longer recognize or use them.</p>
          </div>
          <Button variant="secondary" size="sm" loading={revoking} onClick={revokeOthers}>
            <LogOut className="h-3.5 w-3.5" /> Sign out other sessions
          </Button>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-4 px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-zinc-400"><UserRound className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="text-sm font-semibold text-white">Browser session</p>{session.current ? <Badge tone="green">Current</Badge> : null}</div>
                <p className="mt-1 text-xs text-zinc-500">Last active {formatDistanceToNow(new Date(session.lastSeenAt), { addSuffix: true })} · expires {new Date(session.absoluteExpiresAt).toLocaleDateString()}</p>
              </div>
              <KeyRound className="h-4 w-4 text-zinc-700" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
