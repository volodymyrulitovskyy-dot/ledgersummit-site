# Month-End Dashboard 3

A Next.js application for month-end closing dashboards with Supabase authentication and Prisma database management.

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Supabase** for authentication (email/password)
- **Prisma** + **PostgreSQL** for database
- **Tailwind CSS** for styling
- **Zod** for validation
- **xlsx** for Excel exports

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Existing Supabase project (reuses the same database as `month-end-dashboard` and `month-end-dashboard-2`)
- Access to Supabase SQL Editor

### Installation

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Set up environment variables:**

**Option A: Copy from existing month-end-dashboard project (recommended):**

If you have the env file from `month-end-dashboard` or `month-end-dashboard-2`, use the helper script:

```bash
./scripts/copy-env.sh ../month-end-dashboard-2/.env.local
```

Or manually copy and modify:
- Copy the env file from `month-end-dashboard-2` (usually `.env.local` or `.env`)
- Paste it to `month-end-dashboard-3/.env`
- Modify `DATABASE_URL` to append `?schema=med3` (or `&schema=med3` if URL already has query params)
- Optionally modify `SHADOW_DATABASE_URL` to append `?schema=med3_shadow`

**Option B: Create from template:**

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**IMPORTANT: Schema Isolation**

This project reuses the same Supabase database as `month-end-dashboard` and `month-end-dashboard-2` but isolates all tables in a separate schema (`med3`) to avoid conflicts.

Required environment variables:
- `DATABASE_URL` - Your Supabase Postgres connection string
  - Example: `postgresql://postgres:[PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres`
  - **Reuse the same connection string from `month-end-dashboard-2/.env.local`**
  - **Do NOT include `?schema=med3` in the URL** - Prisma uses `@@schema("med3")` on models instead
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL (reuse from month-end-dashboard)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key (reuse from month-end-dashboard)
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (optional, reuse if available)
- `NEXT_PUBLIC_APP_URL` - Your app URL (default: http://localhost:3015)

**QuickBooks Online (optional):**
- `QBO_CLIENT_ID` - Your QuickBooks OAuth app client ID
- `QBO_CLIENT_SECRET` - Your QuickBooks OAuth app client secret
- `QBO_REDIRECT_URI` - OAuth callback URL (default: http://localhost:3015/api/qbo/callback)
- `QBO_ENV` - Environment: `sandbox` or `production` (default: `sandbox`)

**Note:** QBO env vars are already set up as commented placeholders in `.env`. To reuse configuration from an existing `month-end-dashboard-2` project:

1. **Option A - Use the helper script:**
   ```bash
   ./scripts/copy-qbo-env.sh ../month-end-dashboard-2 .env.local
   ```

2. **Option B - Manual copy:**
   - Open `month-end-dashboard-2/.env.local` (or `.env`)
   - Copy these variables (preserve exact names and values):
     - `QBO_CLIENT_ID`
     - `QBO_CLIENT_SECRET`
     - `QBO_REDIRECT_URI`
     - `QBO_ENV`
   - Paste them into `month-end-dashboard-3/.env` (uncomment if needed)

3. **Update redirect URI:**
   - Ensure `QBO_REDIRECT_URI` includes: `http://localhost:3015/api/qbo/callback`
   - Add this redirect URI to your Intuit Developer app settings (multiple redirect URIs are allowed)

4. **Restart dev server** after updating env vars:
   ```bash
   npm run dev
   ```

3. **Create database schemas (REQUIRED FIRST STEP):**

**IMPORTANT:** Before running any Prisma migrations, you must create the schemas in Supabase:

- Open your Supabase project dashboard
- Go to SQL Editor
- Run the SQL script: `scripts/create_schemas.sql` (update schema names to `med3` and `med3_shadow`)
  - This creates both `med3` and `med3_shadow` schemas
  - Grants necessary permissions to Supabase roles (anon, authenticated, service_role)
- **If you skip this step, Prisma migrations will fail with permission errors**

**Important:** After creating the schemas, you also need to expose `med3` via Supabase API:
- Go to Settings → API in your Supabase dashboard
- Under "Exposed schemas", add `med3` to the list
- This allows Supabase client libraries to access tables in the `med3` schema

4. **Set up the database:**

**First-time setup (create initial migration):**

```bash
# Create the initial migration
npx prisma migrate dev --name init
```

This will:
- Create migration files in `prisma/migrations/`
- Apply the migration to create tables in the `med3` schema
- Generate the Prisma Client

**If migrate dev fails due to shadow DB permissions:**

```bash
# Generate migration files without applying
npx prisma migrate dev --create-only --name init

# Then apply the migration manually
npx prisma migrate deploy
npx prisma generate
```

**Subsequent deployments (after migrations exist):**

```bash
npx prisma migrate deploy
npx prisma generate
```

**Verify:** Check in Supabase SQL Editor that tables are created under `med3` schema:
```sql
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema = 'med3';
```

5. **Create additional tables (for full functionality):**

To enable all features, create the following tables:

**A. Close Tasks (for checklist feature):**
- Open Supabase SQL Editor
- Run: `sql/patch_close_tasks_range.sql` (adds range_from_date/range_to_date columns)
- After running, regenerate Prisma client: `npx prisma generate`

**B. Trial Balance (for TB import and exceptions):**
- Open Supabase SQL Editor
- Run: `sql/tb.sql`
- This creates `tb_snapshots` and `tb_lines` tables
- After running, regenerate Prisma client: `npx prisma generate`

**C. Rules and Exceptions:**
- Open Supabase SQL Editor
- Run: `sql/rules_and_exceptions.sql`
- This creates `rules` and `exceptions` tables
- After running, regenerate Prisma client: `npx prisma generate`

**D. QuickBooks Online Connections (optional):**
- Open Supabase SQL Editor
- Run: `sql/qbo_connections.sql`
  - This creates `qbo_connections` table for storing OAuth tokens
  - Creates the `med2.update_updated_at_column()` trigger function if it doesn't exist
  - Sets up automatic `updated_at` timestamp updates
- After running, regenerate Prisma client: `npx prisma generate`
- Restart dev server: `npm run dev`

**Note:** All SQL files are idempotent (safe to re-run) and use `IF NOT EXISTS` checks.

5. **Start the development server:**

```bash
npm run dev
```

The app will be available at [http://localhost:3015](http://localhost:3015)

## Project Structure

```
src/
├── app/
│   ├── (app)/          # Protected routes (require auth)
│   │   ├── org/        # Organization selection page
│   │   └── close/      # Close dashboard page
│   ├── (public)/       # Public routes
│   │   └── auth/       # Authentication page
│   ├── api/
│   │   └── health/     # Health check endpoint
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page (redirects to /org or /auth)
├── lib/
│   ├── auth/
│   │   └── requireUser.ts  # Auth guard for protected routes
│   └── supabase/
│       ├── server.ts    # Server-side Supabase client
│       └── browser.ts   # Client-side Supabase client
└── middleware.ts        # Auth middleware for route protection

prisma/
└── schema.prisma        # Database schema
```

## Routes

- `/` - Home (redirects to `/org` if authenticated, `/auth` if not)
- `/auth` - Sign in / Sign up page
- `/org` - Organization selection (protected)
- `/close` - Close dashboard (protected)
- `/api/health` - Health check endpoint (returns `{ ok: true, ts: ... }`)

## Database Schema

All tables are created in the `med3` schema to isolate them from the `month-end-dashboard` and `month-end-dashboard-2` projects:

- **users** - User accounts (linked to Supabase auth)
- **orgs** - Organizations
- **org_members** - User-organization relationships with roles
- **periods** - Month-end periods per organization
- **close_tasks** - Close checklist tasks (scoped by date range)
- **tb_snapshots** - Trial balance snapshots (one per org + date range)
- **tb_lines** - Trial balance line items (account balances)
- **rules** - Validation rules for TB exceptions
- **exceptions** - Exceptions generated from rule evaluation

**Schema Isolation:** This project uses the same Supabase database as `month-end-dashboard` and `month-end-dashboard-2` but all tables are in the `med3` schema, ensuring no conflicts between projects.

## Development

- `npm run dev` - Start dev server on port 3015
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npx prisma migrate dev` - Create and apply migrations
- `npx prisma studio` - Open Prisma Studio to view/edit data

## Auth & RBAC

- Auth routes: `/auth/login` and `/auth/signup` (Supabase email/password). `/auth` redirects to `/auth/login`.
- Roles: `admin`, `user`. Default new users get `user` + allowed screens `home`, `checklist`, `calendar`.
- Admins see all screens and the Admin page (`/admin/users`) to manage users, roles, activity status, and allowed screens.
- Screen access is enforced server-side; unauthorized users are redirected to `/access-denied`.
- Set `ADMIN_EMAIL` in env to auto-promote the first matching login to admin (allowed screens set to all).
- Logout endpoint: `POST /api/auth/logout`.

### Smoke checks
- User (role=user) can log in, sees only Home/Checklist/Calendar in nav.
- User blocked from `/rules` or `/admin/users` (redirects to access denied).
- Admin can access `/rules` and `/admin/users`.
- User sees only exceptions with `owner_user_id = current user`; admin sees all.

## Authentication

The app uses Supabase for authentication. Protected routes (`/org`, `/close`, and other app pages) require authentication and will redirect to `/auth/login` if the user is not logged in.

## License

Private project
