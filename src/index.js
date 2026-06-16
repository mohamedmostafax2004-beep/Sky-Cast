const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const { connectDB, getDbStatus } = require('./db');
const User = require('./models/User');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const { requireAuthPage } = require('./middleware/auth');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'production' ? 5 : 1000,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});



async function persistUser(user, fields = {}) {
  Object.assign(user, fields);
  if (typeof user.save === 'function') {
    return user.save();
  }
  const id = user._id || user.id;
  if (!id) throw new Error('Cannot update user without an ID.');
  return User.findByIdAndUpdate(id, fields);
}

function saveSessionAndRedirect(req, res, url) {
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.redirect(url);
    }
    res.redirect(url);
  });
}

async function findUserForLogin(loginId) {
  const value = String(loginId || '').trim();
  if (!value) return null;
  if (typeof User.findByLoginId === 'function') {
    return User.findByLoginId(value);
  }
  let user = await User.findOne({ username: value });
  if (!user && value.includes('@')) {
    user = await User.findOne({ email: value.toLowerCase() });
  }
  return user;
}


app.use(
  session({
    name: 'skycast.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: config.nodeEnv === 'production',
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

app.use((req, res, next) => {
  res.locals.dbConnected = getDbStatus().connected;
  res.locals.user = req.session.username || null;
  res.locals.userId = req.session.userId || null;
  next();
});

app.get('/api/session', async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.json({ authenticated: false, user: null, dbConnected: getDbStatus().connected });
    }
    const user = await User.findById(req.session.userId).select('-password -verificationTokenHash -resetPasswordTokenHash').lean();
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ authenticated: false, user: null, dbConnected: getDbStatus().connected });
    }
    if (!req.session.username || req.session.username !== user.username) {
      req.session.username = user.username;
    }
    return res.json({
      authenticated: true,
      user: {
        id: String(user._id || user.id || req.session.userId),
        username: user.username,
        email: user.email || '',
      },
      dbConnected: getDbStatus().connected,
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.json({ authenticated: false, user: null, dbConnected: getDbStatus().connected });
  }
});

app.get('/', (req, res) => {
  res.render('home', {
    user: req.session.username || null,
    userId: req.session.userId || null,
    dbConnected: getDbStatus().connected,
    jawgAccessToken: config.jawgAccessToken || '',
  });
});

app.get('/profile', requireAuthPage, (req, res) => {
  res.render('profile', {
    user: req.session.username,
    resent: req.query.resent === '1',
  });
});

app.get('/dashboard', requireAuthPage, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password -verificationTokenHash -resetPasswordTokenHash').lean();
    if (!user) {
      req.session.destroy(() => {});
      return res.redirect('/login');
    }
    res.render('user-dashboard', {
      user: user.username || req.session.username,
      email: user.email || '',
      created: req.query.created === '1',
      dbConnected: getDbStatus().connected,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('user-dashboard', {
      user: req.session.username,
      email: '',
      created: req.query.created === '1',
      dbConnected: getDbStatus().connected,
    });
  }
});

app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', {
    dbConnected: getDbStatus().connected,
    reset: req.query.reset === 'success',
  });
});

app.post('/login', authLimiter, async (req, res) => {
  if (!getDbStatus().connected) {
    return res.render('login', {
      error: 'Database is offline. Restart the server and wait for the database to connect.',
      username: req.body.username || '',
      dbConnected: false,
    });
  }
  try {
    const { username, password } = req.body;
    const loginId = String(username || '').trim();
    if (!loginId || !password) {
      return res.render('login', { error: 'Username or email and password are required.', username: loginId, dbConnected: true });
    }

    // Accept either username or email in the same login field.
    const user = await findUserForLogin(loginId);

    if (!user || typeof user.comparePassword !== 'function' || !(await user.comparePassword(password))) {
      return res.render('login', { error: 'Invalid username/email or password.', username: loginId, dbConnected: true });
    }
    if (config.requireEmailVerification && !user.emailVerified) {
      return res.render('login', {
        error: 'Please verify your email before signing in. Check your inbox or server console (dev mode).',
        username,
        dbConnected: true,
      });
    }
    await persistUser(user, { lastLogin: new Date() });
    req.session.userId = String(user._id || user.id);
    req.session.username = user.username;
    saveSessionAndRedirect(req, res, '/');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred during login.', username: req.body.username || '', dbConnected: getDbStatus().connected });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('signup', { dbConnected: getDbStatus().connected });
});

app.post('/signup', authLimiter, async (req, res) => {
  if (!getDbStatus().connected) {
    return res.render('signup', {
      error: 'Database is offline. Restart the server and wait for the database to connect.',
      username: req.body.username || '',
      email: req.body.email || '',
      dbConnected: false,
    });
  }
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const { password, confirmPassword } = req.body;
    if (!username || !password || !confirmPassword || !email) {
      return res.render('signup', { error: 'Username, email, and password are required.', username: username || '', email: email || '', dbConnected: true });
    }
    if (password !== confirmPassword) {
      return res.render('signup', { error: 'Passwords do not match.', username, email, dbConnected: true });
    }
    if (password.length < 6) {
      return res.render('signup', { error: 'Password must be at least 6 characters.', username, email, dbConnected: true });
    }
    if (await User.findOne({ username })) {
      return res.render('signup', { error: 'Username already taken.', username, email, dbConnected: true });
    }
    if (await User.findOne({ email })) {
      return res.render('signup', { error: 'Email already registered.', username, email, dbConnected: true });
    }
    const newUser = new User({
      username,
      password,
      email,
      emailVerified: !config.requireEmailVerification,
    });
    await newUser.save();
    req.session.userId = String(newUser._id || newUser.id);
    req.session.username = newUser.username;

    if (config.requireEmailVerification) {
      await authRoutes.attachVerificationToken(newUser);
      return res.render('verify-result', {
        success: true,
        message: config.smtpHost
          ? 'Account created! Check your email to verify your address.'
          : 'Account created! Verification link printed in the server console (dev mode).',
      });
    }

    saveSessionAndRedirect(req, res, '/?created=1');
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === 11000) {
      return res.render('signup', { error: 'Username or email already taken.', username: req.body.username || '', email: req.body.email || '', dbConnected: true });
    }
    res.render('signup', { error: 'Signup failed. Please try again.', username: req.body.username || '', email: req.body.email || '', dbConnected: true });
  }
});

app.use(authRoutes);
app.use('/api', apiRoutes);

module.exports = app;

if (require.main === module) {
  (async () => {
    await connectDB();
    app.listen(config.port, () => {
      const db = getDbStatus();
      console.log(`🌤️  SkyCast v2 running at http://localhost:${config.port}`);
      console.log(`   Health: http://localhost:${config.port}/api/health`);
      console.log(`   Database: ${db.connected ? `connected (${db.mode || 'remote'})` : 'offline'}`);
      if (!config.mongoUri) console.log('   ⚠️  Set MONGODB_URI in .env');
      if (!config.openaiApiKey) console.log('   ℹ️  Set OPENAI_API_KEY for AI assistant (rules fallback active)');
      if (!config.smtpHost) console.log('   ℹ️  Set SMTP_* for email — links print to console in dev');
    });
  })();
} else {
  // Serverless execution context
  connectDB().catch((err) => {
    console.error('Database connection error in serverless environment:', err);
  });
}
