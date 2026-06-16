const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;
const dataDir = isVercel ? '/tmp' : path.join(__dirname, '../../data');
const dbFile = path.join(dataDir, 'skycast-local-db.json');

const emptyDb = () => ({
  users: [],
  savedLocations: [],
  mapMarkers: [],
});

function ensureDbFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify(emptyDb(), null, 2));
  }
}

function readDb() {
  ensureDbFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    return { ...emptyDb(), ...parsed };
  } catch {
    const backup = `${dbFile}.broken-${Date.now()}`;
    if (fs.existsSync(dbFile)) fs.copyFileSync(dbFile, backup);
    const db = emptyDb();
    writeDb(db);
    return db;
  }
}

function writeDb(db) {
  ensureDbFile();
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getByPath(obj, pathName) {
  return String(pathName)
    .split('.')
    .reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}

function setByPath(obj, pathName, value) {
  const parts = String(pathName).split('.');
  let cur = obj;
  while (parts.length > 1) {
    const p = parts.shift();
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[0]] = value;
}

function normalizeComparable(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? v : t;
  }
  return v;
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = getByPath(doc, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      if ('$gt' in expected) return normalizeComparable(actual) > normalizeComparable(expected.$gt);
      if ('$gte' in expected) return normalizeComparable(actual) >= normalizeComparable(expected.$gte);
      if ('$lt' in expected) return normalizeComparable(actual) < normalizeComparable(expected.$lt);
      if ('$lte' in expected) return normalizeComparable(actual) <= normalizeComparable(expected.$lte);
      if ('$ne' in expected) return actual !== expected.$ne;
    }
    return String(actual) === String(expected);
  });
}

function sortItems(items, sortSpec) {
  if (!sortSpec || typeof sortSpec !== 'object') return items;
  const [[key, dir]] = Object.entries(sortSpec);
  return [...items].sort((a, b) => {
    const av = normalizeComparable(getByPath(a, key));
    const bv = normalizeComparable(getByPath(b, key));
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}

function applySelect(doc, selectSpec) {
  const out = clone(doc);
  if (!out || !selectSpec) return out;
  if (typeof selectSpec === 'string') {
    selectSpec.split(/\s+/).forEach((field) => {
      if (field.startsWith('-')) delete out[field.slice(1)];
    });
  }
  return out;
}

function query(value) {
  let current = value;
  let selectSpec = null;
  let sortSpec = null;
  const api = {
    sort(spec) {
      sortSpec = spec;
      return api;
    },
    select(spec) {
      selectSpec = spec;
      return api;
    },
    async lean() {
      return api.exec();
    },
    async exec() {
      let resolved = await current;
      if (Array.isArray(resolved) && sortSpec) resolved = sortItems(resolved, sortSpec);
      const out = Array.isArray(resolved)
        ? resolved.map((item) => applySelect(item, selectSpec))
        : applySelect(resolved, selectSpec);
      return out;
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

function collectionKey(name) {
  if (name === 'User') return 'users';
  if (name === 'SavedLocation') return 'savedLocations';
  if (name === 'MapMarker') return 'mapMarkers';
  throw new Error(`Unknown local collection: ${name}`);
}

function find(collectionName, filter = {}) {
  const db = readDb();
  const key = collectionKey(collectionName);
  return query(db[key].filter((doc) => matches(doc, filter)));
}

function findOne(collectionName, filter = {}) {
  const db = readDb();
  const key = collectionKey(collectionName);
  return query(db[key].find((doc) => matches(doc, filter)) || null);
}

function findById(collectionName, id) {
  return findOne(collectionName, { _id: id });
}

function insert(collectionName, doc) {
  const db = readDb();
  const key = collectionKey(collectionName);
  const now = new Date().toISOString();
  const saved = {
    _id: doc._id || generateId(),
    ...clone(doc),
  };
  if (!saved.createdAt) saved.createdAt = now;
  db[key].push(saved);
  writeDb(db);
  return clone(saved);
}

function updateById(collectionName, id, update = {}) {
  const db = readDb();
  const key = collectionKey(collectionName);
  const index = db[key].findIndex((doc) => String(doc._id) === String(id));
  if (index < 0) return null;
  const doc = db[key][index];
  if (update.$set) {
    Object.entries(update.$set).forEach(([k, v]) => setByPath(doc, k, v));
  } else {
    Object.assign(doc, update);
  }
  db[key][index] = doc;
  writeDb(db);
  return clone(doc);
}

function saveDocument(collectionName, doc) {
  const db = readDb();
  const key = collectionKey(collectionName);
  const now = new Date().toISOString();
  const saved = clone(doc);
  if (!saved._id) saved._id = generateId();
  if (!saved.createdAt) saved.createdAt = now;
  const index = db[key].findIndex((item) => String(item._id) === String(saved._id));
  if (index >= 0) db[key][index] = saved;
  else db[key].push(saved);
  writeDb(db);
  return clone(saved);
}

function deleteOne(collectionName, filter = {}) {
  const db = readDb();
  const key = collectionKey(collectionName);
  const before = db[key].length;
  const index = db[key].findIndex((doc) => matches(doc, filter));
  if (index >= 0) db[key].splice(index, 1);
  writeDb(db);
  return { acknowledged: true, deletedCount: before - db[key].length };
}

function deleteMany(collectionName, filter = {}) {
  const db = readDb();
  const key = collectionKey(collectionName);
  const before = db[key].length;
  db[key] = db[key].filter((doc) => !matches(doc, filter));
  writeDb(db);
  return { acknowledged: true, deletedCount: before - db[key].length };
}

function countDocuments(collectionName, filter = {}) {
  const db = readDb();
  const key = collectionKey(collectionName);
  return db[key].filter((doc) => matches(doc, filter)).length;
}

function getFilePath() {
  ensureDbFile();
  return dbFile;
}

module.exports = {
  getFilePath,
  generateId,
  query,
  find,
  findOne,
  findById,
  insert,
  updateById,
  saveDocument,
  deleteOne,
  deleteMany,
  countDocuments,
  clone,
};
