import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define exactly what routes require authentication.
// /api/calls is deliberately excluded — like /api/agent-settings and /api/providers,
// it does its own dual auth inside the route handler (Clerk session for GET,
// x-internal-secret for the worker's POST). Clerk's auth.protect() runs before any
// route code and returns a bare 404 for unauthenticated requests regardless of what
// other auth headers they carry, which would silently block the worker's POST.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    '/((?!_next|[^?]*\\.(?:html|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
