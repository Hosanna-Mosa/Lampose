/* ══════════════════════════════════════════════════════════════════════════
   Turn the Lampose staff password into the hash FOOD_STAFF_PASSWORD_HASH holds.

     npm run staff-password:hash -- "the password"

   Prints a bcrypt hash and nothing else is touched — no database, no .env.
   Paste the line it prints into Backend/.env on each server (in single quotes:
   the hash is full of `$`) and restart. The password itself goes nowhere; keep
   it out of shell history on a shared machine.

   See src/modules/foodpartners/staffAccess.js for what the password opens.
   ══════════════════════════════════════════════════════════════════════════ */
const bcrypt = require('bcryptjs');

const MIN_LENGTH = 12;

const password = process.argv[2] || '';

if (!password) {
  console.error('\n  Usage: npm run staff-password:hash -- "the password"\n');
  process.exit(1);
}

if (password.length < MIN_LENGTH) {
  console.error(`\n  ⛔ Use at least ${MIN_LENGTH} characters — this one password opens every restaurant.\n`);
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

console.log('\n  Add this line to Backend/.env, then restart the server:\n');
console.log(`  FOOD_STAFF_PASSWORD_HASH='${hash}'\n`);
