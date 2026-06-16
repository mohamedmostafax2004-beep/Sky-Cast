require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB, getDbStatus, shutdownDB } = require('../src/db');

async function main() {
  const ok = await connectDB(2);
  if (ok) {
    const s = getDbStatus();
    console.log('✅ Connected — database:', s.database, 'mode:', s.mode || 'remote');
    await shutdownDB();
    process.exit(0);
  }
  process.exit(1);
}

main();
