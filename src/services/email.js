const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtpHost) return null;
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();
  const payload = { from: config.mailFrom, to, subject, html, text: text || html.replace(/<[^>]+>/g, '') };

  if (!transport) {
    console.log('\n📧 [DEV EMAIL — SMTP not configured]');
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   ${text || html}\n`);
    return { devMode: true };
  }

  return transport.sendMail(payload);
}

async function sendVerificationEmail(user, rawToken) {
  const url = `${config.appUrl}/verify-email?token=${rawToken}`;
  return sendMail({
    to: user.email,
    subject: 'Verify your SkyCast account',
    html: `<p>Hi <strong>${user.username}</strong>,</p><p>Click to verify your email:</p><p><a href="${url}">${url}</a></p><p>Link expires in 24 hours.</p>`,
  });
}

async function sendPasswordResetEmail(user, rawToken) {
  const url = `${config.appUrl}/reset-password?token=${rawToken}`;
  return sendMail({
    to: user.email,
    subject: 'Reset your SkyCast password',
    html: `<p>Hi <strong>${user.username}</strong>,</p><p>Reset your password:</p><p><a href="${url}">${url}</a></p><p>If you did not request this, ignore this email. Expires in 1 hour.</p>`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendMail };
