const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { isJsonMode } = require('../db');
const jsonDb = require('../services/jsonDb');

const defaultPreferences = {
  units: 'metric',
  defaultLat: 31.2653,
  defaultLng: 32.3019,
  defaultZoom: 13,
  weatherAlerts: true,
  tempAlertHigh: 38,
  tempAlertLow: 5,
  precipAlertMm: 20,
};

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  emailVerified: { type: Boolean, default: false },
  verificationTokenHash: { type: String },
  verificationTokenExpiry: { type: Date },
  resetPasswordTokenHash: { type: String },
  resetPasswordExpiry: { type: Date },
  preferences: {
    units: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
    defaultLat: { type: Number, default: 31.2653 },
    defaultLng: { type: Number, default: 32.3019 },
    defaultZoom: { type: Number, default: 13 },
    weatherAlerts: { type: Boolean, default: true },
    tempAlertHigh: { type: Number, default: 38 },
    tempAlertLow: { type: Number, default: 5 },
    precipAlertMm: { type: Number, default: 20 },
  },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
});

userSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const MongoUser = mongoose.models.User || mongoose.model('User', userSchema);


function clonePlain(value) {
  if (!value) return value;
  return JSON.parse(JSON.stringify(value));
}

function applySelectPlain(doc, selectSpec) {
  const out = clonePlain(doc);
  if (!out || !selectSpec) return out;
  if (typeof selectSpec === 'string') {
    selectSpec.split(/\s+/).filter(Boolean).forEach((field) => {
      if (field.startsWith('-')) delete out[field.slice(1)];
    });
  }
  return out;
}

function makeUserQuery(loader) {
  let selectSpec = null;
  let leanMode = false;
  const api = {
    select(spec) {
      selectSpec = spec;
      return api;
    },
    lean() {
      leanMode = true;
      return api;
    },
    async exec() {
      const user = await loader();
      if (!user) return null;
      if (leanMode || selectSpec) return applySelectPlain(user, selectSpec);
      return user;
    },
    then(resolve, reject) {
      return api.exec().then(resolve, reject);
    },
    catch(reject) {
      return api.exec().catch(reject);
    },
  };
  return api;
}

class JsonUser {
  constructor(data = {}) {
    Object.assign(this, {
      username: '',
      password: '',
      email: '',
      emailVerified: false,
      preferences: { ...defaultPreferences },
      createdAt: new Date().toISOString(),
    }, data);
    if (this.email) this.email = String(this.email).toLowerCase().trim();
    this.preferences = { ...defaultPreferences, ...(this.preferences || {}) };
  }

  async save() {
    if (!this.username || this.username.length < 3) throw new Error('Username must be at least 3 characters');
    if (!this.email || !/^\S+@\S+\.\S+$/.test(this.email)) throw new Error('Please enter a valid email');
    if (!this.password || this.password.length < 6) throw new Error('Password must be at least 6 characters');

    const existingUsername = await JsonUser.findOne({ username: this.username });
    if (existingUsername && String(existingUsername._id) !== String(this._id || '')) {
      const err = new Error('Username already taken');
      err.code = 11000;
      throw err;
    }
    const existingEmail = await JsonUser.findOne({ email: this.email });
    if (existingEmail && String(existingEmail._id) !== String(this._id || '')) {
      const err = new Error('Email already registered');
      err.code = 11000;
      throw err;
    }

    if (!String(this.password).startsWith('$2a$') && !String(this.password).startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }

    const saved = jsonDb.saveDocument('User', this);
    Object.assign(this, saved);
    return this;
  }

  async comparePassword(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  static hydrate(doc) {
    return doc ? new JsonUser(doc) : null;
  }

  static findOne(filter = {}) {
    return makeUserQuery(async () => {
      const doc = await jsonDb.findOne('User', filter);
      return JsonUser.hydrate(doc);
    });
  }

  static findByLoginId(loginId) {
    return makeUserQuery(async () => {
      const value = String(loginId || '').trim();
      const valueLower = value.toLowerCase();
      const allUsers = await jsonDb.find('User', {}).lean();
      const doc = allUsers.find((u) => String(u.username || '') === value)
        || allUsers.find((u) => String(u.username || '').toLowerCase() === valueLower)
        || allUsers.find((u) => String(u.email || '').toLowerCase() === valueLower)
        || null;
      return JsonUser.hydrate(doc);
    });
  }

  static findById(id) {
    return makeUserQuery(async () => {
      const doc = await jsonDb.findById('User', id);
      return JsonUser.hydrate(doc);
    });
  }

  static findByIdAndUpdate(id, update = {}) {
    return makeUserQuery(async () => {
      const doc = await jsonDb.updateById('User', id, update);
      return JsonUser.hydrate(doc);
    });
  }
}

function User(data) {
  return isJsonMode() ? new JsonUser(data) : new MongoUser(data);
}

module.exports = new Proxy(User, {
  get(target, prop) {
    if (prop === 'JsonUser') return JsonUser;
    if (prop === 'MongoUser') return MongoUser;
    if (prop === 'findByLoginId') {
      if (isJsonMode()) return JsonUser.findByLoginId.bind(JsonUser);
      return async (loginId) => {
        const value = String(loginId || '').trim();
        if (!value) return null;
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return MongoUser.findOne({
          $or: [
            { username: value },
            { username: { $regex: `^${escaped}$`, $options: 'i' } },
            { email: value.toLowerCase() },
          ],
        });
      };
    }
    const source = isJsonMode() ? JsonUser : MongoUser;
    const value = source[prop];
    return typeof value === 'function' ? value.bind(source) : value;
  },
});
