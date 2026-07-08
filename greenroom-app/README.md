# The Greenroom

A multi-user character roleplay platform: real accounts, private personas/characters,
a public gallery, and an admin panel with true server-side login (not a client-side
passcode) — regular users genuinely cannot get admin access.

## How admin works

- Admin is granted **only** during registration, by entering the `ADMIN_CLAIM_CODE`
  you set in `.env`. That code lives on the server and is never sent to the browser
  except as a pass/fail result — there's nothing in the frontend code to inspect or bypass.
- Once you've registered your own admin account, it's a good idea to remove/rotate
  `ADMIN_CLAIM_CODE` in `.env` (and restart the server) so no one else can claim admin.
- Admins can ban/unban users and remove characters from the **public gallery only**.
  There is no endpoint, anywhere in this codebase, that lets admin read another
  user's private characters or private chat history — that data is scoped to
  `owner_id` in every query.

## Local setup

```bash
cd greenroom-app
npm install
cp .env.example .env
# edit .env: set JWT_SECRET, ANTHROPIC_API_KEY, and ADMIN_CLAIM_CODE
npm start
```

Visit `http://localhost:3000`, sign up with your admin code to become the first admin,
then (optionally) blank out `ADMIN_CLAIM_CODE` in `.env` and restart the server.

## Deploying it for real (so others can use it)

Any Node-friendly host works. Render, Railway, and Fly.io all have free/cheap tiers
and are simple for a small app like this:

1. Push this folder to a GitHub repo.
2. Create a new "Web Service" (Render) or equivalent on your host of choice, pointing
   at that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add the same environment variables from `.env` in the host's dashboard
   (never commit your real `.env` file — `data.db` and `.env` are already
   git-ignored, see `.gitignore`).
5. The SQLite database (`data.db`) is a single file. Most hosts wipe the local disk
   on redeploy, so if you want data to survive redeploys, use the host's "persistent
   disk" feature (Render has one) and point the app at that mounted path, or swap
   `better-sqlite3` for a hosted database like Postgres later on if you outgrow SQLite.

## Notes / next steps if you want to harden this further

- Add rate limiting (e.g. `express-rate-limit`) on `/api/auth/*` to slow down
  password-guessing attempts.
- Add email verification if you want registration to require a real email.
- Move from a JWT-in-localStorage pattern to an httpOnly cookie if you want extra
  protection against token theft via XSS.
- Consider a proper hosted database (Postgres) if you expect many concurrent users.
