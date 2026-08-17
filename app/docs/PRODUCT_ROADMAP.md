# CineAssemble Product Roadmap

This roadmap protects the production core while moving CineAssemble toward a differentiated agency-grade film platform. Features are sequenced by customer value, revenue leverage, data sensitivity, and the amount of new security surface they introduce. A feature does not enter general availability until tenant isolation, billing behavior, deletion, retry safety, observability, and administrator operations have explicit acceptance tests.

## Release status

| Capability | Current status | Release evidence |
|---|---:|---|
| Landscape, vertical, and square films | Complete | Real FFmpeg fixtures in all three canvases |
| Editable script before spending credits | Complete | Persisted draft, scene editor, explicit approval |
| Regenerate one scene | Complete | Other scene assets retained and final film reassembled |
| Native account recovery and verification | Complete | Single-use tokens, revocation, email outbox |
| One budget trial film and watermark | Complete | Server-side entitlement and transactional trial claim |
| Karaoke captions | Complete | Word-timed ASS subtitle assembly |
| Saved products and recurring references | Complete | Tenant-private product/reference library |
| Real-product preservation | Complete | High-fidelity editing plus unchanged-pixel compositor |
| MySQL, durable workers, and S3 compatibility | Complete | Migrations, leases, heartbeats, private storage adapter |
| Unlimited administrator and operations dashboard | Complete | Server role, analytics, audited user and credit controls |
| Brand kits | Foundation only | Schema boundary defined; customer workflow not released |
| Public share pages | Not released | Must add revocable scoped share tokens and abuse controls |
| Voice cloning | Not released | Requires consent, deletion, provider policy, and premium billing |
| Referrals | Not released | Requires fraud-resistant reward and reversal rules |
| Agency teams | Not released | Requires workspace membership and seat-based authorization |
| Customer API | Not released | Requires scoped credentials, quotas, idempotency, and webhooks |
| Direct publishing | Not released | Requires platform OAuth, token vaulting, and retry-safe uploads |

## Roadmap sequence

### R1 — Brand systems and controlled sharing

The next release should add reusable brand kits and revocable film-share pages because both improve retention without introducing biometric data or external publishing credentials. A brand kit stores an owned logo asset, color tokens, approved fonts, intro/outro policy, caption defaults, and optional call-to-action. The render manifest resolves the kit at approval time so a later kit edit cannot silently alter an in-progress film.

| Module | Required acceptance criteria |
|---|---|
| Brand kit | Tenant-scoped create/update/archive; private logo validation; contrast-safe colors; immutable snapshot on job approval |
| Branded output | Logo safe areas for all formats; intro/outro duration limits; deterministic fallback when a logo cannot be decoded |
| Share page | High-entropy hashed token, optional expiry, revocation, owner-only analytics, no private source asset disclosure |
| Growth attribution | Share page carries campaign attribution without exposing user email or internal project identifiers |
| Abuse controls | Per-link view limits, rate limiting, report action, administrator suspension, audit events |

### R2 — Consent-driven voice cloning

Voice cloning should be a separately entitled premium module. The product must collect an affirmative consent statement, retain the source sample privately, identify the voice provider and retention policy, support immediate revocation, and prevent a removed voice from being selected for new jobs. Existing completed films remain immutable unless the owner deletes them under the platform’s retention policy.

| Control | Required implementation |
|---|---|
| Enrollment | Minimum-quality recording checks, explicit speaker consent, ownership attestation, provider job idempotency |
| Storage | Encrypted private sample, tenant-scoped metadata, configurable retention, permanent-delete workflow |
| Authorization | Voice belongs to one account/workspace; no public identifier permits reuse by another tenant |
| Billing | Premium entitlement, clear per-minute estimate, reservation before cloning or generation |
| Safety | Restricted names/use cases, report pathway, audit events, provider refusal surfaced without leaking internals |

### R3 — Referrals and product-led growth

Referrals should use an immutable reward ledger rather than modifying balances directly. A reward is provisional until the referred account reaches a defined verified milestone; cancellation, refund, duplicate identity, or abuse can create a compensating reversal. The owner dashboard should show issued, pending, converted, reversed, and suspected rewards.

| Capability | Acceptance criteria |
|---|---|
| Referral links | Unique non-sequential code, expiry/disable support, no email disclosure |
| Reward policy | Idempotent grant, provisional state, maximum rewards per period, documented reversal conditions |
| Abuse prevention | Rate limits, duplicate signals, self-referral denial, administrator review queue |
| Customer UI | Clear “give/get” terms and separate pending/available credit amounts |

### R4 — Agency workspaces and brand portfolios

Agency accounts should introduce `workspaces`, `workspace_members`, and `workspace_roles` instead of overloading the current user role. Personal projects can be migrated into a personal workspace through a dedicated migration. The owner remains a platform administrator, while agency roles apply only inside their workspace.

| Workspace role | Intended authority |
|---|---|
| Owner | Billing, members, all projects, brand kits, destructive operations |
| Manager | Create/approve productions, manage brand kits, view workspace usage |
| Creator | Create and edit assigned projects, use approved assets |
| Reviewer | Comment, approve scripts, view protected previews |
| Billing | Invoices, usage, plans, and credit packs without production access |

Every query must include `workspace_id`; asset attachment must confirm both workspace ownership and user membership. Seat invitations require single-use tokens, expiry, audit records, and immediate revocation when a member is removed.

### R5 — Customer API and outbound webhooks

The customer API should reuse the internal service layer rather than call HTTP routes from inside the application. API credentials must be shown once, stored only as hashes, scoped by workspace and capability, individually revocable, and rate-limited by plan. Mutating requests require idempotency keys so clients can retry safely.

| API area | Minimum scope |
|---|---|
| Projects | Create draft, fetch estimate, list/get project, cancel queued render |
| Scenes | Read draft, edit before approval, request one-scene regeneration |
| Assets | Create upload intent, register verified upload, list owned products/references |
| Events | Signed `job.progress`, `job.completed`, `job.failed`, and `credit.low` webhooks |
| Operations | Usage endpoint, request IDs, documented limits, webhook replay and rotation |

### R6 — Direct publishing

YouTube, TikTok, and other publishing connectors should ship one platform at a time. OAuth refresh tokens belong in an encrypted token vault and must never enter logs or the browser after exchange. Publishing is a separate durable operation from rendering so a transient social-platform failure cannot invalidate a completed film or charge generation credits again.

The first release should support owner-approved title, description, privacy, thumbnail, captions, and scheduled time. It must display the destination account immediately before publishing and require explicit confirmation. Upload retries use the platform’s resumable protocol where available and record remote video IDs for reconciliation.

## Market-quality investments

Feature breadth should not displace measurable output quality. The following investments run across every roadmap release.

| Investment | Product outcome | Engineering measure |
|---|---|---|
| Product fidelity scorecards | Commercial customers trust labels and packaging | Golden-source image comparisons and reviewer sign-off by format |
| Character continuity | Series creators reuse the same cast | Reference library, identity checks, scene-to-scene drift review |
| Script quality templates | Each video type feels purpose-built | Type-specific hook, pacing, CTA, education, and narrative rubrics |
| Provider routing | Quality and margin remain predictable | Canary set, provider latency/cost/error dashboard, controlled fallback |
| Render explainability | Users understand time, cost, and failures | Stage timeline, provider-neutral errors, retry eligibility, exact credit effect |
| Accessibility | Films and studio work for more customers | Keyboard navigation, focus states, readable contrast, caption and transcript export |
| Trust and compliance | Enterprise and agency buyers can assess risk | Retention controls, deletion reports, audit export, incident and moderation runbooks |

## Release governance

Each module should progress through internal fixture tests, isolated provider sandbox tests, owner canary, limited customer beta, and general availability. Database changes use additive numbered migrations. Provider switches use configuration and canary routing rather than emergency code edits. Every release must preserve the normal-user tenant boundary and the explicit server-side unlimited administrator policy.

A roadmap item is complete only when its customer UI, API/service layer, MySQL model, queue behavior, billing effects, audit events, deletion path, administrator operations, deployment configuration, and automated tests are released together.
