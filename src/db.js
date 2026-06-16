const dns = require('dns');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./config');

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

let isConnected = false;
let embeddedServer = null;
let activeUri = null;
let jsonFallbackActive = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUriCandidates() {
  const uris = [];
  const add = (uri) => {
    if (uri && typeof uri === 'string' && !uris.includes(uri)) uris.push(uri);
  };

  add(config.mongoUri);
  add(config.mongoUriStandard);
  add('mongodb://127.0.0.1:27017/skycast');

  return uris;
}

async function tryConnect(uri, timeoutMs = 8000) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    family: 4,
  });
  activeUri = uri;
  isConnected = true;
  return true;
}

async function startEmbeddedMongo() {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = require('mongodb-memory-server'));
  } catch {
    return null;
  }

  const dataDir = path.join(__dirname, '../data/mongo');
  fs.mkdirSync(dataDir, { recursive: true });

  if (embeddedServer) {
    return embeddedServer.getUri('skycast');
  }

  embeddedServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'skycast',
      dbPath: dataDir,
      storageEngine: 'wiredTiger',
    },
  });

  const uri = embeddedServer.getUri('skycast');
  console.log('📦 Using embedded local MongoDB (data/mongo) — sign up again if this is a fresh store.');
  return uri;
}

async function connectDB(maxRetries = 1) {
  jsonFallbackActive = false;
  const candidates = buildUriCandidates();

  for (const uri of candidates) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await tryConnect(uri, 8000);
        const label = uri.includes('127.0.0.1') ? 'local MongoDB' : 'MongoDB';
        console.log(`✅ ${label} connected`);
        if (uri.startsWith('mongodb+srv://')) {
          console.log('   (Atlas SRV — if login fails later, check Atlas IP allowlist)');
        }
        return true;
      } catch (err) {
        isConnected = false;
        const hostHint = uri.replace(/\/\/([^@]+@)?/, '//***@').slice(0, 80);
        console.error(`❌ MongoDB (${hostHint}…) attempt ${attempt}/${maxRetries}:`, err.message);
        if (attempt < maxRetries) await sleep(1500 * attempt);
      }
    }
  }

  if (config.allowEmbeddedMongo) {
    try {
      const embeddedUri = await startEmbeddedMongo();
      if (embeddedUri) {
        await tryConnect(embeddedUri, 20000);
        console.log('✅ Embedded MongoDB connected');
        return true;
      }
    } catch (err) {
      isConnected = false;
      console.error('❌ Embedded MongoDB failed:', err.message);
    }
  }

  mongoose.set('bufferCommands', false);

  // Final offline-safe fallback: use a small JSON database file for development/class demos.
  // This keeps auth, saved locations and markers working even when MongoDB is not installed
  // and mongodb-memory-server cannot download its binary.
  try {
    const jsonDb = require('./services/jsonDb');
    jsonFallbackActive = true;
    activeUri = `json://${jsonDb.getFilePath()}`;
    isConnected = true;
    console.warn('⚠️  MongoDB unavailable. Using local JSON database fallback.');
    console.warn(`   Data file: ${jsonDb.getFilePath()}`);
    return true;
  } catch (err) {
    jsonFallbackActive = false;
    isConnected = false;
    console.error('❌ Local JSON database fallback failed:', err.message);
  }

  console.error('❌ Database unavailable. Map & weather still work; auth needs a database.');
  console.error('   Use MongoDB, Atlas, embedded MongoDB, or the local JSON fallback.');
  return false;
}

function getDbStatus() {
  return {
    connected: jsonFallbackActive || (isConnected && mongoose.connection.readyState === 1),
    readyState: jsonFallbackActive ? 1 : mongoose.connection.readyState,
    database: jsonFallbackActive ? 'skycast-local-json' : (mongoose.connection.name || null),
    mode: jsonFallbackActive
      ? 'json'
      : embeddedServer
      ? 'embedded'
      : activeUri?.includes('127.0.0.1') && !embeddedServer
        ? 'local'
        : activeUri?.includes('mongodb.net')
          ? 'atlas'
          : null,
  };
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
});

mongoose.connection.on('connected', () => {
  isConnected = true;
});

function isJsonMode() {
  return jsonFallbackActive;
}

async function shutdownDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect().catch(() => {});
  }
  if (embeddedServer) {
    await embeddedServer.stop().catch(() => {});
    embeddedServer = null;
  }
  isConnected = false;
  jsonFallbackActive = false;
}

module.exports = { connectDB, getDbStatus, shutdownDB, mongoose, isJsonMode };

