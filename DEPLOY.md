# Deploying a free public demo

A light, free setup meant for a portfolio: visitors sign in with shared guest
accounts and try the app. It is **not** a production deployment.

| Piece | Where | Cost |
|---|---|---|
| Database | MongoDB Atlas (M0) | free |
| Node API + lightweight AI service | Render | free |
| React app | Vercel | free |

## What "light" means

The full AI service installs PyTorch (about 1.2 GB), which does not fit a free
tier. `sih-ai-service/requirements-light.txt` leaves it out (about 70 MB). I
measured the difference:

| | Full | Light |
|---|---|---|
| Category, department, priority | yes | **identical** (rule-based) |
| Near-identical duplicate ("pothole on MG Road" restated) | caught | caught |
| Reworded duplicate ("crater" vs "pothole") | caught | **missed** |

So the visible AI behaviour (routing, priority, urgency, "raised to High") is
unchanged. Only reworded-duplicate detection is weaker. If you want that back,
deploy the AI service from a Dockerfile on a host with at least 2 GB of memory,
using `requirements.txt` instead.

## What demo mode does

Both halves are switched on by one setting each (`DEMO_MODE` on the API,
`VITE_DEMO_MODE` in the client build).

- Sign-up, "forgot password" and "Create an account" disappear; the login pages
  show one-click guest accounts instead (a citizen and a government official).
- The API itself refuses registration, profile edits, password changes and
  password reset. This matters: the guest password is shared, so without it a
  single visitor could change it and lock out everyone after them.
- Each account may file 10 grievances per hour, because anyone holding a guest
  login can write to your database.
- The **owner** account is never shown. It can delete data, so its credentials
  stay private.

## Steps

Do them in this order; each one produces a URL the next needs.

### 1. MongoDB Atlas

1. Create a free **M0** cluster at <https://www.mongodb.com/atlas>.
2. **Database Access** -> add a user with a strong password.
3. **Network Access** -> allow `0.0.0.0/0`. Render's free tier has no fixed
   outbound address, so it cannot be restricted to one.
4. **Connect** -> *Drivers* -> copy the connection string and add the database
   name, e.g. `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/citizencare`.

### 2. Render (API + AI service)

1. **New -> Blueprint**, connect this GitHub repo. Render reads `render.yaml`
   and creates `civiqai-ai` and `civiqai-api`.
2. On `civiqai-api`, set the four variables marked `sync: false`:
   - `MONGODB_URI`: the Atlas string from step 1
   - `ADMIN_EMAILS`: your real owner email
   - `CLIENT_URL` and `AI_SERVICE_URL`: leave blank for now
3. Once both services are live, copy their URLs, then set
   `AI_SERVICE_URL` to the AI service URL and redeploy the API.

### 3. Vercel (React app)

1. **Add New -> Project**, import the repo, set **Root Directory** to
   `sih-web-portal/client` (framework: Vite).
2. Add these environment variables (they are baked in at build time):

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-api>.onrender.com/api` |
   | `VITE_DEMO_MODE` | `true` |
   | `VITE_DEMO_PASSWORD` | the guest password you choose (shown publicly on the login page) |

3. Deploy, copy the Vercel URL, set it as `CLIENT_URL` on the Render API
   (exactly, no trailing slash), and redeploy the API. Until you do, the browser
   blocks every API call as a cross-origin request.

### 4. Create the owner and the demo data (from your laptop)

Wake both Render services first by opening `/health` and `/api/health` in a
browser, or the first requests time out.

Create your owner account (credentials come from the environment, so nothing
lands in git):

```bash
cd sih-web-portal/server
MONGODB_URI='mongodb+srv://...' OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-private-password' node scripts/createOwner.mjs
```

Seed the guest accounts and sample grievances. `--no-admin` skips the demo admin
and `DEMO_PASSWORD` must match `VITE_DEMO_PASSWORD`:

```bash
MONGODB_URI='mongodb+srv://...' AI_SERVICE_URL='https://<your-ai>.onrender.com' DEMO_PASSWORD='the-guest-password' node seedDemo.js --reset --no-admin
```

Do not run the seed without `--no-admin` against a live database.

## Free-tier behaviour to expect

- **Cold starts.** Free Render services sleep after about 15 minutes idle, so the
  first visit can take 30 to 60 seconds. Worth a line in your portfolio blurb.
- **Slow first submission.** The API waits up to 65 s for the sleeping AI service (`AI_SERVICE_TIMEOUT_MS`); with the default 12 s it would give up and file the grievance as "Other".
- **Duplicate detection after a restart.** The search index lives on local disk,
  which the free tier wipes on every restart, so older grievances stop being
  matched. Sign in as the owner and press **Rebuild from database** in the Owner
  Console (or call `POST /api/issues/ai-reindex`).
- **The map.** Without a Mappls key the street map shows a notice; the state
  heat-map and the location picker still work.

## What I tested, and what I could not

Tested on an isolated local stack that mirrors this setup (light AI service, API
in `NODE_ENV=production` with `DEMO_MODE=true`, demo-mode client build, a
throwaway database): guest login with a custom password, the old public password
rejected, registration / password change / profile edit / password reset all
refused (403) with the guest password left intact, the owner endpoints closed to
guests, grievances classified by the light AI service, the 11th submission in an
hour refused (429), and the sign-up and forgot-password URLs redirecting to
sign-in. The existing 238-check suite still passes.

**Not tested:** `render.yaml` against a real Render account, and the Atlas and
Vercel steps. They follow those services' standard flows, but treat the first
deploy as the real test and read the service logs if something is off. Free-tier
limits and pricing change; check each provider's current terms.
