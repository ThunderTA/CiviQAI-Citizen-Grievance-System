/**
 * Create (or reset) the owner account on any database - the live one in
 * particular, where the seed script must NOT be used to make an admin.
 *
 *   MONGODB_URI='mongodb+srv://...' OWNER_EMAIL=you@example.com \
 *   OWNER_PASSWORD='a-long-password' node scripts/createOwner.mjs
 *
 * Credentials come only from the environment, so no password lands in shell
 * history files that get committed or in the repo. Remember the account only
 * has owner rights if the same address is listed in ADMIN_EMAILS on the API.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import { hashPassword } from '../middleware/auth.js';

dotenv.config();

const { OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME = 'Owner' } = process.env;

if (!process.env.MONGODB_URI || !OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('Set MONGODB_URI, OWNER_EMAIL and OWNER_PASSWORD (OWNER_NAME is optional).');
  process.exit(1);
}
if (OWNER_PASSWORD.length < 12) {
  console.error('Use a password of at least 12 characters for the owner account.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const email = OWNER_EMAIL.trim().toLowerCase();
const passwordHash = await hashPassword(OWNER_PASSWORD);

const existing = await User.findOne({ email });
if (existing) {
  existing.passwordHash = passwordHash;
  existing.passwordChangedAt = new Date();   // signs out any older session
  await existing.save();
  console.log(`Updated the password for ${email}.`);
} else {
  await User.create({ email, name: OWNER_NAME, passwordHash, role: 'citizen', aadhaarVerified: true });
  console.log(`Created ${email}.`);
}
console.log('Make sure ADMIN_EMAILS on the API includes this address, or it will not have owner rights.');
await mongoose.disconnect();
