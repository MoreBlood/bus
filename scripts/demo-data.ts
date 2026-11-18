// `npm run demo`: наполнить ЛОКАЛЬНУЮ базу вымышленными участниками и поездками — для разработки и скриншотов.
// Боевую базу (TURSO_DATABASE_URL) не трогает.
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql/node';
import { DEMO_COUNTS, seedDemo } from '../src/db/demo.ts';
import { connection, dbConfig } from '../src/db/index.ts';
import { migrateAll } from '../src/migrate.ts';

const { url, local } = connection();
if (!local) throw new Error(`Демо-данные только для локальной базы, а сейчас ${url}`);
await migrateAll();
const db = drizzle({ client: createClient({ url }), ...dbConfig });
if (await seedDemo(db)) console.log(`Демо: ${DEMO_COUNTS.members} участников, ${DEMO_COUNTS.trips} поездок → ${url}`);
else console.log('В базе уже есть участники — демо-данные не добавлены. Чистая база: rm -rf data/');
