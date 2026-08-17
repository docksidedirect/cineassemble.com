# CineAssemble VPS Deployment and Operations Runbook

This runbook deploys the enhanced CineAssemble release as four isolated services: MySQL, web/API, durable worker, and Caddy HTTPS edge. The edge can reach only the web service. MySQL and the worker remain on an internal network, and Caddy never mounts private media.

## 1. Preflight

Before cutover, confirm the domain resolves to the VPS, ports 80 and 443 are available, outbound HTTPS and SMTP are permitted, and the server has adequate disk space for MySQL plus generated media. Keep at least one independent encrypted backup destination outside the VPS.

| Check | Required state |
|---|---|
| DNS | Public domain resolves to the VPS address |
| Firewall | TCP 80/443 and UDP 443 accepted; MySQL 3306 not public |
| Docker | Docker Engine and Compose v2 installed |
| Disk | Separate alert threshold for database and media growth |
| Credentials | SMTP, PayPal, OpenAI, Replicate, and FAL production credentials ready |
| PayPal | Three subscription plan IDs and a webhook configured for the public domain |
| Email | Sender domain approved and test inbox available |
| Backups | Off-host encrypted destination and restore-test owner assigned |

## 2. Install and configure

Extract the release under a non-public directory, create `.env`, and restrict it to the deployment account.

```bash
mkdir -p /opt/cineassemble
cd /opt/cineassemble
# Extract the release here.
cp .env.example .env
chmod 600 .env
```

Replace every `CHANGE_ME` value. Use different long passwords for `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD`. Set `APP_SECRET` to an unpredictable value of at least 32 characters. Set `CADDY_DOMAIN` to the hostname only, and make `APP_URL` and `ALLOWED_ORIGINS` the exact matching HTTPS origin.

Set the PayPal webhook destination to:

```text
https://YOUR_DOMAIN/api/billing/paypal/webhook
```

The webhook ID in `.env` must correspond to that PayPal webhook. Use `PAYPAL_ENVIRONMENT=sandbox` for the canary deployment and switch to `live` only after the sandbox subscription lifecycle succeeds.

## 3. Validate and start

Render the Compose configuration before building. This catches missing required environment values without starting services.

```bash
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

The expected state is `healthy` for MySQL and web, `running` for the worker, and `running` for Caddy. Inspect startup logs without printing environment values:

```bash
docker compose logs --tail=100 mysql
docker compose logs --tail=100 web
docker compose logs --tail=100 worker
docker compose logs --tail=100 caddy
```

Confirm public probes:

```bash
curl --fail https://YOUR_DOMAIN/health/live
curl --fail https://YOUR_DOMAIN/health/ready
```

`/health/live` confirms the process is running. `/health/ready` returns HTTP 200 only when MySQL and the local private storage are available. It returns HTTP 503 on dependency failure.

## 4. Bootstrap the unlimited owner

Create the first administrator through the secure interactive CLI after the web service is healthy:

```bash
docker compose exec web npm run admin:create -- owner@example.com "Studio Owner"
```

The CLI prompts for the password without accepting it as a command-line argument. The account is verified and assigned the server-side `admin` role. Sign in through the normal login page and confirm the sidebar reports **Unlimited** and exposes the protected **Administrator** workspace.

Do not create administrator status through a frontend flag, environment-only bypass, or direct browser request. Subsequent role changes should use the protected administrator dashboard and its audit records.

## 5. Production canary

Run one controlled film for each distinct provider path before opening registration. Use a test product with fine label text to judge fidelity.

| Canary | Configuration | Pass condition |
|---|---|---|
| Budget local | Cartoon story, 1 minute, `16:9`, subtitles | Script, TTS, local animation, assembly, playback, and download succeed |
| Exact product | Product promo, 1 minute, `9:16`, strict fidelity | Uploaded product pixels, label, shape, color, and logo remain unchanged |
| Standard | Social ad, 1 minute, `9:16`, karaoke captions | FAL animation, word highlighting, safe caption margins, and final playback succeed |
| Premium | Realistic human or cinematic, 1 minute, `16:9` | Replicate animation and provider fallback/error reporting behave correctly |
| Scene rerender | Regenerate one scene in a completed canary | Only that scene receives a new revision; other scene assets remain unchanged |
| Trial account | New normal user, budget tier | Exactly one trial film is allowed and receives the configured watermark |
| Administrator | Owner account, premium film | No credit or plan limit blocks approval; provider cost is still recorded |

After each canary, inspect the project timeline and administrator dashboard. Provider errors should be normalized for the customer while structured logs retain request ID, job ID, stage, and provider without secrets.

## 6. PayPal and email canary

In PayPal sandbox, create one subscription for each plan and verify approval return, webhook signature validation, subscription status, and exactly one credit grant for a repeated webhook event. Cancel one sandbox subscription and confirm the local state changes without deleting prior ledger entries.

Register a fresh account through the public form and verify receipt of the verification message. Complete verification, request a password reset, consume the link once, and confirm all earlier sessions are revoked. Test invalid and reused links; the UI must remain generic and must not disclose whether an unrelated email exists.

## 7. Backups

Back up MySQL and private media in the same operational window. Store copies off the VPS and encrypt them. An example database backup is:

```bash
mkdir -p /opt/cineassemble-backups
chmod 700 /opt/cineassemble-backups
docker compose exec -T mysql sh -c \
  'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "/opt/cineassemble-backups/mysql-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

An example local-media backup is:

```bash
docker run --rm \
  -v cineassemble_private_media:/source:ro \
  -v /opt/cineassemble-backups:/backup \
  alpine sh -c 'tar -C /source -czf /backup/private-media-$(date -u +%Y%m%dT%H%M%SZ).tar.gz .'
```

Run a restore drill into an isolated database and volume. The drill passes only when migrations are current, users can authenticate, and several original/final assets stream through authenticated media routes.

## 8. Monitoring and alerting

Monitor the public readiness endpoint, service restarts, MySQL disk usage, private-media volume usage, queue age, worker heartbeat age, failed-job count, provider cost, and SMTP outbox retry count. The administrator dashboard provides operational aggregates; infrastructure alerts should remain independent of the application UI.

| Alert | Suggested trigger |
|---|---|
| Readiness | Two consecutive HTTP 503 responses |
| Queue stall | Oldest queued job exceeds the expected provider window and no worker heartbeat progresses |
| Worker crash loop | More than three restarts within fifteen minutes |
| Disk | Warning at 70%, urgent at 85% for database or private media |
| Email outbox | Pending/retrying messages exceed the normal verification volume |
| Provider spend | Daily cost exceeds the owner’s configured budget threshold |
| Authentication abuse | Sustained rate-limit denials or unusual administrator failures |

## 9. Scale workers

Increase worker replicas only after confirming provider quotas and MySQL headroom:

```bash
docker compose up -d --scale worker=3
```

Total process concurrency is approximately worker replicas multiplied by `WORKER_CONCURRENCY`. Account-level plan concurrency and the administrator’s unlimited role remain enforced in the job service. Separate-host workers require S3-compatible storage; a local Docker volume is suitable only when all workers share one host.

## 10. Upgrade procedure

Create verified backups first. Copy the new release beside the current one, compare `.env.example` for new variables, render Compose, and build without stopping the live system. Then apply migrations and replace containers:

```bash
docker compose build --pull
docker compose run --rm web node server/db/migrate.js
docker compose up -d --remove-orphans
docker compose ps
curl --fail https://YOUR_DOMAIN/health/ready
```

Migrations are additive and checksum-protected. Never edit a migration already applied to production. If a release requires an irreversible data change, prepare and test a separate rollback plan before migration.

## 11. Rollback

If the database schema remains backward-compatible, retag or restore the previous image and run `docker compose up -d`. If an irreversible migration has run, stop writes, restore the matching MySQL and media backups into an isolated environment, verify them, then direct traffic to the restored stack.

Do not roll back only MySQL or only media. Asset records and storage objects must come from a compatible backup window.

## 12. Incident actions

If credentials may be exposed, rotate the affected provider, PayPal, SMTP, database, and application secrets; revoke all sessions; inspect administrator audit logs; and preserve structured logs. If tenant isolation may be affected, disable public access at Caddy, stop workers after current writes finish, preserve evidence, and avoid deleting or rewriting affected records until the scope is understood.

When provider abuse or unexpected spend occurs, pause workers, revoke the provider key, and keep the web service online for account access and completed-film downloads. Resume with a new key only after queued jobs, plan rules, and rate limits are reviewed.
