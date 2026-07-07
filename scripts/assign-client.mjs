// scripts/assign-client.mjs
// Provisioning tool: binds a Clerk user to an Airtable tenant.
//
//   node scripts/assign-client.mjs owner@sunriserealty.com CLIENT_SUNRISE_REALTY
//
// Runs with your CLERK_SECRET_KEY (server credential) — this is exactly
// the write the end user can never perform on themself. The same edit
// can be done by hand in Clerk Dashboard → Users → (user) → Metadata →
// Public: { "clientId": "CLIENT_SUNRISE_REALTY" }.

import { createClerkClient } from "@clerk/backend";

const [, , email, clientId] = process.argv;

if (!email || !clientId) {
  console.error("Usage: node scripts/assign-client.mjs <email> <CLIENT_ID>");
  process.exit(1);
}
if (!/^CLIENT_[A-Z0-9_]+$/.test(clientId)) {
  console.error(
    `"${clientId}" doesn't match the CLIENT_UPPER_SNAKE pattern used in Airtable.`
  );
  process.exit(1);
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const { data: users } = await clerk.users.getUserList({
  emailAddress: [email],
});

if (users.length === 0) {
  console.error(`No Clerk user found for ${email}. Invite them first.`);
  process.exit(1);
}

const user = users[0];

await clerk.users.updateUserMetadata(user.id, {
  publicMetadata: { clientId },
});

console.log(`✔ ${email} → ${clientId}`);
console.log(
  "They'll carry the new tenant claim on their next sign-in (or immediately, via the API fallback in /api/calls)."
);
