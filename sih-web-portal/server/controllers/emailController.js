import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendStatusUpdateEmail = async ({ to, name, issueTitle, status, adminNote }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  if (!to) return;

  const statusLabels = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' };
  const statusColors = { pending: '#f59e0b', 'in-progress': '#3b82f6', resolved: '#10b981' };

  try {
    await transporter.sendMail({
      from: `"CiviQAI" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Your issue "${issueTitle}" has been updated`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111; margin-bottom: 4px;">CiviQAI Update</h2>
          <p style="color: #555;">Hi ${name || 'Citizen'},</p>
          <p style="color: #555;">Your issue has been updated by the authorities.</p>

          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #111;">${issueTitle}</p>
            <p style="margin: 0;">
              Status:
              <span style="background: ${statusColors[status] || '#64748b'}20; color: ${statusColors[status] || '#64748b'}; padding: 2px 10px; border-radius: 99px; font-size: 13px; font-weight: 600;">
                ${statusLabels[status] || status}
              </span>
            </p>
            ${adminNote ? `<p style="margin: 12px 0 0; color: #555; font-size: 14px;"><strong>Note from admin:</strong> ${adminNote}</p>` : ''}
          </div>

          <p style="color: #999; font-size: 12px;">This is an automated message from CiviQAI.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
};

/**
 * Password reset link.
 *
 * Returns whether it was actually sent. The caller must NOT surface that to
 * the requester — telling someone "no email was sent" reveals that the address
 * is not registered.
 */
export const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresInMinutes }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
  if (!to) return false;

  try {
    await transporter.sendMail({
      from: `"CiviQAI" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Reset your CiviQAI password',
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111; margin-bottom: 4px;">Reset your password</h2>
          <p style="color: #555;">Hi ${name || 'there'},</p>
          <p style="color: #555;">
            We received a request to reset your CiviQAI password. Click the
            button below to choose a new one.
          </p>

          <p style="margin: 24px 0;">
            <a href="${resetUrl}"
               style="background: #4f46e5; color: #fff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
              Reset password
            </a>
          </p>

          <p style="color: #555; font-size: 14px;">
            This link expires in ${expiresInMinutes} minutes and can be used once.
          </p>
          <p style="color: #555; font-size: 14px;">
            If you did not request this, you can ignore this email — your
            password will not change.
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 24px; word-break: break-all;">
            If the button does not work, paste this into your browser:<br>${resetUrl}
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    // Logged without the address so a mail failure does not scatter user
    // emails through the logs.
    console.error('Password reset email failed to send:', err.message);
    return false;
  }
};
