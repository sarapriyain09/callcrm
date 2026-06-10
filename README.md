# CallCRM MVP

CallCRM is a customer call management platform for SMEs that combines Twilio voice routing, CRM contact lookup, call logs, recordings metadata, and AI-ready call summaries.

## MVP Scope

- Twilio incoming call webhook with IVR (Sales, Support, Accounts)
- Call routing to configurable phone numbers
- Call log capture (status, duration, recording URL, outcome)
- Contact lookup and notes/tags support
- Missed-call email notifications (stub service)
- React dashboard for calls and contacts

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL + Prisma ORM
- Telephony: Twilio Voice webhooks

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

   Windows without Docker:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-postgres.ps1
   ```

3. Configure environment:

   ```bash
   copy .env.example .env
   ```

4. Run migrations and generate Prisma client:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate -- --name init
   ```

5. Start API and web app:

   ```bash
   npm run dev
   ```

- API: http://localhost:4000
- Web: http://localhost:5173

## Twilio Setup

1. Buy a Twilio phone number with Voice enabled.
2. Set incoming call webhook to:
   - `POST https://<your-public-url>/twilio/voice/incoming`
3. Set status callback webhook to:
   - `POST https://<your-public-url>/twilio/voice/status`
4. Set recording status callback webhook to:
   - `POST https://<your-public-url>/twilio/voice/recording`

For local testing, use ngrok to expose the API:

```bash
ngrok http 4000
```

## Phase 2 Hooks (already scaffolded)

- Add transcript ingestion endpoint
- Call summary generation service
- CRM sync adapters (HubSpot, Salesforce, Zoho)
- WhatsApp workflow module

## AI Summary Endpoints

Store transcript for a call:

```bash
curl -X POST http://localhost:4000/api/calls/<call-id>/transcript \
   -H "Content-Type: application/json" \
   -d '{"transcript":"Customer asked for urgent callback tomorrow morning."}'
```

Generate and persist AI summary/action items:

```bash
curl -X POST http://localhost:4000/api/calls/<call-id>/ai-summary \
   -H "Content-Type: application/json" \
   -d '{"notes":"High-priority manufacturing prospect"}'
```

If `OPENAI_API_KEY` is not set, the API still returns a deterministic fallback summary so workflows continue during setup.

## Raspberry Pi 5 Deployment (PM2 + Cloudflare)

### 1. Initial transfer from Windows to Pi

Use one of these options.

Option A (recommended): git clone on Pi

```bash
git clone https://github.com/sarapriyain09/callcrm.git /home/sarapriyain/callcrm
```

Option B: direct sync from Windows terminal with rsync/scp equivalent

```bash
rsync -avz --exclude node_modules --exclude .git --exclude .env ./ sarapriyain@192.168.0.64:/home/sarapriyain/callcrm/
```

You can also use WinSCP GUI to copy project files to `/home/sarapriyain/callcrm`.

### 2. Bootstrap Pi runtime

On Raspberry Pi:

```bash
cd /home/sarapriyain/callcrm
bash deploy/pi/bootstrap.sh
```

Then create `/home/sarapriyain/callcrm/.env` with production values.

### 3. Deploy and run with PM2

```bash
cd /home/sarapriyain/callcrm
bash deploy/pi/deploy.sh
pm2 status
```

PM2 apps are defined in [ecosystem.config.cjs](ecosystem.config.cjs).

### 4. Cloudflare subdomain setup

Target domain: `callcrm.splendidtechnology.co.uk`

Recommended: Cloudflare Tunnel on Pi (no router port-forwarding needed).

Install and authenticate `cloudflared`, then create tunnel and ingress:

```yaml
tunnel: callcrm-pi
credentials-file: /home/sarapriyain/.cloudflared/<tunnel-id>.json

ingress:
   - hostname: callcrm.splendidtechnology.co.uk
      service: http://localhost:4173
   - service: http_status:404
```

Create DNS route in Cloudflare for the tunnel hostname.

### 5. Automatic routine on every git update

This repo includes GitHub Actions deploy workflow:

- [.github/workflows/deploy-pi.yml](.github/workflows/deploy-pi.yml)

On every push to `main`, GitHub connects via SSH and runs `deploy/pi/deploy.sh` on Pi.

Configure these GitHub repository secrets:

- `PI_HOST` = `192.168.0.64` (or public/VPN-accessible host)
- `PI_USER` = `sarapriyain`
- `PI_SSH_PRIVATE_KEY` = private key for Pi SSH access
- `PI_PORT` = `22` (optional)
- `PI_APP_DIR` = `/home/sarapriyain/callcrm`

If GitHub cannot directly access your LAN IP, expose Pi through Tailscale/WireGuard or a reachable SSH endpoint.
