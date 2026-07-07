// scripts/ops-agent.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  const envSrc = fs.readFileSync(envPath, 'utf-8');
  envSrc.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.length > 0 && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const { CLERK_SECRET_KEY, AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;
const args = process.argv.slice(2);
const command = args[0];

async function run() {
  if (command === 'status') {
    console.log('Checking system variables...');
    console.log(CLERK_SECRET_KEY ? '✔ Clerk Secret Key loaded' : '❌ Missing Clerk Secret Key');
    console.log(AIRTABLE_API_KEY ? '✔ Airtable Token loaded' : '❌ Missing Airtable Token');
    console.log(AIRTABLE_BASE_ID ? `✔ Base ID: ${AIRTABLE_BASE_ID}` : '❌ Missing Base ID');
    
    try {
      const clerkRes = await fetch('https://api.clerk.com/v1/users', {
        headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` }
      });
      if (clerkRes.ok) {
        const users = await clerkRes.json();
        console.log(`✔ Clerk API Responsive. Connected users count: ${users.length}`);
      } else { console.log('❌ Clerk authorization failed.'); }
    } catch (e) { console.log('❌ Clerk Connection error:', e.message); }

    try {
      const airtableRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?maxRecords=1`, {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
      });
      if (airtableRes.ok) {
        console.log('✔ Airtable API Responsive. Connected to table.');
      } else { console.log('❌ Airtable connection or config failed.'); }
    } catch (e) { console.log('❌ Airtable connection error:', e.message); }
  } 
  
  else if (command === 'audit') {
    console.log('🔍 Executing Live Cross-System Identity Audit...\n');
    try {
      const clerkRes = await fetch('https://api.clerk.com/v1/users', {
        headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` }
      });
      const users = await clerkRes.json();
      
      console.log('--- User Tenant Claims (Clerk Metadata) ---');
      users.forEach(u => {
        const email = u.email_addresses?.[0]?.email_address || 'Unknown';
        const claim = u.public_metadata?.clientId || '❌ NO TENANT CLAIM REGISTERED';
        console.log(`* ${email} ➔ ${claim}`);
      });
    } catch (e) { console.log('Audit run failed:', e.message); }
  }

  else if (command === 'provision') {
    const targetEmail = args[1];
    const targetClient = args[2];
    if (!targetEmail || !targetClient) {
      console.log('Usage: node scripts/ops-agent.mjs provision <email> <CLIENT_ID>');
      return;
    }
    try {
      const clerkRes = await fetch('https://api.clerk.com/v1/users', {
        headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` }
      });
      const users = await clerkRes.json();
      const targetUser = users.find(u => u.email_addresses?.some(e => e.email_address === targetEmail));
      
      if (!targetUser) {
        console.log(`❌ User email ${targetEmail} not found inside your Clerk directory.`);
        return;
      }
      
      const updateRes = await fetch(`https://api.clerk.com/v1/users/${targetUser.id}/metadata`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ public_metadata: { clientId: targetClient } })
      });
      
      if (updateRes.ok) {
        console.log(`✔ Successfully mapped ${targetEmail} ➔ ${targetClient}`);
      } else { console.log('❌ Metadata write failed.'); }
    } catch (e) { console.log('Error provisioning:', e.message); }
  }
  
  else {
    console.log('Available commands: status, audit, provision <email> <CLIENT_ID>');
  }
}

run();