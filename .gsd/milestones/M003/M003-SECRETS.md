# Secrets Manifest

**Milestone:** M003 — TSA Site Generator
**Generated:** 2026-03-13

### DATAFORSEO_LOGIN

**Service:** DataForSEO
**Dashboard:** https://app.dataforseo.com/api-access
**Format hint:** email address (the account login email used as API username)
**Status:** pending
**Destination:** dotenv

1. Log in to https://app.dataforseo.com
2. Navigate to API Access (left sidebar or https://app.dataforseo.com/api-access)
3. Your API login is your account email address — copy it
4. Add to `.env` as `DATAFORSEO_LOGIN=your@email.com`

---

### DATAFORSEO_PASSWORD

**Service:** DataForSEO
**Dashboard:** https://app.dataforseo.com/api-access
**Format hint:** API password (distinct from account login password — shown on the API Access page)
**Status:** pending
**Destination:** dotenv

1. Log in to https://app.dataforseo.com
2. Navigate to API Access (left sidebar or https://app.dataforseo.com/api-access)
3. Copy the **API password** shown on that page (not your account password)
4. If not shown, click "Reset API Password" to generate one
5. Add to `.env` as `DATAFORSEO_PASSWORD=<api-password>`

---

### UNSPLASH_ACCESS_KEY

**Service:** Unsplash
**Dashboard:** https://unsplash.com/oauth/applications
**Format hint:** 43-character alphanumeric string
**Status:** pending
**Destination:** dotenv

1. Log in at https://unsplash.com/join or sign in to your existing account
2. Go to https://unsplash.com/oauth/applications
3. Click "New Application" → accept API guidelines → fill in application name and description
4. After creation, scroll to "Keys" section — copy the **Access Key**
5. Add to `.env` as `UNSPLASH_ACCESS_KEY=<access-key>`
6. Note: Free tier = 50 req/hour. Request production key (5000 req/hour) after demo app is approved by Unsplash.

---

### UPSTASH_REDIS_URL

**Service:** Upstash Redis
**Dashboard:** https://console.upstash.com
**Format hint:** `rediss://:<password>@<endpoint>:<port>` (starts with `rediss://`)
**Status:** pending
**Destination:** dotenv

1. Log in at https://console.upstash.com
2. Select your existing Redis database (or create a new one: click "Create Database" → choose region close to VPS1)
3. In the database detail page, click "Connect" or find the "REST URL" / "Redis URL" section
4. Copy the **Redis URL** (the `rediss://` connection string, not the REST URL)
5. Add to `.env` as `UPSTASH_REDIS_URL=rediss://:<password>@<endpoint>:<port>`

---

### ANTHROPIC_API_KEY

**Service:** Anthropic (Claude API)
**Dashboard:** https://console.anthropic.com/account/keys
**Format hint:** `sk-ant-api03-...` (starts with `sk-ant-`)
**Status:** pending
**Destination:** dotenv

1. Log in at https://console.anthropic.com
2. Navigate to Account → API Keys (or https://console.anthropic.com/account/keys)
3. Click "Create Key" → give it a name (e.g. "monster-content-generator")
4. Copy the key immediately — it is only shown once
5. Add to `.env` as `ANTHROPIC_API_KEY=sk-ant-api03-...`
6. Note: Used by ContentGenerator (BullMQ worker) via `@anthropic-ai/sdk` — NOT the Agent SDK. Same key works for both.
