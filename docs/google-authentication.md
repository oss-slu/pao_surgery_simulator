# Google Authentication

PAO Surgery Simulator supports email/password accounts and Google Identity Services (GIS) sign-in. Google users are identified by Google’s permanent `sub` claim (`users.google_sub`), not by email alone.

## Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Configure the **OAuth consent screen** (External or Internal as appropriate for your org).
3. Create credentials → **OAuth client ID** → Application type **Web application**.
4. Note the **Client ID** only. The Client Secret is **not** used by this app and must never be placed in frontend code or committed.

### Authorized JavaScript origins

Add the origins where the React app is served, for example:

- Local development: `http://localhost:3000`
- Deployed frontend origin(s) used in production

Authorized redirect URIs are not required for the GIS ID-token button flow used here (`google.accounts.id` / Continue with Google).

The same Client ID string must be configured on both backend and frontend (see below).

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `GOOGLE_CLIENT_ID` | `backend/.env` | Audience used when verifying Google ID tokens (`POST /api/auth/google`) |
| `REACT_APP_GOOGLE_CLIENT_ID` | `frontend/.env.development` / `.env.production` | Client ID passed to GIS in the browser |
| `SECRET_KEY` | `backend/.env` | Existing app secret (verification tokens); still required |
| `FRONTEND_URL` | `backend/.env` | Base URL for email-verification links when Google is not authoritative for the email |

Templates (no secrets):

- [`backend/.env.example`](../backend/.env.example)
- [`frontend/.env.example`](../frontend/.env.example)

Copy examples into local env files. Keep real Client IDs out of git. Maintainers can share setup steps and example origins without sharing production Client IDs or any Client Secret.

`REACT_APP_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` must be the **same** Web client ID so tokens issued to the SPA verify on the API.

## Running Google authentication locally

1. Ensure PostgreSQL is running and `backend/database.ini` is configured. Startup runs `initialize_db()`, which adds nullable `google_sub` and allows nullable `user_password` without dropping existing rows.
2. Set `GOOGLE_CLIENT_ID` in `backend/.env`.
3. Set `REACT_APP_GOOGLE_CLIENT_ID` in the frontend env file (restart `npm start` after changing it).
4. Start backend (`python app.py` from `backend/`) and frontend (`npm start` from `frontend/`).
5. Open `http://localhost:3000/login` (or Sign Up) and use **Continue with Google**.

Successful Google auth returns the same session payload as `POST /api/login` and the frontend stores it with `storeSession()`.

## Account behavior

| Scenario | Behavior |
|----------|----------|
| New Google user, Gmail / Google Workspace (`hd`) with verified email | Account created (`user_password` null, `google_sub` set, verified); one-hour session issued |
| New Google user, third-party email (Google not authoritative) | Account created unverified; verification email sent; session withheld until `/api/verify_email` |
| Returning Google user (`google_sub` match) | Login; session issued if already verified |
| Email already belongs to a password (or other) account without that `google_sub` | `409` `ACCOUNT_CONFLICT` — **no automatic linking** |
| Google-only user + password login | Rejected (`Invalid password`); null passwords are not checked with Werkzeug |

Account linking (attach Google to an existing password account, or the reverse) is **not** implemented.

## Automated testing

Backend and frontend tests **mock** Google token verification / GIS. They do not call Google and do not need live credentials.

```bash
# Backend (from backend/)
python -m pytest -v

# Frontend (from frontend/)
npm run test:ci
npm run build
```

Focused Google suites: `backend/tests/test_google_auth.py`, `frontend/src/tests/googleAuth.test.js`.

## Manual checks that still need a real Google account

Automated tests cannot replace:

- Creating a Web client and authorizing `http://localhost:3000`
- Clicking Continue with Google in the browser (popup / account picker)
- Confirming a real Gmail signup lands on the dashboard
- Confirming a third-party Google email receives a verification message when using SMTP or the console mailer

## Known limitations

- No in-app UI to link Google to an existing password account (or unlink).
- Users who already registered with email/password must keep using password login for that email until a future linking feature exists.
- CORS is not narrowed to the GIS origin list; follow existing deployment guidance for production hardening.
- Docker Compose DB settings may still differ from `database.ini` (existing project caveat).
