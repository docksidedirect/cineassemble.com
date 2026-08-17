# CineAssemble Executive Engineering Audit and Handoff

**Release:** `ai_video_geni_enhanced`  
**Target:** Independent, self-hosted, multi-tenant AI video SaaS  
**Database:** MySQL 8.0+  
**Deployment:** Docker Compose on the owner’s VPS  
**Release assessment:** **Ready for production credential configuration and controlled provider canaries**

## Executive conclusion

The submitted project was a functional single-process video prototype, not a secure multi-user SaaS. It relied on unscoped JSON persistence, exposed generated media through predictable public paths, lacked native accounts and billing enforcement, rendered only one fixed canvas, and treated product references through a cartoon-oriented generation path. The enhanced release replaces those assumptions with MySQL ownership, native authentication, private assets, transactional credits, durable workers, explicit administrator authorization, seven user-selectable production strategies, exact-product preservation, script approval, one-scene regeneration, and landscape/vertical/square assembly.

The system is now independent and self-hostable. It contains no third-party platform authentication, connector, SDK, branding, or runtime dependency. The owner account is a verified MySQL `admin` and is unlimited on the server; normal users remain subject to plan, concurrency, trial, and credit rules.

## Before and after

| Area | Submitted prototype | Enhanced release |
|---|---|---|
| Identity | No production account boundary | Native verified email/password accounts, Argon2id, reset, opaque sessions, CSRF |
| Tenancy | Jobs were not scoped to authenticated owners | Every protected job, scene, asset, product, session, ledger entry, and subscription is tenant-scoped |
| Persistence | JSON files | MySQL migrations, foreign keys, indexes, idempotency keys, transactions, and checksums |
| Media security | Predictable public job files | Private local/S3 adapter and authenticated ownership-checked byte-range streaming |
| Video choice | Cartoon-oriented paths | Seven explicit production types with distinct script, pacing, visual, and reference policies |
| Products | Reference could be redrawn/cartoonized | High-fidelity editing or deterministic unchanged-pixel compositing |
| Canvas | Fixed `16:9` | `16:9`, `9:16`, and `1:1` through every media stage |
| Script control | Render began immediately | Persisted priced draft, editable scene preview, explicit approval |
| Scene recovery | Whole film rerender | Tenant-safe one-scene regeneration and final-film reassembly |
| Queue | In-process execution | MySQL leases, heartbeats, crash recovery, bounded concurrency, and separate workers |
| Credits | Prototype estimate only | Immutable ledger, reservation, charge, refund, trial claim, admin adjustment, idempotency |
| Administrator | Informal bypass | Protected role middleware, unlimited generation, analytics, audited controls, self-demotion protection |
| Billing | Not enforced end to end | Server-side PayPal subscription flow and signature-verified, deduplicated webhooks |
| Operations | Limited logs and deployment artifacts | Structured redacted logs, liveness/readiness, Docker, Caddy HTTPS, backup and rollback runbooks |

## Completed customer capabilities

Users explicitly choose among cartoon story, real-product promo, realistic human film, social media ad, explainer, cinematic story, and reference-led video. Each choice changes scene count, duration boundaries, reference requirements, script framework, visual directive, preservation behavior, default style, compatible formats, and pricing inputs. The public metadata contract is versioned and returned with `Cache-Control: no-store`, preventing a new client from receiving an obsolete schema.

| Customer workflow | Completed behavior |
|---|---|
| Registration and recovery | Register, verify email, sign in, forgot/reset password, view and revoke sessions |
| Create film | Choose type, format, duration, quality, language, voice mode, captions, lip-sync, products, references |
| Product library | Upload, decode, normalize, hash, save, reuse, and delete real products privately |
| Reference library | Save recurring characters, people, styles, and general reference images |
| Script review | Generate priced draft, review/edit scenes, inspect estimate, approve explicitly |
| Render tracking | View stage progress, scene state, normalized errors, estimated and actual credit effects |
| Scene regeneration | Regenerate one owned scene, preserve unaffected assets, reassemble final film |
| Playback | Seekable authenticated streaming and protected download |
| Billing/account | View plan, credits, entitlements, sessions, and PayPal subscription handoff |
| Owner controls | MRR estimate, users, jobs, failures, provider cost, credit adjustments, roles, account status |

## Exact-product design

The uploaded product original is immutable and is never overwritten. In high-fidelity mode, it is the first authoritative reference passed to image editing with high input fidelity. In strict mode, the system generates the environment separately and composites the decoded uploaded product itself over that background, preserving the product’s original pixels rather than asking a model to redraw labels, typography, colors, shape, or logo. The image-edit provider supports source images and high-fidelity input handling, which is the correct foundation for reference-led product scenes.[1]

Strict-product fixtures were generated in landscape, vertical, and square formats and inspected visually. The validation also compared the composited source region deterministically to prove that source pixels were retained.

## Multi-tenant security model

Tenant identity comes from the opaque authenticated session, not from a user ID supplied by the browser. Normal repositories query by both resource ID and server-derived owner ID. Cross-tenant products, assets, jobs, media, deletes, and scene-regeneration requests return `404` without confirming that another customer’s object exists. This follows the principle of binding tenant context to the authenticated session and enforcing it again at the data layer.[2]

Sessions use unpredictable raw tokens stored only in an `HttpOnly` cookie; MySQL stores only their SHA-256 hashes. Passwords use Argon2id. Unsafe requests require a rotating session-bound CSRF token. Login, registration, and recovery endpoints have dedicated rate limits and generic responses where account disclosure is possible. Session rotation and server-side state follow established session-management guidance.[3]

Uploads are stored outside the public web root. The server enforces an allowlist, byte and pixel limits, decoded type verification, metadata stripping, re-encoding, server-generated keys, hashes, and ownership checks. These controls align with established secure-upload guidance.[4]

> The administrator is unlimited for generation and credits, but does not silently bypass normal tenant privacy routes. Cross-tenant visibility exists only through explicit protected administrator endpoints and is audited.

## Data and billing integrity

MySQL contains users, plans, sessions, one-time auth tokens, email outbox, subscriptions, credit ledger, jobs, scenes, job events, provider operations, assets, products, references, job attachments, webhook events, and security audit records. Migrations are numbered, checksum-protected, and guarded by a database advisory lock.

Normal film approval reserves estimated credits transactionally. Completion settles the charge, failure or cancellation releases/refunds the reservation, and every operation has an idempotency key. The one-film trial is claimed in the same transaction as its watermarked budget render. Administrators bypass availability checks and receive zero-credit scene regeneration while provider costs remain visible for economics.

PayPal secrets remain on the server. Webhook events are signature-verified, stored by provider event ID, deduplicated, and applied idempotently. Live approval still requires the owner’s PayPal sandbox and production canaries before launch.

## Durable rendering and media pipeline

The API never performs a multi-minute render inline. Approval creates durable queue state in MySQL. Workers claim jobs with leases, renew heartbeats, recover abandoned work, respect configured concurrency, and reuse already registered outputs. Generated files are streamed into private storage rather than loaded entirely into memory.

Every aspect ratio propagates through image size, strict product placement, animation, FFmpeg normalization, caption safe areas, karaoke highlights, watermark, title card, and final assembly. Regenerating one scene invalidates only that revision’s derived media and the final assembly.

## Validation evidence

The release was tested against real MySQL 8 and real FFmpeg. The full local release gate passes after every final correction.

| Validation | Result |
|---|---:|
| ESLint | PASS |
| Strict TypeScript and Vite production build | PASS |
| Unit tests | 9/9 PASS |
| MySQL clean migration and checksum reruns | PASS |
| Phase 5–10 integration matrix | PASS |
| Final metadata and administrator HTTP suite | PASS |
| Tenant boundary tests | PASS |
| Product/reference upload security | PASS |
| Strict-product pixel preservation | PASS |
| `16:9`, `9:16`, and `1:1` FFmpeg assembly | PASS |
| Karaoke captions and free watermark | PASS |
| One-scene regeneration isolation | PASS |
| Auth, reset revocation, CSRF rotation | PASS |
| Trial and administrator unlimited behavior | PASS |
| PayPal event idempotency | PASS |
| Dependency audit | 0 known vulnerabilities |
| Secret-pattern scan | PASS |
| Platform-independence scan | 0 references |
| Compose v2 configuration rendering | PASS |
| Caddy official parser | PASS |
| Production Docker image build | PASS |
| Non-root read-only container with MySQL readiness | PASS |
| Browser review of public, account, studio, library, creation, and admin pages | PASS |

The container smoke test found and corrected a readiness defect before handoff: MySQL’s scalar could arrive as a string, causing an `ok:false` body with HTTP 200. The probe now normalizes the scalar and returns HTTP 503 whenever a dependency is unhealthy. A rebuilt UID/GID 10001 container running with a read-only root filesystem returned HTTP 200, `ok:true`, database latency, and the expected security headers.

The full commands and deliberate test exclusions are documented in [VALIDATION_REPORT.md](VALIDATION_REPORT.md).

## Deployment package

The release includes a multi-stage non-root Dockerfile, MySQL/web/worker/Caddy Compose topology, private volumes, internal backend network, health checks, automatic HTTPS configuration, complete environment template, secure owner bootstrap, backup and restore commands, scaling guidance, incident actions, and migration policy.

The first production sequence is:

```bash
cp .env.example .env
chmod 600 .env
# Replace every CHANGE_ME value.
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose exec web npm run admin:create -- owner@example.com "Studio Owner"
curl --fail https://YOUR_DOMAIN/health/ready
```

Then execute the controlled budget, exact-product, standard, premium, trial, administrator, PayPal sandbox, and email canaries from [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md). Do not open registration or accept production payments until those account-specific provider tests pass.

## Scope intentionally deferred

Voice cloning, public share pages, full brand kits, referrals, agency workspaces, customer API credentials/webhooks, and direct social publishing are not represented as complete. They introduce biometric consent, public-token abuse, workspace authorization, fraud, external credential vaulting, and new billing surfaces. They are sequenced with concrete acceptance criteria in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) rather than being added as insecure placeholders.

This release already includes the foundation required by those modules: MySQL ownership, private storage, immutable assets, durable operations, role middleware, audit logs, entitlements, idempotent ledgers, administrator oversight, and S3 compatibility.

## Handoff files

| File | Purpose |
|---|---|
| `README.md` | Installation, features, local development, operations, and common commands |
| `docs/UPGRADE_ARCHITECTURE.md` | Architecture, security boundaries, data model, and acceptance criteria |
| `docs/DEPLOYMENT_RUNBOOK.md` | VPS cutover, canaries, backup, scaling, upgrades, rollback, and incidents |
| `docs/MIGRATION_GUIDE.md` | Safe transition from unscoped prototype jobs to tenant-scoped MySQL |
| `docs/VALIDATION_REPORT.md` | Test matrix, pass evidence, and paid-provider exclusions |
| `docs/PRODUCT_ROADMAP.md` | Brand, sharing, voice, referral, agency, API, and publishing sequence |
| `docs/architecture.png` | Runtime topology diagram |
| `.env.example` | Complete production configuration template |
| `Dockerfile` / `docker-compose.yml` / `ops/Caddyfile` | Reproducible production runtime |

## Final recommendation

Deploy this release first to a staging hostname with production-equivalent MySQL, storage, SMTP, and provider limits. Complete the canary matrix, verify PayPal sandbox lifecycle and real email receipt, restore a backup, and observe queue/provider economics for several films. Once those external-account checks pass, the system is suitable for controlled customer launch. Add roadmap modules one at a time behind entitlement and audit boundaries rather than expanding the core with unverified integrations.

## References

[1]: https://developers.openai.com/api/reference/resources/images/methods/edit "OpenAI Images API — Edit images"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html "OWASP Multi-Tenant Security Cheat Sheet"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"
[4]: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html "OWASP File Upload Cheat Sheet"
