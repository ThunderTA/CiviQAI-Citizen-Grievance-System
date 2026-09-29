import dotenv from 'dotenv';
import { sendStatusUpdateEmail } from './emailController.js';
dotenv.config();

/**
 * Dispatch an SMS notification to the citizen
 */
export const sendSMSNotification = async ({ to, message, issueTitle, status }) => {
  if (!to) return;
  const statusLabel = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' }[status] || status;
  const smsBody = message || `[CiviQAI Alert] Your complaint "${issueTitle}" has been updated to: ${statusLabel}. Check details on the portal.`;

  // If Twilio or SMS provider credentials exist in environment:
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      // Dynamic import to avoid crash if optional module isn't loaded
      const twilio = (await import('twilio')).default;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });
      console.log(`📱 SMS successfully sent to ${to}`);
      return;
    } catch (err) {
      console.error('Twilio SMS dispatch failed:', err.message);
    }
  }

  // Development simulation log
  console.log(`\n================== 📱 SMS SIMULATION ==================`);
  console.log(`To: ${to}`);
  console.log(`Content: ${smsBody}`);
  console.log(`=======================================================\n`);
};

/**
 * Dispatch a WhatsApp notification to the citizen
 */
export const sendWhatsAppNotification = async ({ to, message, issueTitle, status, note }) => {
  if (!to) return;
  const statusLabel = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' }[status] || status;
  const waBody = message || `🏛️ *CiviQAI Update*\n\nHello, your issue "*${issueTitle}*" status is now *${statusLabel}*.\n${note ? `📝 *Admin Note:* ${note}\n` : ''}\nTrack live on: ${process.env.CLIENT_URL || 'http://localhost:5173'}/my-issues`;

  // If WhatsApp API provider is configured
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER) {
    try {
      const twilio = (await import('twilio')).default;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      await client.messages.create({
        body: waBody,
        from: process.env.TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:')
          ? process.env.TWILIO_WHATSAPP_NUMBER
          : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: recipient,
      });
      console.log(`💬 WhatsApp message sent to ${to}`);
      return;
    } catch (err) {
      console.error('WhatsApp dispatch failed:', err.message);
    }
  }

  // Development simulation log
  console.log(`\n================ 💬 WHATSAPP SIMULATION ================`);
  console.log(`To: ${to}`);
  console.log(`Content:\n${waBody}`);
  console.log(`=======================================================\n`);
};

/**
 * Unified multi-channel dispatcher (Email + SMS + WhatsApp)
 */
export const dispatchMultiChannelNotification = async ({ issue, status, adminNote }) => {
  if (!issue) return;

  // 1. Email notification
  if (issue.submitterEmail) {
    sendStatusUpdateEmail({
      to: issue.submitterEmail,
      name: issue.submitterName,
      issueTitle: issue.title,
      status,
      adminNote,
    }).catch(err => console.error('Email error:', err.message));
  }

  // 2. SMS notification (if opted in and phone exists)
  if (issue.submitterPhone && issue.notifyViaSms) {
    sendSMSNotification({
      to: issue.submitterPhone,
      issueTitle: issue.title,
      status,
    }).catch(err => console.error('SMS error:', err.message));
  }

  // 3. WhatsApp notification (if opted in and phone exists)
  if (issue.submitterPhone && issue.notifyViaWhatsapp) {
    sendWhatsAppNotification({
      to: issue.submitterPhone,
      issueTitle: issue.title,
      status,
      note: adminNote,
    }).catch(err => console.error('WhatsApp error:', err.message));
  }
};
