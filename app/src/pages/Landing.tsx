import {
  ArrowRight,
  BadgeCheck,
  Captions,
  Film,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router";
import { AppLogo } from "../components/AppShell";
import { Badge, Button, Card } from "../components/ui";

const modes = [
  "Cartoon story",
  "Real product promo",
  "Realistic human film",
  "Social ad",
  "Explainer",
  "Cinematic story",
  "Reference-led video",
];

const plans = [
  { name: "Starter", price: "$9", copy: "For first campaigns and social experiments", credits: "12 credits / month" },
  { name: "Creator", price: "$29", copy: "For creators producing every week", credits: "80 credits / month", featured: true },
  { name: "Agency", price: "$79", copy: "For high-volume client production", credits: "260 credits / month" },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#08090c] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(245,158,11,0.12),transparent_30%),radial-gradient(circle_at_15%_70%,rgba(59,130,246,0.08),transparent_25%)]" />
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <AppLogo />
          <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
            <a href="#capabilities" className="transition hover:text-white">Capabilities</a>
            <a href="#product-fidelity" className="transition hover:text-white">Product fidelity</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Start free</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-20 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:pb-32 lg:pt-28">
          <div>
            <Badge tone="amber" className="mb-6 gap-2 px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5" /> One idea. A complete production.
            </Badge>
            <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
              Turn a prompt into a film people remember.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400">
              CineAssemble plans the script, builds consistent scenes, voices every character, animates, captions, and assembles your final film—while keeping uploaded products visually exact.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg" className="w-full sm:w-auto">
                  Create your free trial film <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#capabilities">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  Explore the studio
                </Button>
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
              <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-400" /> One budget trial film</span>
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sky-400" /> Private multi-user workspace</span>
              <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-amber-400" /> 16:9, 9:16 and 1:1</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-12 rounded-full bg-amber-400/[0.07] blur-3xl" />
            <Card className="relative overflow-hidden border-white/10 bg-[#101218] p-3 shadow-[0_45px_120px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-3 pb-3 pt-1">
                <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" /></div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Production preview</span>
              </div>
              <div className="grid min-h-[440px] gap-3 p-2 md:grid-cols-[1fr_150px]">
                <div className="relative overflow-hidden rounded-xl bg-[radial-gradient(circle_at_55%_30%,#273247,#111827_45%,#06070a_100%)]">
                  <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/50 to-transparent" />
                  <div className="absolute left-[17%] top-[20%] h-48 w-36 rounded-[28px] border border-white/20 bg-gradient-to-b from-amber-300 to-orange-600 shadow-[0_30px_70px_rgba(245,158,11,0.25)]">
                    <div className="mx-auto mt-8 h-14 w-14 rounded-full border border-white/30 bg-white/90" />
                    <div className="mx-auto mt-6 h-2 w-24 rounded-full bg-zinc-950/70" />
                    <p className="mt-5 text-center text-xs font-black uppercase tracking-[0.22em] text-zinc-950">Your product</p>
                  </div>
                  <div className="absolute right-[12%] top-[25%] w-44 space-y-3">
                    <Badge tone="green">Exact product mode</Badge>
                    <h3 className="font-display text-2xl font-semibold text-white">The upload stays untouched.</h3>
                    <p className="text-xs leading-5 text-zinc-400">AI builds the scene around your real package—not instead of it.</p>
                  </div>
                  <button type="button" className="absolute bottom-6 left-6 grid h-12 w-12 place-items-center rounded-full bg-white text-zinc-950 shadow-xl" aria-label="Play demonstration">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </button>
                  <div className="absolute bottom-7 left-24 right-6 rounded-lg bg-black/50 px-4 py-2.5 text-center text-sm font-semibold text-white backdrop-blur">
                    Built for attention. Preserved for trust.
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
                  {["Hook", "Reveal", "Proof"].map((label, index) => (
                    <div key={label} className="relative min-h-24 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.035] p-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Scene {index + 1}</span>
                      <div className="mt-2 h-10 rounded-md bg-gradient-to-br from-amber-400/20 to-sky-400/10" />
                      <p className="mt-2 text-xs font-semibold text-zinc-300">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section id="capabilities" className="border-y border-white/[0.06] bg-white/[0.018] py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">One engine, many productions</p>
              <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">Choose the film you need—not a generic template.</h2>
              <p className="mt-5 text-base leading-7 text-zinc-400">Every production mode changes the script structure, visual policy, references, pacing, provider path, and cost model.</p>
            </div>
            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {modes.map((mode, index) => (
                <Card key={mode} className="group p-5 transition hover:-translate-y-1 hover:border-amber-400/20">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-amber-300"><Film className="h-4 w-4" /></span>
                  <p className="mt-7 text-sm font-semibold text-white">{mode}</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">Strategy {String(index + 1).padStart(2, "0")} · purpose-built scene direction</p>
                </Card>
              ))}
              <Card className="border-amber-400/15 bg-amber-400/[0.045] p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><WandSparkles className="h-4 w-4" /></span>
                <p className="mt-7 text-sm font-semibold text-amber-100">Extensible by design</p>
                <p className="mt-2 text-xs leading-5 text-amber-100/50">Add future film types without rewriting the production core.</p>
              </Card>
            </div>
          </div>
        </section>

        <section id="product-fidelity" className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <Badge tone="green" className="gap-2"><PackageCheck className="h-3.5 w-3.5" /> Strict fidelity workflow</Badge>
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">Your product remains your product.</h2>
            <p className="mt-5 text-base leading-7 text-zinc-400">Upload the real item once. In strict mode, CineAssemble generates the environment separately and composites your original pixels into every frame. No cartoon packaging. No invented logo. No altered colors.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: PackageCheck, title: "Immutable original", copy: "The normalized original is stored privately and never overwritten." },
              { icon: RefreshCw, title: "Regenerate one scene", copy: "Replace the weak scene while every approved scene remains intact." },
              { icon: Captions, title: "Social-first captions", copy: "Standard or karaoke-style captions, positioned safely for every format." },
              { icon: Users, title: "Multi-user isolation", copy: "Products, characters, scripts, films, and credits remain account-scoped." },
            ].map(({ icon: Icon, title, copy }) => (
              <Card key={title} className="p-5"><Icon className="h-5 w-5 text-amber-300" /><h3 className="mt-5 font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p></Card>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-t border-white/[0.06] bg-[#0b0c10] py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Transparent production plans</p><h2 className="mt-4 font-display text-4xl font-semibold text-white md:text-5xl">Start with one free trial film.</h2><p className="mx-auto mt-4 max-w-2xl text-zinc-400">See the script and cost before rendering. Paid plans remove the trial watermark and unlock higher production tiers.</p></div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.name} className={plan.featured ? "relative border-amber-400/30 bg-amber-400/[0.045] p-7" : "p-7"}>
                  {plan.featured ? <Badge tone="amber" className="absolute right-5 top-5">Most popular</Badge> : null}
                  <p className="text-sm font-semibold text-zinc-300">{plan.name}</p><p className="mt-5 font-display text-5xl font-semibold text-white">{plan.price}<span className="text-base font-normal text-zinc-500"> / month</span></p><p className="mt-4 min-h-12 text-sm leading-6 text-zinc-400">{plan.copy}</p><div className="my-6 h-px bg-white/[0.07]" /><p className="text-sm font-semibold text-white">{plan.credits}</p><p className="mt-2 text-xs text-zinc-500">Secure storage · editable scripts · scene regeneration</p><Link to="/register" className="mt-7 block"><Button className="w-full" variant={plan.featured ? "primary" : "secondary"}>Choose {plan.name}</Button></Link>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <Card className="overflow-hidden border-amber-400/20 bg-[radial-gradient(circle_at_80%_20%,rgba(245,158,11,0.18),transparent_35%),#12141a] p-8 md:p-14">
            <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Ready when you are</p><h2 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white md:text-5xl">Your next film begins with one clear idea.</h2><p className="mt-5 text-zinc-400">Create your account, choose the production type, review the script, and render only when it feels right.</p><Link to="/register" className="mt-8 inline-block"><Button size="lg">Open your studio <ArrowRight className="h-4 w-4" /></Button></Link></div>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-xs text-zinc-600 sm:px-8 md:flex-row md:items-center md:justify-between"><AppLogo /><p>Independent, self-hosted AI video production. Your accounts and media remain private.</p></div>
      </footer>
    </div>
  );
}
