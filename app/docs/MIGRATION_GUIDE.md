# Migration Guide: Prototype to CineAssemble Enhanced

The enhanced release replaces unscoped JSON job persistence and publicly addressable job media with MySQL ownership and authenticated private storage. The prototype did not contain a trustworthy tenant identity for each historical job. Therefore, historical files must not be exposed automatically to newly registered accounts.

The safest migration is a clean SaaS launch with the old job directory retained as a private administrator archive. This matches the current situation in which the VPS deployment has not yet been used for live customers.

## Migration policy

| Legacy data | Enhanced destination | Default action |
|---|---|---|
| Prototype job JSON | Tenant-scoped `jobs`, `scenes`, and `job_events` | Do not import automatically without a verified owner mapping |
| `final.mp4` and scene files | Private `assets` with tenant-prefixed keys | Archive offline; import only into the verified owner account |
| Uploaded references | Immutable private product/reference assets | Re-upload through the secure library so files are decoded, normalized, and hashed |
| API keys in old `.env` | New protected production `.env` | Rotate keys before deployment; never copy the old file blindly |
| Public `/media` links | Authenticated `/api/media/assets/:id` | Old links intentionally stop working |
| Prototype cost/state files | MySQL credit and provider-operation ledgers | Do not synthesize billable ledger history |

## 1. Freeze and back up the prototype

Stop the old API before copying its state. Create a checksummed archive of the original code, `.env`, job directory, and any manually uploaded references. Store the `.env` archive separately with stronger access restrictions because it contains provider credentials.

```bash
cd /path/to/old-installation
sudo systemctl stop OLD_SERVICE_NAME || true
tar -czf prototype-code-and-jobs.tar.gz \
  --exclude=node_modules \
  --exclude=dist \
  .
sha256sum prototype-code-and-jobs.tar.gz > prototype-code-and-jobs.tar.gz.sha256
```

Rotate OpenAI, Replicate, PayPal, SMTP, and any other provider credentials that were present in the old environment. Configure only the replacement credentials in the new `.env`.

## 2. Deploy the enhanced stack cleanly

Follow [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md). Use new Docker volumes for MySQL and private media. Do not mount the old `jobs/` directory at `/app/data`, and do not place historical files inside the Caddy document path.

Create the unlimited owner account after the stack is healthy:

```bash
docker compose exec web npm run admin:create -- owner@example.com "Studio Owner"
```

Run the budget, exact-product, standard, and premium canaries before opening registration.

## 3. Preserve historical films

If historical films are needed only as a record, keep the prototype archive offline and use a private administrator-only file store. This is preferable to manufacturing incomplete MySQL history for films that were created before accounts, credit reservations, provider-operation idempotency, or tenant-scoped assets existed.

If a historical film must appear in the enhanced studio, first create a written mapping containing the legacy job identifier, verified owner email, final MP4 path, title, film type, language, format, and creation date. Every row requires owner approval. Unknown ownership defaults to the platform administrator and must never be guessed from filenames or prompt text.

| Required mapping field | Reason |
|---|---|
| Legacy job ID | Idempotency and audit reference |
| Verified owner email | Tenant assignment |
| Final video path | Asset source |
| Title and film type | Customer-facing project metadata |
| Aspect ratio and duration | Playback metadata |
| Creation timestamp | Historical ordering |
| Import approver | Audit accountability |

A controlled importer should decode/probe each file, compute SHA-256, write through the private storage adapter, create a non-billable completed job owned by the mapped user, register the final asset, and record an administrator audit event. It must run in dry-run mode first and use the legacy ID as an idempotency key. The current release deliberately does not include an automatic bulk importer because an incorrect ownership guess would be a tenant privacy defect.

## 4. Recreate reusable products and references

Re-upload original product and reference images through **Product & character library**. The secure path verifies the decoded format, enforces size and pixel limits, strips metadata, normalizes the image, computes a hash, and stores it under the authenticated owner. Copying old files directly into the private volume would bypass these controls and would leave no valid MySQL asset record.

For commercial products, select strict fidelity when packaging, label text, color, logo, or silhouette must remain unchanged. Keep the true original outside the platform as part of the business asset archive.

## 5. Validate before cutover

| Validation | Pass condition |
|---|---|
| Accounts | Owner can sign in; a normal test user cannot open administrator routes |
| Tenant isolation | Two test users cannot read each other’s products, projects, or media |
| Public media | Old `/media/...` URLs return `404`; owned assets stream only after login |
| Database | Migrations report current checksums; `/health/ready` returns HTTP 200 |
| Credits | Trial is limited to one watermarked budget film; owner remains unlimited |
| Jobs | Draft, script edit, approval, render, scene rerender, and cancellation behave correctly |
| Backups | New MySQL and private-media backups restore successfully in isolation |

## 6. Cutover and rollback

Lower DNS TTL before the change window if necessary, stop the prototype, take a final archive, start the enhanced stack, and point the domain to Caddy. Keep the old system inaccessible but intact until the owner accepts the canary and customer workflows.

Rollback before any new customer writes by restoring the old service and DNS. After new accounts, films, or payments exist, do not roll back by discarding the enhanced database. Preserve MySQL and private media first, then choose a reconciliation plan. The two systems have different identity, asset, and billing models and cannot safely share one live job directory.
