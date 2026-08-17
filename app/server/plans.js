/* Pricing model for cineassemble.com — edit prices freely, everything reads from here.

   Margin math (from real renders):
     budget film  ≈ $0.50 real cost  → costs 1 credit   (client pays ~$0.75)
     standard film≈ $4.00 real cost  → costs 8 credits  (client pays ~$6)
     premium film ≈ $9.00 real cost  → costs 18 credits (client pays ~$13)
   1 credit ≈ $1 face value → ~50% margin on every tier. */

export const CREDIT_COST = {
  base: { budget: 1, standard: 8, premium: 18 },
  lipsyncAddon: 2, // added when lip-sync is on
};

export function jobCreditCost(job) {
  const tier = CREDIT_COST.base[job.qualityTier] ? job.qualityTier : "premium";
  return CREDIT_COST.base[tier] + (job.lipsync ? CREDIT_COST.lipsyncAddon : 0);
}

/* Monthly subscriptions — PayPal plan IDs come from .env (create plans in the
   PayPal dashboard, see docs/SAAS.md). credits = monthly grant. */
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    credits: 12,
    blurb: "Try it out — a few films every month",
    paypalPlanId: process.env.PAYPAL_PLAN_STARTER || "",
  },
  {
    id: "creator",
    name: "Creator",
    price: 29,
    credits: 45,
    blurb: "Weekly stories for your channel",
    paypalPlanId: process.env.PAYPAL_PLAN_CREATOR || "",
    featured: true,
  },
  {
    id: "studio",
    name: "Studio",
    price: 79,
    credits: 140,
    blurb: "Daily production for serious creators",
    paypalPlanId: process.env.PAYPAL_PLAN_STUDIO || "",
  },
];

/* One-time credit top-ups (PayPal Orders, no subscription) */
export const PACKS = [
  { id: "pack10", credits: 10, price: 10 },
  { id: "pack30", credits: 30, price: 27 },
  { id: "pack100", credits: 100, price: 85 },
];

export function filmPriceExamples() {
  // shown on the landing page pricing section
  return {
    budget: CREDIT_COST.base.budget,
    standard: CREDIT_COST.base.standard,
    premium: CREDIT_COST.base.premium,
  };
}
