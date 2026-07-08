// app/login/[[...rest]]/page.tsx
// Clerk's hosted sign-in UI, themed to match the portal.
//
// IMPORTANT: delete the old app/login/page.tsx — a static page and this
// optional catch-all cannot coexist on the same route (Next.js will
// throw a route conflict at build time). Clerk needs the catch-all to
// render its multi-step flows (password, 2FA, SSO callback) under /login.
//
// .env.local additions for these paths:
//   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
//   NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard

import { SignIn } from "@clerk/nextjs";
import { Headset } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50 px-4 dark:bg-zinc-900">
      <div className="flex flex-col items-center">
        {/* Brand mark above Clerk's card */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-600 text-white">
            <Headset className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Sign in to Callwise
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Your call analytics workspace
            </p>
          </div>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorPrimary: "#4f46e5", // indigo-600
              borderRadius: "0.5rem",
            },
            elements: {
              card: "shadow-sm border border-zinc-200 dark:border-zinc-700",
              headerTitle: "hidden", // brand block above replaces it
              headerSubtitle: "hidden",
              formButtonPrimary: "text-sm normal-case",
            },
          }}
        />

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Access is provisioned by your account manager.
        </p>
      </div>
    </div>
  );
}
