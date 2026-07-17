// app/signup/[[...rest]]/page.tsx
// Clerk's hosted sign-up UI — this is where an invitation link (__clerk_ticket)
// lands. Without this page the invite email 404s: Clerk redirects an accepted
// invitation to /signup, and until now this app only had /login.
//
// IMPORTANT: keep this as a catch-all ([[...rest]]) like /login — Clerk needs
// it to render its multi-step flows (password, verification) under /signup.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default async function SignUpPage() {
  // A signed-in user landing here (stale tab, reused invite link) should go
  // straight to the dashboard rather than see the sign-up form again.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50 px-4 dark:bg-zinc-800">
      <div className="flex flex-col items-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="RegenOrthoSport" width={1676} height={220} priority className="h-12 w-auto" />
          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Join GoTele AI
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Finish setting up your account
            </p>
          </div>
        </div>

        <SignUp
          appearance={{
            variables: {
              colorPrimary: "#b41f24",
              borderRadius: "0.5rem",
            },
            options: {
              logoPlacement: "none",
            },
            elements: {
              card: "shadow-sm border border-zinc-200 dark:border-zinc-600",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              formButtonPrimary: "text-sm normal-case",
            },
          }}
        />
      </div>
    </div>
  );
}
