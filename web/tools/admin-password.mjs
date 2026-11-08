#!/usr/bin/env node
// Set (or change) the admin username + password.
// Usage (from the web folder):  npm run admin:password
//
// Only a salted scrypt hash is stored, in web/.admin-auth.json (git-ignored,
// never served, never deployed). Changing the password signs out every session.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.admin-auth.json');

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write('*'.repeat(s.length ? 1 : 0)); };
    }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

const user = (await ask('Admin username: ')).trim();
if (!/^[A-Za-z0-9._-]{3,32}$/.test(user)) { console.error('Username: 3–32 letters, numbers, . _ -'); process.exit(1); }
const pass = await ask('Admin password (min 12 characters): ', true);
if (pass.length < 12) { console.error('Password must be at least 12 characters.'); process.exit(1); }
const again = await ask('Repeat password: ', true);
if (again !== pass) { console.error('Passwords do not match.'); process.exit(1); }

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pass, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
fs.writeFileSync(FILE, JSON.stringify({ user, salt, hash, set: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
console.log(`Saved. Restart \`npm run dev\`, open /admin.html and sign in as "${user}".`);
