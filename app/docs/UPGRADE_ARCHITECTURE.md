# CineAssemble Production Upgrade Architecture

**Author:** CineAssemble Engineering  
**Target:** Independent, self-hosted, multi-tenant AI video SaaS  
**Primary deployment:** Docker Compose on the owner’s VPS  
**Database:** MySQL 8.0+

## 1. Architecture decision

The submitted application will be evolved rather than replaced. The React/Vite client and the existing FFmpeg/Python media utilities remain, while the backend becomes a modular Express service with MySQL repositories, native authentication, tenant-scoped storage, a durable database-backed job queue, and isolated worker execution. No third-party platform authentication, proprietary connector, or platform-specific runtime is required.

The governing invariant is:

> Every protected read, mutation, file access, queue claim, billing event, and administrative action must derive identity from a verified server-side session and enforce ownership or explicit admin authorization on the server.

## 2. Deployment options

The implementation will target the VPS option already specified by the owner. A managed-services option is documented as a future scaling path rather than embedded into the application.

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| Self-hosted Docker Compose on one VPS | Portable, full FFmpeg control, simple ownership; the owner manages backups, patching, monitoring, and capacity | Existing VPS plus provider usage | Medium |
| Managed MySQL, object storage, and separate container workers | Better independent scaling and durability; more vendors, credentials, and operational cost | Higher recurring infrastructure cost | High |

## 3. Runtime topology

| Component | Responsibility | Scaling model |
|---|---|---|
| `web` | React assets, REST API, native auth, billing webhooks, signed media responses | Horizontal, stateless except database/session access |
| `worker` | Claims queued jobs, runs script/TTS/image/video/lip-sync/assembly stages, records heartbeats | One or more replicas with MySQL row locks |
| `mysql` | Users, sessions, jobs, scenes, assets, credits, subscriptions, webhooks, audit events | Single primary initially, managed replica/backup later |
| `storage` | Tenant-prefixed originals and generated media; local private volume initially, S3-compatible adapter later | Storage adapter boundary |
| `reverse-proxy` | TLS, request size limits, compression, secure headers, routing | Single VPS ingress |

The API process never runs a long render inline. A generation request creates or updates a job transactionally and commits it to a durable queue state. Workers claim work with a lease, update heartbeats, and make each stage idempotent. A crashed lease can be reclaimed without duplicating paid provider work where an output or provider operation is already recorded.

## 4. Security model

### 4.1 Native authentication

Users authenticate with verified email and password. Passwords are stored only as Argon2id hashes. Authentication uses opaque random session tokens; only a SHA-256 token hash is stored in MySQL. The browser receives the raw token in an `HttpOnly`, `Secure` production cookie with `SameSite=Lax`, `Path=/`, and a non-descriptive name. Session identifiers rotate on login, password reset, role change, and other privilege transitions. OWASP recommends server-side session state, unpredictable identifiers, cookie-only exchange, TLS, and rotation after privilege changes.[1]

Registration, login, email verification, forgot-password, reset-password, and resend-verification endpoints use generic responses where account disclosure is possible. Login and recovery endpoints have dedicated IP- and account-keyed rate limits. Verification and reset tokens are random, stored only as hashes, single-use, and short-lived.

### 4.2 Tenant isolation

The initial product uses one personal workspace per account, represented by `user_id`; the schema can later add agency/team workspaces without rewriting asset ownership. Every tenant-owned table includes `user_id`, and every repository method requires a server-derived tenant context. Lookups use both the resource ID and owner ID. The client never supplies a trusted owner ID. OWASP recommends binding tenant context to the authenticated session and enforcing composite tenant/resource access at the data layer.[2]

Administrators are recognized only by the database role. The unlimited policy is evaluated server-side:

```text
if user.role == "admin":
    generation quota = unlimited
    credit reservation = bypassed
else:
    reserve and settle credits transactionally
```

Admin status does not bypass tenant privacy implicitly. Cross-user access is available only through explicit admin endpoints, is audited, and is never obtained by calling normal user routes with another user’s ID.

### 4.3 Request and browser security

Unsafe requests require a valid authenticated session and same-origin checks. Authenticated responses use a per-session CSRF token for defense in depth. The service applies Helmet security headers, strict JSON/body limits, explicit CORS allowlists when cross-origin access is configured, centralized Zod validation, normalized errors, request IDs, and structured logs. Secrets remain server-side environment values.

### 4.4 Upload and media security

Product, character, voice, logo, and brand uploads are stored outside the public web root. The server generates storage keys, verifies extension and decoded signature, limits bytes and pixel dimensions, decodes and re-encodes images, computes SHA-256, and rejects unsupported or malformed content. Media access requires ownership or a time-limited public share token. OWASP recommends allowlisted extensions, signature validation, server-generated filenames, limits, authorization, and storage outside the web root.[3]

## 5. MySQL data model

All business timestamps are UTC. Public identifiers are UUIDs. Foreign keys, unique idempotency keys, tenant-prefixed indexes, and transactional credit settlement are mandatory.

| Table | Purpose | Critical constraints |
|---|---|---|
| `users` | Identity, role, status, verification, trial state | Unique normalized email; `role` is `user` or `admin` |
| `sessions` | Opaque server-side sessions | Unique token hash; user FK; idle and absolute expiry |
| `auth_tokens` | Email-verification and password-reset tokens | Unique token hash; purpose; one-time consumption |
| `plans` | Plan entitlements and prices | Unique plan code; JSON feature policy |
| `subscriptions` | PayPal subscription state | Unique provider subscription ID; user and plan FKs |
| `credit_ledger` | Immutable grants, reservations, charges, refunds, adjustments | Unique idempotency key; signed amount |
| `jobs` | Tenant-owned film projects and durable queue state | Owner index; lease owner/expiry; optimistic version |
| `scenes` | Editable script and per-scene render state | Unique `(job_id, scene_index)`; owner FK |
| `assets` | Private product, character, logo, voice, scene, and final media metadata | Unique storage key and SHA-256 metadata |
| `products` | Saved real-product library | Owner FK; immutable original asset; preservation profile |
| `job_assets` | Products/characters/brand assets attached to a job | Unique role/asset/job relation |
| `job_events` | Structured progress, retry, provider, and failure timeline | Owner/job indexes; bounded message payloads |
| `provider_operations` | Idempotent paid API request ledger | Unique operation key; provider request/result metadata |
| `share_links` | Revocable public film pages | Hashed token; expiry; view policy |
| `webhook_events` | PayPal webhook deduplication and processing status | Unique provider event ID |
| `audit_logs` | Authentication, admin, billing, and security events | Actor, target, action, request ID, metadata |
| `brand_kits` | Logo, colors, outro, default caption style | One or more kits per owner |
| `character_library` | Reusable character/reference profiles | Owner and reference-asset relations |
| `referrals` | Referral ownership and reward state | Unique code and referred-user relationship |

## 6. Credits, trials, and unlimited administrator

Credits are an immutable ledger rather than a mutable counter. A normal generation first reserves the estimated charge in a transaction. Completion settles the actual charge and releases the difference; failure refunds the unused reservation through compensating entries. A unique idempotency key prevents webhook or retry duplication.

New users receive the configurable trial entitlement. Trial films are restricted to the budget tier and receive a watermark. Paid entitlement removes the watermark. The admin role bypasses credit availability and plan limits but still records estimated provider cost for profitability analytics.

## 7. Product-preserving generation

The film-type contract becomes explicit:

| Film type | Visual path | Preservation behavior |
|---|---|---|
| `cartoon_story` | Animated generation or character-reference editing | Stylization is allowed; attached character identity remains authoritative |
| `product_promo` | High-fidelity reference editing or strict original-pixel compositing | Shape, labels, colors, proportions, materials, logos, and trademarks remain intact |
| `realistic_human` | Photoreal generation or human-reference editing | Human identity, anatomy, wardrobe, and photographic realism are prioritized |
| `social_ad` | Mobile-first commercial generation with optional owned references | Products and people follow their source policies; framing protects caption-safe zones |
| `explainer` | Clean editorial generation and demonstrations | References clarify the subject without inventing illegible diagrams or interfaces |
| `cinematic_story` | Cinematic-realism generation with continuity-aware references | Character identity and visual continuity persist across dramatic shot coverage |
| `reference_video` | High-fidelity editing led by an attached reference | Source identity, shape, palette, materials, and distinguishing details are authoritative |

The OpenAI image edit API supports source images, `input_fidelity: "high"`, and portrait/landscape output sizes.[4] Product jobs therefore use an edit request with the immutable original product as the first source. Prompts include a preservation clause and scene composition, while the original file is never overwritten. The system also exposes a strict composite mode that places the unchanged product cutout over a generated background when pixel-level label fidelity is more important than natural scene integration.

## 8. Creation workflow

Generation is a two-step workflow:

1. **Draft:** Prompt, film type, language, aspect ratio, quality, voice mode, products/references, brand kit, subtitles, watermark policy, and target duration produce a priced script draft.
2. **Render:** The user edits scene narration/dialogue and prompts, approves the estimate, and starts rendering.

Supported aspect ratios are `16:9`, `9:16`, and `1:1`. The selected format propagates through image size, video-provider inputs, Ken Burns fallback, scene previews, subtitle safe areas, title card, watermark, and final FFmpeg assembly.

Each scene has independent revisions. Regenerating one scene invalidates only its derived image, clip, lip-sync output, and final assembly. The original script, other scenes, and shared product/reference assets remain untouched. Every rerender is a separate idempotent operation with a clear credit estimate.

## 9. API boundary

| Area | Principal endpoints |
|---|---|
| Auth | `/api/auth/register`, `/login`, `/logout`, `/me`, `/verify-email`, `/forgot-password`, `/reset-password`, `/sessions` |
| Account | `/api/account/profile`, `/security`, `/credits`, `/subscription` |
| Products | `/api/products`, `/api/products/:id`, protected product preview/content routes |
| Characters/brand | `/api/characters`, `/api/brand-kits` |
| Jobs | `/api/jobs`, `/api/jobs/:id`, `/draft`, `/approve`, `/retry`, `/cancel` |
| Scenes | `/api/jobs/:jobId/scenes/:sceneId`, `/regenerate`, `/preview` |
| Media | Protected asset streaming/download routes; share-token route for public pages |
| Billing | `/api/billing/plans`, `/checkout`, `/portal`, `/paypal/webhook` |
| Admin | `/api/admin/overview`, `/users`, `/jobs`, `/costs`, `/audit` |
| Health | `/health/live`, `/health/ready` with no secret or environment-name disclosure |

All protected resources return `404` rather than revealing the existence of another user’s object. Admin routes require an explicit role middleware and create audit records.

## 10. Provider and language contracts

Provider adapters receive a normalized request instead of reading arbitrary job objects. The script output is validated against a schema before persistence. A language registry defines the supported script language, subtitle direction, TTS compatibility, and fallback voice. Provider downloads enforce HTTPS, timeout, maximum response size, and expected content type.

Paid operations use operation keys such as `job:<jobId>:scene:<sceneId>:revision:<n>:image`. Provider results are written atomically before a scene is marked complete. Retrying a stage reuses a confirmed result rather than charging twice.

## 11. Observability and operations

Structured logs include request ID, authenticated actor ID, job ID, scene ID, stage, provider, latency, and normalized error code without secrets or raw credentials. The admin dashboard reads aggregates from MySQL: active subscriptions, credit usage, provider cost, gross margin estimate, queue depth, failure rate, and average render duration. Health endpoints distinguish process liveness from MySQL/storage/FFmpeg readiness.

Daily MySQL backups, media-volume backups or object-storage versioning, restore drills, log rotation, provider-spend alerts, disk-space alerts, and queue-stall alerts are required production controls.

## 12. Prioritized implementation scope

| Priority | Included in this upgrade | Acceptance condition |
|---|---|---|
| P0 | MySQL schema/migrations, native auth, sessions, role checks, tenant repositories | Cross-user access tests fail closed; admin is server-authorized |
| P0 | Private assets, secure product upload, product library | Original product is immutable and never publicly exposed |
| P0 | Product-preserving render path | Product jobs call reference-image editing with high fidelity or strict compositing |
| P0 | Script draft/edit/approve, cost estimate, one-scene regeneration | Rendering cannot start until an approved persisted draft exists |
| P0 | 16:9, 9:16, 1:1 end-to-end | Final dimensions and all intermediate stages match selection |
| P0 | Durable queue leases, retries, cancellation, job events | Restarted workers resume safely without losing completed assets |
| P0 | Trial watermark, credit ledger, unlimited admin | Admin never blocks on credits; normal users cannot overspend |
| P1 | PayPal subscription/pack webhook foundation | Signed/deduplicated events update subscriptions and credits transactionally |
| P1 | Saved product/reference library and admin operations dashboard | Reusable assets are tenant-private; revenue/cost/queue/user views are admin-only and audited |
| Roadmap | Brand kits and revocable public share pages | Release only with owned asset snapshots, hashed share tokens, expiry, revocation, and abuse controls |
| Roadmap | Voice cloning, referrals, agency seats, direct publishing, and customer API | Release as separate audited modules with consent, scoped authorization, idempotency, deletion, and provider credential controls |

## 13. Definition of done

The upgrade is complete only when the production build and lint pass, migrations apply to a clean MySQL database, automated tests cover authentication and cross-tenant denial, uploaded media is private, admin unlimited behavior is tested server-side, scene regeneration is isolated, all aspect ratios assemble successfully with synthetic local fixtures, secrets are absent from source and logs, Docker Compose starts the documented services, and the amended files are packaged with deployment and migration instructions.

## References

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html "OWASP Multi-Tenant Application Security Cheat Sheet"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html "OWASP File Upload Cheat Sheet"
[4]: https://developers.openai.com/api/reference/resources/images/methods/edit "OpenAI Create Image Edit API Reference"
