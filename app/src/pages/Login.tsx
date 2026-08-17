import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/api";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const r =
      mode === "login"
        ? await api.login(email, password)
        : await api.register(email, password);
    setBusy(false);
    if (r.user) navigate("/studio");
    else setError(r.error || "Something went wrong.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-sm border-zinc-800 bg-zinc-900/60">
        <CardHeader className="items-center">
          <Clapperboard className="mb-1 h-8 w-8 text-amber-400" />
          <CardTitle>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <p className="text-xs text-zinc-500">
            {mode === "register"
              ? "Includes 2 free credits to try a film"
              : "Log in to CineAssemble"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password (min 6 chars)"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            onClick={submit}
            disabled={busy || !email || password.length < 6}
            className="w-full bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "login" ? "Log in" : "Sign up"}
          </Button>
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="w-full text-center text-xs text-zinc-400 hover:text-amber-400"
          >
            {mode === "login"
              ? "No account? Sign up free"
              : "Have an account? Log in"}
          </button>
          <Link
            to="/"
            className="block text-center text-xs text-zinc-600 hover:text-zinc-400"
          >
            ← Back to home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
