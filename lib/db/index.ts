import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Pool unico do app. Em dev, aponta para o Postgres do docker-compose.
 * A conexao usa um role nao-dono das tabelas (configurado no MP-001) para que
 * a RLS seja efetivamente aplicada; o dono/role atual de dev bypassa a RLS.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });

export { schema };

export type Db = typeof db;
