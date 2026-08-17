import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, ShieldAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { ApiError, api } from "../api";
import { AppLogo } from "../components/AppShell";
import { Button, Card, Field, Input } from "../components/ui";

function TokenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#08090c] px-5 py-12 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,0.12),transparent_30%)]" />
      <div className="relative w-full max-w-lg"><Link to="/" className="mb-8 inline-block"><AppLogo /></Link>{children}</div>
    </div>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your secure link…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get("token") || "";
    if (!token) {
      setStatus("error");
      setMessage("The verification token is missing.");
      return;
    }
    api
      .verifyEmail(token)
      .then((result) => {
        setStatus("success");
        setMessage(result.message);
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error instanceof ApiError ? error.message : "The verification link could not be used.");
      });
  }, [params]);

  return (
    <TokenLayout>
      <Card className="p-8 text-center sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05]">
          {status === "loading" ? <LoaderCircle className="h-6 w-6 animate-spin text-amber-300" /> : status === "success" ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <ShieldAlert className="h-6 w-6 text-red-300" />}
        </span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-white">{status === "loading" ? "Verifying your email" : status === "success" ? "Account verified" : "Link unavailable"}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
        {status !== "loading" ? <Link to="/login" className="mt-7 block"><Button className="w-full">Continue to sign in</Button></Link> : null}
      </Card>
    </TokenLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("The reset token is missing.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.resetPassword(token, password);
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The password could not be reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TokenLayout>
      <Card className="p-8 sm:p-10">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><KeyRound className="h-5 w-5" /></span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-white">Choose a new password</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Use a unique password between 12 and 128 characters. Completing the reset signs out every existing session.</p>
        {message ? <div className="mt-7 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-100/80">{message}<Link to="/login" className="mt-3 block font-semibold text-amber-300">Sign in with the new password</Link></div> : <form onSubmit={submit} className="mt-7 space-y-5"><Field label="New password"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></Field><Field label="Confirm new password"><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field>{error ? <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-sm text-red-200">{error}</div> : null}<Button type="submit" loading={loading} className="w-full">Reset password securely</Button></form>}
      </Card>
    </TokenLayout>
  );
}
