# CineAssemble Release Validation Report

**Release candidate:** `1.0.0-enhanced`  
**Database target:** MySQL 8.0+  
**Validation environment:** Isolated Ubuntu host, MySQL 8, Node.js 22, Python 3.11, FFmpeg  
**Result:** **PASS**

The enhanced release passed the complete local quality gate and all deterministic integration suites. The tests exercise native authentication, tenant isolation, immutable credit accounting, the unlimited administrator role, private asset delivery, secure image decoding, exact-product compositing, multi-format FFmpeg output, queue behavior, script-first drafts, and administrator boundaries against real MySQL rather than mocks.

| Validation area | Evidence | Result |
|---|---|---:|
| Strict TypeScript build | `tsc -b` and Vite production build | PASS |
| JavaScript quality | ESLint across the repository | PASS |
| Unit tests | 9 deterministic tests in `tests/core.test.js` | 9/9 PASS |
| MySQL migrations | Clean application plus two checksum/idempotency reruns | PASS |
| Tenant repositories | Cross-user products, assets, jobs, and queue ownership | PASS |
| Credits and administrator | Reservations, settlement, refunds, trial, idempotency, unlimited admin | PASS |
| Secure uploads | Signature, decode, re-encode, metadata removal, spoof rejection, tenant-private keys | PASS |
| Product fidelity | Pixel-preserving strict compositor in `16:9`, `9:16`, and `1:1` | PASS |
| Media assembly | Real FFmpeg landscape, vertical, square, watermark, standard and karaoke captions | PASS |
| Scene regeneration | One scene invalidated; unaffected scene assets retained | PASS |
| Native authentication | Argon2id, verification, reset revocation, opaque sessions, CSRF rotation | PASS |
| Billing state | Webhook deduplication and idempotent subscription credit grants | PASS |
| HTTP boundaries | Headers, CORS denial, CSRF denial, private range streaming, no public media | PASS |
| Administrator HTTP boundary | Non-admin denied; admin dashboard allowed; audited credit adjustment; self-demotion blocked | PASS |
| Dependency audit | `npm audit` after patched Nodemailer and Sharp upgrades | 0 vulnerabilities |
| Platform independence | Full source scan excluding dependencies/build output | 0 platform-specific references |
| Backend/Python syntax | `node --check` and Python `compileall` | PASS |
| Browser review | Landing, login, studio, admin, library, and multi-type creation workflow | PASS |
| Compose manifest | Rendered with Compose v2 using the documented environment template | PASS |
| Production image | Full multi-stage Docker build with patched production dependencies | PASS |
| Container runtime | UID/GID 10001, read-only root filesystem, Python, FFmpeg, compiled client, real MySQL | PASS |
| HTTPS edge | Official Caddy parser and formatter | PASS |
| Production readiness | HTTP 200 only with healthy MySQL and writable private storage; secure headers present | PASS |

## Multi-video-type contract

The public metadata contract exposes seven distinct production strategies through one authoritative registry. Each type provides its own duration limits, reference requirements, supported canvases, visual-preservation policy, script framework, and default style. A versioned, `no-store` metadata response prevents a newly deployed client from receiving a stale schema.

| Production type | Required source | Validated strategy behavior |
|---|---|---|
| Cartoon story | Optional character references | Animated character continuity and structured story arc |
| Real-product promo | At least one owned saved product | High-fidelity edit or strict unchanged-pixel compositing |
| Realistic human film | Optional human reference | Photographic identity and anatomy preservation |
| Social media ad | Optional product/person references | Fast hook, mobile-safe composition, short-form pacing |
| Explainer video | Optional reference | Problem-context-solution-proof instructional sequence |
| Cinematic story | Optional character/person reference | Dramatic shot progression and cinematic continuity |
| Reference-led video | At least one owned reference | Reference identity treated as authoritative |

## Security assertions

Normal user routes return `404` for another tenant’s resources and never accept a client-supplied owner identity. The administrator role is loaded from MySQL on the server and is required by explicit middleware. Administrator status bypasses credit and render limits but does not silently weaken normal tenant routes. Protected mutations require both the authenticated cookie session and the rotating session-bound CSRF token.

The final administrator HTTP test discovered and corrected an enum mismatch in credit adjustments before release. The corrected ledger entry now uses the valid immutable `adjustment` type and records the acting administrator in `created_by_user_id`; the complete test then passed.

The production-container smoke test also exposed a MySQL scalar-type mismatch that caused readiness to report `ok:false` in a successful response. The database health probe now normalizes the MySQL value, and the readiness route returns HTTP 503 whenever a dependency is unhealthy. The rebuilt non-root, read-only image subsequently returned HTTP 200 with `ok:true`, database latency, private-storage access, and the expected security headers.

## Deliberately excluded live checks

Paid external generation calls were not executed during release validation because they would consume provider funds and require the owner’s production credentials. The provider request construction, reference ordering, safety checks, strict compositor, queue recovery, and downstream FFmpeg stages were validated deterministically. A controlled canary film should be generated after production keys are configured.

Live PayPal approval and SMTP delivery were likewise not performed with real accounts. Signature-verification logic, event deduplication, subscription state changes, credit idempotency, secure email templates, and durable outbox retries were exercised locally. Production checkout, webhook delivery, and email receipt must be included in the deployment canary checklist.

## Reproduction commands

```bash
npm ci
npm run check
npm audit
npm run db:migrate
node scripts/validate-phase5.js
node scripts/validate-phase6.js
node scripts/validate-phase7.js
node scripts/validate-phase8.js
node scripts/validate-phase9.js
node scripts/validate-phase10.js
node scripts/validate-phase12.js
```

The integration scripts require a disposable MySQL database and the environment variables documented in `.env.example`. Do not run them against production data.
