require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_in_production',
  mongoUri: process.env.MONGODB_URI || '',
  mongoUriStandard: process.env.MONGODB_URI_STANDARD || '',
  allowEmbeddedMongo:
    process.env.USE_EMBEDDED_MONGO === 'true' ||
    (process.env.USE_EMBEDDED_MONGO !== 'false' &&
      (process.env.NODE_ENV || 'development') === 'development'),
  jawgAccessToken: process.env.JAWG_ACCESS_TOKEN || '',
  nominatimUserAgent: process.env.NOMINATIM_USER_AGENT || 'SkyCast-Map-App/2.0',
  weatherCacheTtlMs: 15 * 60 * 1000,
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 5001}`,
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || 'SkyCast <noreply@skycast.local>',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};
