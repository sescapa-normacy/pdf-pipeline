import type { Knex } from 'knex';

// DATABASE_URL must be set before running migrations.
// Local:      postgres://localhost:5432/normacy_dev
// Cloud SQL:  postgresql://USER:PASSWORD@/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
const connection = process.env.DATABASE_URL;

if (!connection) {
  throw new Error('DATABASE_URL env var is required to run migrations');
}

const config: Knex.Config = {
  client: 'pg',
  connection,
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
};

export default config;
