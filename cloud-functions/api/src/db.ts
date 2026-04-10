import Knex from 'knex';

// Singleton — reused across warm Cloud Function invocations.
// In production DATABASE_URL should point to Cloud SQL via Unix socket:
//   postgresql://USER:PASSWORD@/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
let _db: ReturnType<typeof Knex> | null = null;

export function getDb(): ReturnType<typeof Knex> {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL env var is not set');

  _db = Knex({
    client: 'pg',
    connection: connectionString,
    pool: { min: 1, max: 5 },
  });

  return _db;
}
