import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;
function getTransport() {
  if (!config.mail.smtpUrl) return null;
  if (!transport) transport = nodemailer.createTransport(config.mail.smtpUrl);
  return transport;
}

/** Send an email. Without SMTP_URL the message is logged to the console. */
export async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {
    if (!config.isTest) {
      console.log(`\n[mail] (no SMTP configured) To: ${to}\nSubject: ${subject}\n${text}\n`);
    }
    return { logged: true };
  }
  await t.sendMail({ from: config.mail.from, to, subject, text });
  return { sent: true };
}
