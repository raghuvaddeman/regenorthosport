# Callwise Portal — drop-in bundle

Multi-tenant AI receptionist dashboard: Next.js (App Router) + Tailwind +
Clerk auth + Airtable data layer with server-side tenant isolation.

## 1. Install into your fresh project

From inside `~/callwise-portal` (created with create-next-app):

    npm install lucide-react @clerk/nextjs @clerk/backend

Upload callwise-portal-bundle.zip to Cloud Shell (drag onto the terminal),
then:

    cd ~/callwise-portal
    unzip -o ~/callwise-portal-bundle.zip -d .

`-o` overwrites the generated app/layout.tsx, app/globals.css and
app/page.tsx conflicts in our favor. If create-next-app made an
app/page.tsx you don't want at "/", either delete it or leave it —
it doesn't affect the portal routes.

## 2. Tailwind version check (30 seconds)

- If your project has NO tailwind.config.ts and globals.css started with
  `@import "tailwindcss"` → you're on v4 → the bundled globals.css works
  as-is. Done.
- If your project HAS tailwind.config.ts with a `content:` array → v3 →
  open app/globals.css, follow the "TAILWIND v3 ALTERNATIVE" comment
  block at the bottom (swap the top section for the v3 directives and
  add the fontFamily/darkMode config shown there).

## 3. Environment (.env.local in project root)

    AIRTABLE_TOKEN=pat_xxx                # scoped PAT: data.records:read, this base only
    AIRTABLE_BASE_ID=appPgNymFJg2otE6u
    AIRTABLE_CALLS_TABLE=tbl7x1gKAGFYZ1dBf
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
    CLERK_SECRET_KEY=sk_test_xxx
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard

One-time Clerk Dashboard step: Sessions → Customize session token →
    { "metadata": "{{user.public_metadata}}" }

## 4. Run

    npm run dev -- -p 3001

Open via Cloud Shell Web Preview on port 3001. If Clerk's widget is blank
or loops, add the preview URL under Clerk Dashboard → Developers → Domains.

## 5. Wire live data (2-minute edit)

app/(portal)/dashboard/page.tsx still renders MOCK_CALLS so you get pixels
before credentials. To switch to live Airtable data, follow the 3-step
comment block at the bottom of lib/use-calls.ts (import useCalls, replace
MOCK_CALLS references, delete the mock array).

## 6. Multi-tenant isolation verification

1. Clerk Dashboard → create two users (two emails you control).
2. Bind tenants:
       node scripts/assign-client.mjs you+sunrise@gmail.com CLIENT_SUNRISE_REALTY
       node scripts/assign-client.mjs you+dental@gmail.com  CLIENT_METRO_DENTAL
   (needs CLERK_SECRET_KEY exported in the shell, or run with
    `CLERK_SECRET_KEY=sk_test_xxx node scripts/...`)
3. Sign in as each user in two browser profiles:
   - Sunrise sees only the 3 Sunrise seed calls; Dental only its 3.
   - Signed in as Sunrise, open /api/calls directly: the JSON must
     contain zero Dental records. That's isolation at the API layer.

## File map

    app/layout.tsx                    root shell: fonts, dark mode, ClerkProvider
    app/globals.css                   Tailwind + theme variables (v4 + v3 notes)
    app/(portal)/layout.tsx           collapsible sidebar shell
    app/(portal)/dashboard/page.tsx   KPI ribbon, sortable table, slide-over
    app/login/[[...rest]]/page.tsx    Clerk sign-in, themed
    app/api/calls/route.ts            server-side Airtable fetch, tenant-filtered
    lib/use-calls.ts                  client fetch hook (+ wiring instructions)
    middleware.ts                     route protection (everything but /login)
    scripts/assign-client.mjs         bind a Clerk user to a CLIENT_ID
