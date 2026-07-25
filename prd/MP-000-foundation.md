# MP-000 — Fundação do Projeto: Hemograma Insights (nome provisório)

## Status
`FUNDACAO` | em_validacao

## Resumo do PRD
Plataforma SaaS multi-tenant que ingere hemogramas em PDF, extrai e normaliza os resultados, gera visualizações comparativas (histórico e por parâmetro), aplica um motor de regras clínicas para sinalizar padrões solucionáveis com suplementação/dieta, e — a partir da anamnese do paciente — sugere exames complementares, suplementação e dieta customizada. Toda sugestão passa por aprovação do médico responsável antes de virar plano ativo, com acompanhamento de evolução via gráficos e notificação ao profissional em achados críticos. Usuários: clínicas e profissionais de saúde (multi-tenant), cada um com seus pacientes isolados.

## Decisões de Arquitetura
- **Stack**: Next.js 14 (App Router) + TypeScript + Tailwind (padrão Sergio). Postgres como banco único multi-tenant com RLS (Row-Level Security) por `clinic_id` — não banco por tenant, dado o volume esperado (clínicas pequenas/médias) e para reduzir custo operacional de infra.
- **Padrão de arquitetura**: Monolito modular Next.js (API routes/Server Actions) + orquestração assíncrona via **n8n self-hosted** (já existente na infra do Sergio) para: pipeline de parsing de PDF, disparo de notificações, e jobs agendados de reprocessamento.
- **Isolamento multi-tenant**: RLS no Postgres com `clinic_id` setado via `current_setting('app.current_clinic_id')` em cada conexão de request (padrão já usado no Control Tower do Sergio).
- **Integrações externas obrigatórias**:
  - Parser/OCR de PDF (biblioteca local, sem serviço pago — ver Dependências)
  - n8n (self-hosted) para orquestração de pipeline e notificações
  - Hermes (agente WhatsApp já existente do Sergio) para notificações de achados críticos
  - Mailcow (SMTP já existente do Sergio) para notificações por e-mail
  - MinIO (já existente na infra) para armazenamento dos PDFs originais
- **Suposições assumidas (não confirmadas pelo usuário)**:
  1. Isolamento multi-tenant via RLS em banco único (não banco por cliente) — a confirmar.
  2. ORM: Drizzle ORM (TypeScript-first, migração leve, compatível com RLS manual) — a confirmar, alternativa seria Prisma.
  3. Parsing de PDF via biblioteca local (pdf-parse + fallback OCR com Tesseract.js) + templates por laboratório, sem depender de serviço pago de OCR — a confirmar se a qualidade for insuficiente pra letra digitalizada ruim.
  4. Autenticação: NextAuth (Auth.js) com roles (admin_clinica, medico, staff) — a confirmar, alternativa seria reusar GoTrue do Control Tower.
  5. Motor de regras clínicas roda como camada TypeScript determinística dentro do monolito (não como microserviço separado) na v1 — pode ser extraído depois se crescer.
  6. Projeto tratado como **ferramenta de apoio informativo**, não SaMD registrado na ANVISA — toda sugestão fica em estado "pendente" até aprovação humana do médico. Isso é decisão de produto crítica e deve ser revalidada com o usuário antes do lançamento comercial.

## Schema de Banco de Dados

```sql
-- =========================================================
-- EXTENSÕES
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- =========================================================
-- TENANTS / IDENTIDADE
-- =========================================================
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT,
  plan TEXT NOT NULL DEFAULT 'trial', -- trial | basic | pro
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_clinica','medico','staff')),
  crm_number TEXT, -- obrigatório se role = medico
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_users_clinic ON users(clinic_id);

-- =========================================================
-- PACIENTES E ANAMNESE
-- =========================================================
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  responsible_physician_id UUID REFERENCES users(id),
  full_name TEXT NOT NULL,
  birth_date DATE,
  sex TEXT CHECK (sex IN ('M','F','outro')),
  contact_phone TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);

CREATE TABLE anamnesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  symptoms JSONB NOT NULL DEFAULT '[]',
  diet_type TEXT, -- onivoro | vegetariano | vegano | restritivo | outro
  medications JSONB NOT NULL DEFAULT '[]',
  comorbidities JSONB NOT NULL DEFAULT '[]',
  lifestyle JSONB NOT NULL DEFAULT '{}', -- sono, exercício, tabagismo, álcool etc.
  filled_by UUID REFERENCES users(id),
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anamnesis_patient ON anamnesis(patient_id);

-- =========================================================
-- EXAMES (INGESTÃO)
-- =========================================================
CREATE TABLE lab_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_name TEXT, -- Fleury, DASA, Hermes Pardini, Sabin, outro
  collected_at DATE,
  raw_pdf_url TEXT NOT NULL, -- referência ao objeto no MinIO
  parse_status TEXT NOT NULL DEFAULT 'pending', -- pending | parsed | needs_review | failed
  parse_confidence NUMERIC(4,3), -- 0.000 a 1.000
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lab_exams_patient ON lab_exams(patient_id, collected_at DESC);

CREATE TABLE biomarker_catalog (
  code TEXT PRIMARY KEY, -- ex: 'hb', 'ht', 'vcm', 'rdw', 'leucocitos_total'
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- serie_vermelha | serie_branca | plaquetas
  standard_unit TEXT NOT NULL,
  description TEXT
);
-- Tabela global, não tenant-scoped (referência clínica compartilhada)

CREATE TABLE exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  lab_exam_id UUID NOT NULL REFERENCES lab_exams(id) ON DELETE CASCADE,
  biomarker_code TEXT NOT NULL REFERENCES biomarker_catalog(code),
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  ref_min NUMERIC,
  ref_max NUMERIC,
  ref_source TEXT, -- nome do laboratório que emitiu a referência
  flag TEXT NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal','low','high','critical'))
);
CREATE INDEX idx_exam_results_lab_exam ON exam_results(lab_exam_id);
CREATE INDEX idx_exam_results_biomarker ON exam_results(biomarker_code);

CREATE TABLE lab_parser_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_name TEXT NOT NULL UNIQUE,
  template_json JSONB NOT NULL, -- coordenadas/regex de extração por layout
  active BOOLEAN NOT NULL DEFAULT true
);
-- Tabela global, não tenant-scoped

-- =========================================================
-- MOTOR DE REGRAS E INSIGHTS
-- =========================================================
CREATE TABLE clinical_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_logic JSONB NOT NULL, -- ex: {"vcm":"<80","rdw":">14.5"}
  biomarkers_involved TEXT[] NOT NULL,
  hypothesis TEXT NOT NULL,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('alta','media','baixa')),
  source_reference TEXT NOT NULL, -- citação da literatura/algoritmo clínico
  active BOOLEAN NOT NULL DEFAULT true
);
-- Tabela global, não tenant-scoped (base de conhecimento clínico compartilhada)

CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_exam_id UUID NOT NULL REFERENCES lab_exams(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES clinical_rules(id),
  generated_text TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','atencao','critico')),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','edited_by_physician')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insights_patient ON insights(patient_id, status);

-- =========================================================
-- SUGESTÕES E PLANO DE TRATAMENTO
-- =========================================================
CREATE TABLE suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES insights(id),
  type TEXT NOT NULL CHECK (type IN ('exame_complementar','suplementacao','dieta','estilo_de_vida')),
  content JSONB NOT NULL, -- estrutura livre por tipo (ex: {"suplemento":"sulfato ferroso","dose_sugerida":"40mg/dia"})
  physician_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','edited_by_physician')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX idx_suggestions_patient ON suggestions(patient_id, status);

CREATE TABLE treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  physician_id UUID NOT NULL REFERENCES users(id),
  suggestions_included UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  active_from DATE NOT NULL DEFAULT CURRENT_DATE,
  active_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_treatment_plans_patient ON treatment_plans(patient_id, status);

-- =========================================================
-- ACOMPANHAMENTO / EVOLUÇÃO
-- =========================================================
CREATE TABLE tracking_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES treatment_plans(id),
  metric TEXT NOT NULL, -- biomarker_code ou métrica livre (ex: 'aderencia_suplemento')
  value NUMERIC,
  value_text TEXT,
  source TEXT NOT NULL CHECK (source IN ('novo_hemograma','self_report','profissional')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracking_patient_metric ON tracking_entries(patient_id, metric, recorded_at);

-- =========================================================
-- NOTIFICAÇÕES
-- =========================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id),
  physician_id UUID REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','painel')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_clinic ON notifications(clinic_id, status);

-- =========================================================
-- ROW-LEVEL SECURITY (padrão para todas as tabelas tenant-scoped)
-- =========================================================
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

-- Exemplo de policy (repetir por tabela, trocando o nome):
CREATE POLICY tenant_isolation_patients ON patients
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
```

| Tabela | Dono provável (mini PRD) | Depende de |
|---|---|---|
| clinics | MP-001 Auth & Multi-tenant | — |
| users | MP-001 Auth & Multi-tenant | clinics |
| patients | MP-002 Cadastro de Pacientes | clinics, users |
| anamnesis | MP-002 Cadastro de Pacientes | patients, clinics, users |
| lab_exams | MP-003 Ingestão de PDF | patients, clinics, users |
| biomarker_catalog | MP-003 Ingestão de PDF (seed inicial) | — |
| exam_results | MP-003 Ingestão de PDF | lab_exams, biomarker_catalog, clinics |
| lab_parser_templates | MP-003 Ingestão de PDF | — |
| clinical_rules | MP-004 Motor de Regras (seed inicial) | — |
| insights | MP-004 Motor de Regras | lab_exams, clinical_rules, patients, clinics |
| suggestions | MP-005 Motor de Sugestões | insights, patients, users, clinics |
| treatment_plans | MP-006 Plano de Tratamento | suggestions, patients, users, clinics |
| tracking_entries | MP-007 Acompanhamento/Evolução | treatment_plans, patients, clinics |
| notifications | MP-008 Notificações (WhatsApp/Email) | patients, users, clinics |
| dashboards/gráficos (sem tabela própria) | MP-009 Visualização | lê exam_results, tracking_entries |

## Estrutura Inicial de Arquivos

```
/app
  /(auth)/login                      # tela de login (NextAuth)
  /(dashboard)
    /pacientes                       # listagem e cadastro de pacientes
      /[patientId]
        /anamnese                    # formulário de anamnese
        /exames                      # upload + histórico de exames do paciente
        /insights                    # fila de insights pendentes/aprovados
        /plano                       # plano de tratamento ativo
        /evolucao                    # gráficos de evolução
    /revisao                         # fila de revisão do médico (insights + suggestions pendentes)
    /configuracoes                   # dados da clínica, usuários, planos
  /api
    /upload-exame                    # recebe PDF, dispara pipeline (n8n webhook)
    /webhooks/n8n                    # callback do n8n após parsing
    /webhooks/parse-review           # confirma revisão manual de parsing de baixa confiança

/lib
  /db                                # client Postgres + queries (Drizzle)
    /schema.ts                       # schema Drizzle espelhando o DDL acima
    /rls.ts                          # helper para setar current_clinic_id por request
  /parser                            # extração de PDF
    /templates                       # 1 arquivo por laboratório (Fleury, DASA, etc.)
    /ocr-fallback.ts                 # Tesseract.js pra PDFs sem template
  /rules-engine                      # motor de regras determinístico
  /suggestions-engine                # cruza insights + anamnese -> sugestões
  /notifications                     # integração Hermes (WhatsApp) e Mailcow (email)
  /charts                            # helpers de agregação de dados pra Recharts

/components
  /charts                            # RadarBiomarcadores, TendenciaTemporal, ComparativoBarras
  /forms                             # AnamneseForm, UploadExameForm
  /review                            # InsightReviewCard, SuggestionReviewCard

/db/migrations                       # migrações Drizzle geradas a partir do schema.ts

/n8n-workflows                       # export JSON dos workflows (versionado no repo)
  /pipeline-ingestao-pdf.json
  /notificacao-critico.json

.env.example
STATUS.md
MP-000-foundation.md
```

## Dependências

| Pacote/Serviço | Tipo | Custo | Alternativa free/open-source considerada |
|---|---|---|---|
| Next.js 14 + TypeScript | framework | grátis | — (padrão já definido) |
| Drizzle ORM | lib | grátis | Prisma (mais pesado, descartado) |
| pdf-parse | lib | grátis | pdfjs-dist (fallback se pdf-parse falhar em PDF de imagem) |
| Tesseract.js | lib (OCR) | grátis | Google Vision API (pago, descartado por custo) |
| Recharts | lib (gráficos) | grátis | D3 puro (mais trabalho, descartado pra v1) |
| NextAuth (Auth.js) | lib (auth) | grátis | GoTrue (reuso do Control Tower, avaliar na v2) |
| Zod | lib (validação) | grátis | — |
| n8n | serviço (já self-hosted) | grátis (infra própria) | — |
| MinIO | storage (já self-hosted) | grátis (infra própria) | S3 AWS (pago, descartado) |
| Mailcow (SMTP) | serviço (já self-hosted) | grátis (infra própria) | Resend/SendGrid (pago, só se Mailcow não escalar) |
| Hermes (agente WhatsApp) | serviço (já existente) | grátis (infra própria) | WhatsApp Business API oficial (pago, avaliar se Hermes não bastar) |
| Postgres | banco | grátis (infra própria) | — |

## Variáveis de Ambiente

| Nome | Propósito | Obrigatória? |
|---|---|---|
| `DATABASE_URL` | Conexão Postgres | Sim |
| `NEXTAUTH_SECRET` | Assinatura de sessão NextAuth | Sim |
| `NEXTAUTH_URL` | URL base da aplicação | Sim |
| `N8N_WEBHOOK_INGESTAO_URL` | Endpoint do workflow de ingestão de PDF no n8n | Sim |
| `N8N_WEBHOOK_SECRET` | Autenticação do callback n8n → app | Sim |
| `MINIO_ENDPOINT` | Endpoint do MinIO pra armazenar PDFs originais | Sim |
| `MINIO_ACCESS_KEY` | Credencial MinIO | Sim |
| `MINIO_SECRET_KEY` | Credencial MinIO | Sim |
| `MINIO_BUCKET_EXAMES` | Nome do bucket de PDFs | Sim |
| `MAILCOW_SMTP_HOST` | Envio de e-mail de notificação | Sim |
| `MAILCOW_SMTP_USER` | Credencial SMTP | Sim |
| `MAILCOW_SMTP_PASS` | Credencial SMTP | Sim |
| `HERMES_API_URL` | Endpoint do agente WhatsApp Hermes | Sim (se WhatsApp ativado) |
| `HERMES_API_KEY` | Credencial Hermes | Sim (se WhatsApp ativado) |
| `DEFAULT_CLINIC_TRIAL_DAYS` | Config de negócio (trial de clínica nova) | Não |

## Critérios de "Fundação Pronta"
- [ ] Schema revisado e sem tabelas órfãs
- [ ] Estrutura de pastas compila / roda "hello world"
- [ ] Todas as dependências instaláveis sem erro
- [ ] Usuário aprovou explicitamente este documento

## Riscos e Perguntas em Aberto
- **Regulatório**: confirmar que o produto vai operar estritamente como "apoio informativo" (toda sugestão passa por aprovação médica antes de virar ação), evitando enquadramento como SaMD ANVISA na v1. Se o plano de negócio mudar pra incluir recomendação autônoma sem revisão humana, essa fundação precisa ser revisada.
- **Qualidade de parsing**: hemogramas com layout não mapeado (sem template) vão cair no fallback de OCR genérico — taxa de erro nesse caminho ainda não medida; sugiro validar com uma amostra real de PDFs dos labs mais comuns dos seus clientes-piloto antes de prometer parsing automático 100%.
- **Auth**: decidir entre NextAuth isolado vs reuso do GoTrue do Control Tower — impacta como `users` se relaciona com identidade entre projetos do seu ecossistema.
- **Volume esperado de clínicas/pacientes**: não informado — importante pra validar se RLS em banco único aguenta a escala ou se algum tenant grande merece banco dedicado no futuro.
- **Biomarker catalog e clinical_rules**: quem vai popular e manter essa base de conhecimento clínico (curadoria própria vs baseado em literatura pública)? Isso é conteúdo, não só schema, e precisa de dono definido antes do MP-004.
