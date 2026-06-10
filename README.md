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
