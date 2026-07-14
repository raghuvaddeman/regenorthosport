// app/login/[[...rest]]/page.tsx
// Clerk's hosted sign-in UI, themed to match the portal.
//
// IMPORTANT: delete the old app/login/page.tsx — a static page and this
// optional catch-all cannot coexist on the same route (Next.js will
// throw a route conflict at build time). Clerk needs the catch-all to
// render its multi-step flows (password, 2FA, SSO callback) under /login.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default async function LoginPage() {
  // A signed-in user landing here (stale tab, bookmarked link, back button)
  // should go straight to the dashboard rather than see the sign-in form again.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50 px-4 dark:bg-zinc-800">
      <div className="flex flex-col items-center">
        {/* Brand mark above Clerk's card */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="RegenOrthoSport" width={1676} height={220} priority className="h-12 w-auto" />
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Sign in to GoTele AI
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Your AI voice agent workspace
            </p>
          </div>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorPrimary: "#b41f24", // brand-600 — matches the RegenOrthoSport red used across the dashboard
              borderRadius: "0.5rem",
            },
            options: {
              // Clerk's own Dashboard-configured logo, rendered inside the card — was
              // rendering at its default (tiny) size, so it's explicitly re-sized below.
              logoImageUrl: "/logo.png",
              logoPlacement: "inside",
            },
            elements: {
              card: "shadow-sm border border-zinc-200 dark:border-zinc-600",
              headerTitle: "hidden", // brand block above replaces it
              headerSubtitle: "hidden",
              logoBox: "mb-2",
              logoImage: "h-10 w-auto",
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
