-- =========================================================
-- HemoSights — Extensao + Row-Level Security (multi-tenant)
-- Aplicar APOS `npm run db:migrate` (tabelas ja criadas).
--   psql "$DATABASE_URL" -f db/sql/rls.sql
--
-- Isolamento: toda tabela tenant-scoped so enxerga linhas cujo
-- clinic_id = current_setting('app.current_clinic_id')::uuid,
-- valor setado por request em lib/db/rls.ts (withClinicContext).
--
-- IMPORTANTE (ops): RLS nao se aplica ao DONO das tabelas. Para que ela
-- seja efetiva, o app deve se conectar com um role nao-dono (ver MP-001).
-- Em dev com superuser, a RLS e bypassada (nao bloqueia o desenvolvimento).
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid() em PG < 13

-- Habilita RLS nas tabelas tenant-scoped
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE anamnesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies (USING = leitura; WITH CHECK = escrita). Idempotente via DROP + CREATE.
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_patients ON patients;
CREATE POLICY tenant_isolation_patients ON patients
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_anamnesis ON anamnesis;
CREATE POLICY tenant_isolation_anamnesis ON anamnesis
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_lab_exams ON lab_exams;
CREATE POLICY tenant_isolation_lab_exams ON lab_exams
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_exam_results ON exam_results;
CREATE POLICY tenant_isolation_exam_results ON exam_results
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insights ON insights;
CREATE POLICY tenant_isolation_insights ON insights
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_suggestions ON suggestions;
CREATE POLICY tenant_isolation_suggestions ON suggestions
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_treatment_plans ON treatment_plans;
CREATE POLICY tenant_isolation_treatment_plans ON treatment_plans
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_tracking_entries ON tracking_entries;
CREATE POLICY tenant_isolation_tracking_entries ON tracking_entries
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid)
  WITH CHECK (clinic_id = current_setting('app.current_clinic_id')::uuid);
