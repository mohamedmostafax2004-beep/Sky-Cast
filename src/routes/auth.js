const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getDbStatus } = require('../db');
const { generateToken, hashToken } = require('../utils/tokens');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');
const config = require('../config');

const router = express.Router();

const mailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests. Try again later.',
});

async function persistUser(user, fields = {}) {
  Object.assign(user, fields);

  if (typeof user.save === 'function') {
    return user.save();
  }

  const id = user._id || user.id;
  if (!id) throw new Error('Cannot update user without an ID.');

  const update = { ...fields };
  if (update.password && !String(update.password).startsWith('$2a$') && !String(update.password).startsWith('$2b$')) {
    update.password = await bcrypt.hash(update.password, 10);
  }

  return User.findByIdAndUpdate(id, update);
}

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { dbConnected: getDbStatus().connected });
});

router.post('/forgot-password', mailLimiter, async (req, res) => {
  if (!getDbStatus().connected) {
    return res.render('forgot-password', { error: 'Database offline.', dbConnected: false });
  }
  const { email } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase().trim() });
  if (user) {
    const raw = generateToken();
    await persistUser(user, {
      resetPasswordTokenHash: hashToken(raw),
      resetPasswordExpiry: new Date(Date.now() + 60 * 60 * 1000),
    });
    await sendPasswordResetEmail(user, raw);
  }
  res.render('forgot-password', {
    success: 'If that email exists, a reset link was sent. Check your inbox (or server console in dev mode).',
    dbConnected: true,
  });
});

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/forgot-password');
  res.render('reset-password', { token, error: null });
});

router.post('/reset-password', async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  if (!token || password !== confirmPassword) {
    return res.render('reset-password', { token, error: 'Passwords do not match.' });
  }
  if (password.length < 6) {
    return res.render('reset-password', { token, error: 'Password must be at least 6 characters.' });
  }
  const user = await User.findOne({
    resetPasswordTokenHash: hashToken(token),
    resetPasswordExpiry: { $gt: new Date() },
  });
  if (!user) {
    return res.render('reset-password', { token: '', error: 'Invalid or expired reset link.' });
  }
  await persistUser(user, {
    password,
    resetPasswordTokenHash: undefined,
    resetPasswordExpiry: undefined,
  });
  res.redirect('/login?reset=success');
});

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.render('verify-result', { success: false, message: 'Missing token.' });
  const user = await User.findOne({
    verificationTokenHash: hashToken(token),
    verificationTokenExpiry: { $gt: new Date() },
  });
  if (!user) {
    return res.render('verify-result', { success: false, message: 'Invalid or expired verification link.' });
  }
  await persistUser(user, {
    emailVerified: true,
    verificationTokenHash: undefined,
    verificationTokenExpiry: undefined,
  });
  res.render('verify-result', { success: true, message: 'Email verified! You can sign in now.' });
});

router.post('/resend-verification', mailLimiter, async (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  const user = await User.findById(req.session.userId);
  if (!user || user.emailVerified) return res.redirect('/profile');
  const raw = generateToken();
  await persistUser(user, {
    verificationTokenHash: hashToken(raw),
    verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await sendVerificationEmail(user, raw);
  res.redirect('/profile?resent=1');
});

async function attachVerificationToken(user) {
  const raw = generateToken();
  await persistUser(user, {
    verificationTokenHash: hashToken(raw),
    verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await sendVerificationEmail(user, raw);
}

router.attachVerificationToken = attachVerificationToken;
module.exports = router;
