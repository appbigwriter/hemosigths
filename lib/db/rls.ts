import { sql } from "drizzle-orm";

import { db, type Db } from "./index";

/**
 * Executa `fn` dentro de uma transacao com `app.current_clinic_id` setado como
 * LOCAL. Todas as tabelas tenant-scoped tem RLS (em db/sql/rls.sql) que filtra
 * por `current_setting('app.current_clinic_id')::uuid`, garantindo isolamento
 * multi-tenant mesmo se o codigo esquecer de filtrar por clinic_id.
 *
 * Usa `set_config(..., true)` (equivale a SET LOCAL) por ser compativel com
 * parametros — `SET ... = $1` nao aceita binding na maior parte dos clients.
 */
export async function withClinicContext<T>(
  clinicId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_clinic_id', ${clinicId}, true)`,
    );
    return fn(tx);
  });
}
