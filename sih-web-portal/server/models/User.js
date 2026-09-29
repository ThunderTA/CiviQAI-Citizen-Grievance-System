import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  // Never the raw password. Selected out by default so a stray
  // `User.find()` in some other route cannot leak hashes to a client.
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },

  // 'admin' (the system owner) is granted by ADMIN_EMAILS at login and never
  // stored here, so an attacker who somehow writes to this collection cannot
  // mint one.
  //
  //   citizen    — files and tracks grievances
  //   official   — government official: views, verifies and advances status.
  //                Cannot edit or delete anything. Enforced server-side.
  //   dept_admin — official with a department queue of their own
  //   admin      — system owner
  role: {
    type: String,
    enum: ['citizen', 'official', 'dept_admin', 'admin'],
    default: 'citizen',
  },
  department: { type: String, default: null },
  // The state/UT the official is authorised to serve. This is deliberately
  // separate from an issue's free-form location: staff visibility is scoped
  // to the structured `Issue.state` field.
  region: { type: String, default: null },

  // Official accounts are provisioned by the owner, not self-registered, and
  // carry both the government body and region they act for.
  designation: { type: String, default: '' },
  employeeId: { type: String, default: '' },

  // ------------------------------------------------------------------
  // Aadhaar verification status.
  //
  // The number itself is NEVER stored — not raw, not hashed, not truncated.
  // These two fields are the complete record: that a verification succeeded,
  // and when. See services/aadhaar.js.
  // ------------------------------------------------------------------
  aadhaarVerified: { type: Boolean, default: false },
  aadhaarVerifiedAt: { type: Date, default: null },

  // ------------------------------------------------------------------
  // Password reset.
  //
  // Only a HASH of the reset token is kept, for the same reason the password
  // itself is hashed: a leaked database must not hand out working reset links.
  // Both fields are select:false so they cannot ride along on an unrelated
  // query, and both are cleared the moment the token is used.
  // ------------------------------------------------------------------
  passwordResetTokenHash: { type: String, default: null, select: false },
  passwordResetExpires: { type: Date, default: null, select: false },

  // When the password last changed. Any JWT issued before this instant is
  // refused, so resetting a password logs out whoever else was holding a
  // session — which is the whole point when the reset is a response to
  // compromise.
  passwordChangedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
