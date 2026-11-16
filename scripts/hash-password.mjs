// Prints the SHA-256 hash of a password, for VITE_DEMO_PASSWORD_SHA256 in .env (local mode only).
// Usage: npm run hash-password -- "your password"
import { createHash } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Give the password in quotes, for example: npm run hash-password -- "your password"');
  process.exit(1);
}
console.log(createHash("sha256").update(password).digest("hex"));
