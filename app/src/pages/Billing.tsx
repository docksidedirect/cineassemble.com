import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CreditCard,
  Infinity as InfinityIcon,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, type BillingOverview } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, LoadingBlock, PageHeader } from "../components/ui";
import { cn } from "../lib/utils";

export default function Billing() {
  const { user, credits } = useAuth();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState("");

  useEffect(() => {
    api
      .billing()
      .then(setOverview)
      .catch((error) => toast.error(error instanceof ApiError ? error.message : "Billing is unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const subscribe = async (planCode: string) => {
    setSubscribing(planCode);
    try {
      const result = await api.subscribe(planCode);
      window.location.assign(result.approvalUrl);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The subscription could not be started.");
      setSubscribing("");
    }
  };

  if (loading) return <LoadingBlock label="Loading plans and credits…" />;
  if (!overview) return <Card className="p-6 text-sm text-red-200">Billing information is unavailable.</Card>;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Plans & credits"
        title="Scale production without surprises."
        description="Every draft shows its estimated credits and provider cost before approval. PayPal webhooks are verified server-side before plans or credits change."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Current plan</p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-white">{user?.role === "admin" ? "Owner administrator" : user?.plan.name}</h2>
              <p className="mt-2 text-sm text-zinc-500">{user?.role === "admin" ? "Server-side unlimited access" : overview.subscription ? `${overview.subscription.status} PayPal subscription` : "No paid subscription"}</p>
            </div>
            <Badge tone={user?.role === "admin" ? "amber" : "blue"}>{user?.role === "admin" ? "Unlimited" : user?.plan.code}</Badge>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4"><p className="text-xs text-zinc-500">Available credits</p><p className="mt-2 text-2xl font-semibold text-white">{credits?.unlimited ? <InfinityIcon className="h-7 w-7 text-amber-300" /> : credits?.balance ?? 0}</p></div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4"><p className="text-xs text-zinc-500">Max film length</p><p className="mt-2 text-2xl font-semibold text-white">{user?.role === "admin" ? "No limit" : `${user?.plan.maxVideoMinutes} min`}</p></div>
          </div>
        </Card>
        <Card className="border-emerald-400/15 bg-emerald-400/[0.035] p-6">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
          <h2 className="mt-5 text-lg font-semibold text-white">Protected billing lifecycle</h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-400">
            {["No client-side credit changes", "Signed PayPal webhook verification", "Duplicate events cannot double-grant credits", "Transactional render reservations and refunds"].map((item) => <p key={item} className="flex items-center gap-3"><BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" />{item}</p>)}
          </div>
        </Card>
      </div>

      <section>
        <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">Monthly subscriptions</p><h2 className="mt-2 font-display text-3xl font-semibold text-white">Choose your production pace</h2></div>
        <div className="grid gap-4 lg:grid-cols-3">
          {overview.plans.filter((plan) => plan.code !== "trial").map((plan) => {
            const featured = plan.code === "creator";
            const current = user?.plan.code === plan.code;
            return (
              <Card key={plan.code} className={cn("relative p-6", featured && "border-amber-400/30 bg-amber-400/[0.045]") }>
                {featured ? <Badge tone="amber" className="absolute right-5 top-5">Most popular</Badge> : null}
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.05] text-amber-300">{plan.code === "agency" ? <Zap className="h-5 w-5" /> : plan.code === "creator" ? <Sparkles className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}</span>
                <h3 className="mt-6 text-lg font-semibold text-white">{plan.name}</h3>
                <p className="mt-3 font-display text-4xl font-semibold text-white">${(plan.priceMonthlyCents / 100).toFixed(0)}<span className="text-sm font-normal text-zinc-500"> / month</span></p>
                <div className="my-6 h-px bg-white/[0.07]" />
                <ul className="space-y-3 text-sm text-zinc-400"><li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-300" />{plan.monthlyCredits} monthly credits</li><li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-300" />Up to {plan.maxVideoMinutes} minutes per film</li><li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-300" />{plan.maxConcurrentJobs} concurrent render{plan.maxConcurrentJobs === 1 ? "" : "s"}</li><li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-300" />No free-trial watermark</li></ul>
                <Button className="mt-7 w-full" variant={featured ? "primary" : "secondary"} disabled={current || user?.role === "admin" || !plan.purchasable} loading={subscribing === plan.code} onClick={() => subscribe(plan.code)}>{current ? "Current plan" : !plan.purchasable ? "Configure PayPal plan ID" : `Choose ${plan.name}`}</Button>
              </Card>
            );
          })}
        </div>
        {!overview.billingConfigured ? <Card className="mt-5 border-amber-400/15 bg-amber-400/[0.04] p-4 text-sm leading-6 text-amber-100/70">PayPal credentials and provider plan IDs are not configured in this environment. The billing UI is ready, but checkout remains disabled until the owner adds the production credentials.</Card> : null}
      </section>
    </div>
  );
}
