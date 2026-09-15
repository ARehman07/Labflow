/**
 * Make a platform admin entry for PLATFORM_ADMINS.
 *
 *   node scripts/platform-admin.mjs <username> <password>
 *
 * Prints `username:<value>`. Put it in PLATFORM_ADMINS (comma-separate several
 * admins) in the server environment — on Vercel, Project → Settings →
 * Environment Variables — and redeploy. The password itself is never stored.
 */
import bcrypt from 'bcryptjs';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: node scripts/platform-admin.mjs <username> <password>');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._-]{2,40}$/.test(username)) {
  console.error('Username: 2–40 letters, numbers, dots, dashes or underscores.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Use a password of at least 12 characters — this account can remove a lab.');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
console.log(`${username.toLowerCase()}:${Buffer.from(hash).toString('base64')}`);
