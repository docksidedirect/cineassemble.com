import { useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { AppLogo } from "../components/AppShell";
import { Button, Card, Field, Input } from "../components/ui";

export type AuthMode = "login" | "register" | "forgot";

const content = {
  login: {
    eyebrow: "Welcome back",
    title: "Continue your production.",
    description: "Sign in to access your private scripts, products, characters, and films.",
  },
  register: {
    eyebrow: "Create your studio",
    title: "Make your first film free.",
    description: "Your trial includes one budget film with a CineAssemble watermark.",
  },
  forgot: {
    eyebrow: "Account recovery",
    title: "Reset your password.",
    description: "We will send a secure, single-use link if the account exists.",
  },
};

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (user) return <Navigate to="/studio" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        await signIn(email, password);
        toast.success("Welcome back.");
        const state = location.state as { from?: string } | null;
        navigate(state?.from || "/studio", { replace: true });
      } else if (mode === "register") {
        const result = await api.register({ email, password, displayName });
        setMessage(result.message);
      } else {
        const result = await api.forgotPassword(email);
        setMessage(result.message);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The request could not be completed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-[#08090c] text-zinc-100 lg:grid-cols-[1fr_520px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(245,158,11,0.12),transparent_28%),radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.08),transparent_28%)]" />
      <section className="relative hidden border-r border-white/[0.07] p-12 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="w-fit"><AppLogo /></Link>
        <div className="max-w-2xl">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300"><KeyRound className="h-6 w-6" /></span>
          <blockquote className="mt-8 font-display text-4xl font-medium leading-tight tracking-tight text-white">“The strongest creative workflow is the one that lets you review before you spend.”</blockquote>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {["Editable script before rendering", "Strict product preservation", "Private account-scoped media", "One-scene regeneration"].map((item) => <div key={item} className="flex items-center gap-3 text-sm text-zinc-400"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />{item}</div>)}
          </div>
        </div>
        <p className="text-xs text-zinc-600">Native email/password security. No third-party account dependency.</p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden"><Link to="/"><AppLogo /></Link><Link to="/" className="text-xs text-zinc-500"><ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Home</Link></div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">{content[mode].eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white">{content[mode].title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{content[mode].description}</p>

          {message ? (
            <Card className="mt-8 border-emerald-400/20 bg-emerald-400/[0.06] p-5"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="mt-3 text-sm leading-6 text-emerald-100/80">{message}</p>{mode === "register" ? <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-amber-300">Go to sign in</Link> : null}</Card>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5">
              {mode === "register" ? <Field label="Your name"><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zinc-600" /><Input className="pl-10" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} /></div></Field> : null}
              <Field label="Email address"><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zinc-600" /><Input className="pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></Field>
              {mode !== "forgot" ? <Field label="Password" hint={mode === "register" ? "12–128 characters" : undefined}><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zinc-600" /><Input className="pl-10" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 12 : 1} maxLength={128} /></div></Field> : null}
              {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">{error}</div> : null}
              <Button type="submit" size="lg" loading={loading} className="w-full">{mode === "login" ? "Sign in securely" : mode === "register" ? "Create my studio" : "Send reset link"}</Button>
            </form>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 text-sm">
            {mode === "login" ? <><Link to="/forgot-password" className="text-zinc-500 transition hover:text-zinc-200">Forgot password?</Link><p className="text-zinc-500">New here? <Link to="/register" className="font-semibold text-amber-300">Create account</Link></p></> : <p className="text-zinc-500">Already have an account? <Link to="/login" className="font-semibold text-amber-300">Sign in</Link></p>}
          </div>
        </div>
      </section>
    </div>
  );
}
