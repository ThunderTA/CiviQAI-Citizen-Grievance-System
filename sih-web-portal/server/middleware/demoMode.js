/**
 * Public-demo guard.
 *
 * With DEMO_MODE=true the app runs as a shared, read-mostly showcase: visitors
 * sign in to a handful of guest accounts whose credentials are printed on the
 * login page. Anything that would let one visitor affect the next must be shut,
 * and the obvious one is the guest password itself - a single call to
 * /auth/change-password would lock every later visitor out. Registration,
 * profile edits and the password-reset flow are closed for the same reason (and
 * reset cannot work anyway without an email provider).
 *
 * Enforced here on the server; hiding the buttons in the UI is not a control.
 */
export const DEMO_MODE = process.env.DEMO_MODE === 'true';

export const blockInDemo = (req, res, next) => {
  if (!DEMO_MODE) return next();
  res.status(403).json({
    error: 'This is disabled in the public demo. Use one of the guest accounts shown on the sign-in page.',
    code: 'demo_mode',
  });
};
