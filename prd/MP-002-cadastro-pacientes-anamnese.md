# MP-002 — Cadastro de Pacientes & Anamnese

## Status
pendente

## Depende de
MP-001 (Auth & Multi-tenant)

## Contexto completo (leia antes de começar)
"Hemograma Insights" é uma plataforma onde clínicas médicas cadastram pacientes, sobem os hemogramas deles em PDF, e o sistema gera análises. Este mini PRD cria o cadastro básico do paciente e o formulário de anamnese (histórico de sintomas, dieta, medicamentos, comorbidades, estilo de vida) — que depois vai ser cruzado com os resultados de exame por outro componente. Sem este mini PRD, não existe "dono" dos exames que serão enviados depois.

Sotaque técnico: Next.js 14 App Router, TypeScript, Tailwind, Drizzle ORM, Zod para validação de formulário. Toda tabela tocada aqui é tenant-scoped (tem `clinic_id` e RLS) — use SEMPRE `withClinicContext` (criado no MP-001) pra qualquer query, nunca acesse o banco direto sem passar por essa função.

## Objetivo
Permitir que staff/médico da clínica cadastre um paciente e preencha/edite a anamnese dele.

## Entradas
Do MP-001, você recebe:
- `withClinicContext(clinicId, fn)` — função pra rodar query com RLS ativo (importar de `lib/db/rls.ts`)
- Sessão do usuário via `auth()` do NextAuth, com formato exato:
  ```json
  {"user": {"id": "a1b2c3d4-...", "email": "dra.ana@clinicaexemplo.com.br", "clinicId": "f1e2d3c4-...", "role": "medico"}}
  ```

## Elementos necessários
- MP-001 já deve estar concluído e funcionando (login ativo, tabelas `clinics`/`users` existentes)
- Nenhuma dependência nova de pacote além das já instaladas no MP-001 (`drizzle-orm`, `zod`)

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts` as tabelas:
   ```sql
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

   CREATE TABLE anamnesis (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
     patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
     symptoms JSONB NOT NULL DEFAULT '[]',
     diet_type TEXT,
     medications JSONB NOT NULL DEFAULT '[]',
     comorbidities JSONB NOT NULL DEFAULT '[]',
     lifestyle JSONB NOT NULL DEFAULT '{}',
     filled_by UUID REFERENCES users(id),
     filled_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
2. Gerar e rodar migration (`drizzle-kit generate` + `migrate`), incluir RLS:
   ```sql
   ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_patients ON patients USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ALTER TABLE anamnesis ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_anamnesis ON anamnesis USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
3. Criar `app/api/patients/route.ts`:
   - `POST`: recebe `{ fullName: string, birthDate?: string (YYYY-MM-DD), sex?: 'M'|'F'|'outro', contactPhone?: string, contactEmail?: string, responsiblePhysicianId?: string }`. Validar com Zod (`fullName` obrigatório, mínimo 2 caracteres). Insere via `withClinicContext` usando `session.user.clinicId`. Retorna `201 { patientId: string }`.
   - `GET`: retorna lista de pacientes da clínica logada (via RLS automático), ordenado por `full_name` ascendente. Aceita query param `?search=` pra filtro por nome (case-insensitive, `ILIKE '%valor%'`).
4. Criar `app/api/patients/[patientId]/route.ts`:
   - `GET`: retorna dados do paciente + resumo. Se `patientId` não existir OU pertencer a outra clínica (RLS bloqueia automaticamente, retorna vazio), responder `404 { error: "paciente_nao_encontrado" }`.
5. Criar `app/api/patients/[patientId]/anamnesis/route.ts`:
   - `POST` (cria ou atualiza — usar `ON CONFLICT` por `patient_id` fazendo upsert, ou se preferir manter histórico, sempre criar novo registro e o mais recente é o vigente — **decisão: manter histórico, sempre INSERT, nunca UPDATE**, pois anamnese pode mudar ao longo do tempo e isso é dado clinicamente relevante). Payload:
     ```json
     {
       "symptoms": ["fadiga", "queda de cabelo"],
       "dietType": "vegetariano",
       "medications": ["losartana 50mg"],
       "comorbidities": ["hipotireoidismo"],
       "lifestyle": {"sono_horas": 6, "exercicio_semanal": 2, "tabagismo": false, "alcool": "social"}
     }
     ```
     Validar com Zod: `symptoms`, `medications`, `comorbidities` são arrays de string (podem ser vazios); `dietType` é string opcional; `lifestyle` é objeto livre.
   - `GET`: retorna a anamnese mais recente do paciente (`ORDER BY filled_at DESC LIMIT 1`).

## Saídas / Entregáveis
- `POST /api/patients` e `GET /api/patients` funcionais
- `GET /api/patients/[patientId]` funcional
- `POST /api/patients/[patientId]/anamnesis` e `GET /api/patients/[patientId]/anamnesis` funcionais
- Tela `app/(dashboard)/pacientes/page.tsx` (listagem + botão "novo paciente")
- Tela `app/(dashboard)/pacientes/[patientId]/anamnese/page.tsx` (formulário)

## Arquivos tocados
- `lib/db/schema.ts` (editar, adicionar tabelas)
- `lib/db/migrations/0002_patients_anamnesis.sql` (criar)
- `app/api/patients/route.ts` (criar)
- `app/api/patients/[patientId]/route.ts` (criar)
- `app/api/patients/[patientId]/anamnesis/route.ts` (criar)
- `app/(dashboard)/pacientes/page.tsx` (criar)
- `app/(dashboard)/pacientes/[patientId]/anamnese/page.tsx` (criar)
- `components/forms/anamnese-form.tsx` (criar)

## Tabelas de banco tocadas
- `patients` (dono deste mini PRD)
- `anamnesis` (dono deste mini PRD)

## Variáveis de ambiente necessárias
Nenhuma nova além das do MP-001.

## Contrato de Handoff
Mini PRDs seguintes (ingestão de exames, motor de sugestões) recebem:
- `patients.id` (UUID) como chave estrangeira pra vincular exames ao paciente certo
- Anamnese mais recente via `GET /api/patients/[patientId]/anamnesis`, exemplo real de resposta:
  ```json
  {
    "id": "9c8b7a6f-0000-4000-8000-000000000021",
    "patientId": "7d6e5f4c-0000-4000-8000-000000000015",
    "symptoms": ["fadiga", "queda de cabelo"],
    "dietType": "vegetariano",
    "medications": ["losartana 50mg"],
    "comorbidities": ["hipotireoidismo"],
    "lifestyle": {"sono_horas": 6, "exercicio_semanal": 2, "tabagismo": false, "alcool": "social"},
    "filledAt": "2026-07-20T14:32:00.000Z"
  }
  ```

## Critérios de Aceite (testáveis)
- [ ] `POST /api/patients` com `fullName` válido retorna `201` com `patientId` UUID
- [ ] `POST /api/patients` sem `fullName` retorna `400` com erro de validação
- [ ] `GET /api/patients` retorna só pacientes da clínica do usuário logado (testar com 2 clínicas, cada uma com pacientes próprios)
- [ ] `GET /api/patients/[patientId]` de um paciente de outra clínica retorna `404`
- [ ] `POST /api/patients/[patientId]/anamnesis` cria novo registro (não sobrescreve o anterior)
- [ ] `GET /api/patients/[patientId]/anamnesis` retorna sempre o mais recente

## Como testar e validar
1. Logar como usuário da Clínica A (criada no MP-001) e obter o cookie de sessão (via navegador ou salvando o cookie do `curl -c`)
2. Criar paciente:
   ```
   curl -X POST http://localhost:3000/api/patients -b cookies.txt -H "Content-Type: application/json" -d '{"fullName":"João Silva","birthDate":"1985-03-12","sex":"M"}'
   ```
   Esperado: `201 { "patientId": "<uuid>" }`
3. Listar pacientes: `curl http://localhost:3000/api/patients -b cookies.txt` — esperado: array contendo João Silva.
4. Logar como usuário da Clínica B e repetir o `GET /api/patients/<patientId de João>` — esperado: `404 { "error": "paciente_nao_encontrado" }`.
5. Enviar anamnese:
   ```
   curl -X POST http://localhost:3000/api/patients/<patientId>/anamnesis -b cookies.txt -H "Content-Type: application/json" -d '{"symptoms":["fadiga"],"dietType":"vegetariano","medications":[],"comorbidities":[],"lifestyle":{}}'
   ```
   Esperado: `201` com `id` da anamnese criada.
6. Repetir o passo 5 com sintomas diferentes, depois fazer `GET /api/patients/<patientId>/anamnesis` — esperado: retorna a ÚLTIMA anamnese enviada, não a primeira.
7. Caso de borda — payload vazio em `POST /api/patients`: `curl -X POST .../api/patients -d '{}'` — esperado: `400` com mensagem de validação Zod, sem crash do servidor (ver console: nenhum erro 500).

## Mocks necessários para testar isolado
Nenhum mock externo necessário — este componente só depende do MP-001 (auth/RLS), que deve estar realmente funcionando (não mockado) para testar RLS corretamente. Se o MP-001 ainda não estiver pronto, mocke `auth()` retornando uma sessão fixa:
```ts
{ user: { id: "mock-user", email: "mock@teste.com", clinicId: "00000000-0000-4000-8000-000000000001", role: "medico" } }
```
