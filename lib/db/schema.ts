import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * HemoSights — Drizzle schema (espelha o DDL do MP-000-foundation.md).
 *
 * Observacoes de fundacao:
 * - Auth delegada ao GoTrue do Control Tower (decisao do usuario). A tabela
 *   `users` mantem o perfil escopado por clinica e ganha `external_auth_id`
 *   (id do usuario no GoTrue) para ligar identidade externa <-> perfil local.
 * - RLS (extension pgcrypto + ENABLE + policies) fica em `db/sql/rls.sql`,
 *   aplicado apos `drizzle-kit migrate`. Mantido fora do schema para evitar
 *   instabilidade de geracao de policies no drizzle-kit e preservar o SQL
 *   exato do PRD (`current_setting('app.current_clinic_id')::uuid`).
 * - CHECK constraints via `text({ enum })` (gera `CHECK col IN (...)`).
 */

// =========================================================
// TENANTS / IDENTIDADE
// =========================================================
export const clinics = pgTable("clinics", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  cnpj: text("cnpj"),
  plan: text("plan", { enum: ["trial", "basic", "pro"] }).default("trial").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  active: boolean("active").default(true).notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    // Link com a identidade no GoTrue (Control Tower). Unico por identidade.
    externalAuthId: text("external_auth_id").unique(),
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    role: text("role", { enum: ["admin_clinica", "medico", "staff"] }).notNull(),
    crmNumber: text("crm_number"), // obrigatorio quando role = medico (validado em app)
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [index("idx_users_clinic").on(t.clinicId)],
);

// =========================================================
// PACIENTES E ANAMNESE
// =========================================================
export const patients = pgTable(
  "patients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    responsiblePhysicianId: uuid("responsible_physician_id").references(() => users.id),
    fullName: text("full_name").notNull(),
    birthDate: date("birth_date", { mode: "date" }),
    sex: text("sex", { enum: ["M", "F", "outro"] }),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_patients_clinic").on(t.clinicId)],
);

export const anamnesis = pgTable(
  "anamnesis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    symptoms: jsonb("symptoms").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    dietType: text("diet_type"), // onivoro | vegetariano | vegano | restritivo | outro
    medications: jsonb("medications").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    comorbidities: jsonb("comorbidities").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    lifestyle: jsonb("lifestyle").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    filledBy: uuid("filled_by").references(() => users.id),
    filledAt: timestamp("filled_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_anamnesis_patient").on(t.patientId)],
);

// =========================================================
// EXAMES (INGESTAO)
// =========================================================
export const labExams = pgTable(
  "lab_exams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    labName: text("lab_name"), // Fleury, DASA, Hermes Pardini, Sabin, outro
    collectedAt: date("collected_at", { mode: "date" }),
    rawPdfUrl: text("raw_pdf_url").notNull(), // referencia ao objeto no MinIO
    parseStatus: text("parse_status", {
      enum: ["pending", "parsed", "needs_review", "failed"],
    })
      .default("pending")
      .notNull(),
    parseConfidence: numeric("parse_confidence", { precision: 4, scale: 3 }),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_lab_exams_patient").on(t.patientId, t.collectedAt)],
);

// Catalogo global (nao tenant-scoped): referencia clinica compartilhada
export const biomarkerCatalog = pgTable("biomarker_catalog", {
  code: text("code").primaryKey(), // ex: 'hb', 'ht', 'vcm', 'rdw', 'leucocitos_total'
  name: text("name").notNull(),
  category: text("category", {
    enum: ["serie_vermelha", "serie_branca", "plaquetas"],
  }).notNull(),
  standardUnit: text("standard_unit").notNull(),
  description: text("description"),
});

export const examResults = pgTable(
  "exam_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    labExamId: uuid("lab_exam_id")
      .notNull()
      .references(() => labExams.id, { onDelete: "cascade" }),
    biomarkerCode: text("biomarker_code")
      .notNull()
      .references(() => biomarkerCatalog.code),
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    refMin: numeric("ref_min"),
    refMax: numeric("ref_max"),
    refSource: text("ref_source"),
    flag: text("flag", { enum: ["normal", "low", "high", "critical"] })
      .default("normal")
      .notNull(),
  },
  (t) => [
    index("idx_exam_results_lab_exam").on(t.labExamId),
    index("idx_exam_results_biomarker").on(t.biomarkerCode),
  ],
);

// Templates globais por laboratorio (nao tenant-scoped)
export const labParserTemplates = pgTable("lab_parser_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  labName: text("lab_name").notNull().unique(),
  templateJson: jsonb("template_json").$type<Record<string, unknown>>().notNull(),
  active: boolean("active").default(true).notNull(),
});

// =========================================================
// MOTOR DE REGRAS E INSIGHTS
// =========================================================
// Base de conhecimento clinico compartilhada (nao tenant-scoped)
export const clinicalRules = pgTable("clinical_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  conditionLogic: jsonb("condition_logic").$type<Record<string, unknown>>().notNull(),
  biomarkersInvolved: text("biomarkers_involved").array().notNull(),
  hypothesis: text("hypothesis").notNull(),
  confidenceLevel: text("confidence_level", {
    enum: ["alta", "media", "baixa"],
  }).notNull(),
  sourceReference: text("source_reference").notNull(),
  active: boolean("active").default(true).notNull(),
});

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    labExamId: uuid("lab_exam_id")
      .notNull()
      .references(() => labExams.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => clinicalRules.id),
    generatedText: text("generated_text").notNull(),
    severity: text("severity", { enum: ["info", "atencao", "critico"] }).notNull(),
    status: text("status", {
      enum: ["pending_review", "approved", "rejected", "edited_by_physician"],
    })
      .default("pending_review")
      .notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_insights_patient").on(t.patientId, t.status)],
);

// =========================================================
// SUGESTOES E PLANO DE TRATAMENTO
// =========================================================
export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    insightId: uuid("insight_id").references(() => insights.id),
    type: text("type", {
      enum: ["exame_complementar", "suplementacao", "dieta", "estilo_de_vida"],
    }).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    physicianId: uuid("physician_id").references(() => users.id),
    status: text("status", {
      enum: ["pending_review", "approved", "rejected", "edited_by_physician"],
    })
      .default("pending_review")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("idx_suggestions_patient").on(t.patientId, t.status)],
);

export const treatmentPlans = pgTable(
  "treatment_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    physicianId: uuid("physician_id")
      .notNull()
      .references(() => users.id),
    suggestionsIncluded: uuid("suggestions_included").array().default([]).notNull(),
    status: text("status", { enum: ["active", "completed", "cancelled"] })
      .default("active")
      .notNull(),
    activeFrom: date("active_from", { mode: "date" }).defaultNow().notNull(),
    activeUntil: date("active_until", { mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_treatment_plans_patient").on(t.patientId, t.status)],
);

// =========================================================
// ACOMPANHAMENTO / EVOLUCAO
// =========================================================
export const trackingEntries = pgTable(
  "tracking_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => treatmentPlans.id),
    metric: text("metric").notNull(), // biomarker_code ou metrica livre
    value: numeric("value"),
    valueText: text("value_text"),
    source: text("source", {
      enum: ["novo_hemograma", "self_report", "profissional"],
    }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_tracking_patient_metric").on(t.patientId, t.metric, t.recordedAt)],
);

// =========================================================
// NOTIFICACOES
// =========================================================
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id").references(() => patients.id),
    physicianId: uuid("physician_id").references(() => users.id),
    channel: text("channel", { enum: ["whatsapp", "email", "painel"] }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["queued", "sent", "failed"] })
      .default("queued")
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_notifications_clinic").on(t.clinicId, t.status)],
);
