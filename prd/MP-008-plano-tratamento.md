# MP-008 — Plano de Tratamento

## Status
pendente

## Depende de
MP-006 (Motor de Sugestões), MP-007 (Portal de Revisão do Médico)

## Contexto completo (leia antes de começar)
"Hemograma Insights" já permite, até este ponto, que o médico aprove sugestões individuais (exame complementar, suplementação, dieta) via portal de revisão. Este mini PRD agrupa as sugestões aprovadas de um paciente num "Plano de Tratamento" formal — um pacote com data de início, itens incluídos, e status (ativo/concluído/cancelado). É esse plano que o paciente vai ver e que o MP-009 (acompanhamento) vai usar como referência para medir evolução.

Sotaque técnico: Next.js 14 App Router, TypeScript, Tailwind, Drizzle.

## Objetivo
Permitir que o médico monte um plano de tratamento a partir das sugestões já aprovadas de um paciente, e visualize/gerencie planos ativos.

## Entradas
Do MP-006/MP-007: `suggestions` com `status = 'approved'`, vinculadas a um `patient_id`. Exemplo real:
```json
[
  { "id": "5e6f7a8b-...", "type": "suplementacao", "content": {"suplemento":"Sulfato ferroso","doseSugerida":"40mg elementar/dia"}, "status": "approved" },
  { "id": "6f7a8b9c-...", "type": "dieta", "content": {"foco":"aumentar ferro heme"}, "status": "approved" }
]
```

## Elementos necessários
Nenhuma dependência nova de pacote.

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts`:
   ```sql
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
   ```
2. Gerar/rodar migration + RLS:
   ```sql
   ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_treatment_plans ON treatment_plans USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
3. Criar `app/api/patients/[patientId]/treatment-plans/route.ts`:
   - `POST`: recebe `{ suggestionIds: string[], activeUntil?: string (YYYY-MM-DD) }`.
     1. Validar `role` do usuário (`medico` ou `admin_clinica` — mesma regra do MP-007; `staff` recebe `403`)
     2. Validar que todos os `suggestionIds` existem, pertencem ao `patientId` informado, e têm `status = 'approved'`. Se algum não atender, retornar `400 { error: "sugestao_invalida", suggestionId: "<id problemático>" }`
     3. Se o paciente já tiver um plano com `status = 'active'`, retornar `409 { error: "plano_ja_ativo", existingPlanId: "<id>" }` — **decisão de produto: um paciente tem no máximo um plano ativo por vez**, novas sugestões aprovadas devem ser incorporadas a esse plano (ver passo 4) ou o médico precisa encerrar o plano anterior antes.
     4. Se não houver plano ativo, criar novo `treatment_plans` com `physician_id = session.user.id`, `suggestions_included = suggestionIds`, `status = 'active'`
     5. Retornar `201 { planId: string }`
   - `GET`: lista todos os planos (ativos e históricos) do paciente, ordenado por `created_at DESC`.
4. Criar `app/api/treatment-plans/[planId]/add-suggestions/route.ts`:
   - `PATCH`: recebe `{ suggestionIds: string[] }`. Adiciona os IDs ao array `suggestions_included` do plano (sem duplicar), desde que o plano esteja `status = 'active'` e as sugestões sejam do mesmo paciente e estejam `approved`. Retorna `200` com plano atualizado.
5. Criar `app/api/treatment-plans/[planId]/status/route.ts`:
   - `PATCH`: recebe `{ status: 'completed' | 'cancelled' }`. Atualiza `active_until = CURRENT_DATE` quando muda de `active` para outro status. Retorna `200`.
6. Criar tela `app/(dashboard)/pacientes/[patientId]/plano/page.tsx`: mostra o plano ativo (se houver) com todos os itens (buscar `content` de cada `suggestion` em `suggestions_included`), data de início, e botão "Encerrar plano". Se não houver plano ativo mas houver sugestões `approved` sem plano, mostrar botão "Criar plano com sugestões aprovadas".

## Saídas / Entregáveis
- `POST /api/patients/[patientId]/treatment-plans` e `GET` funcionais
- `PATCH /api/treatment-plans/[planId]/add-suggestions` funcional
- `PATCH /api/treatment-plans/[planId]/status` funcional
- Tela de plano de tratamento por paciente

## Arquivos tocados
- `lib/db/schema.ts` (editar)
- `lib/db/migrations/0007_treatment_plans.sql` (criar)
- `app/api/patients/[patientId]/treatment-plans/route.ts` (criar)
- `app/api/treatment-plans/[planId]/add-suggestions/route.ts` (criar)
- `app/api/treatment-plans/[planId]/status/route.ts` (criar)
- `app/(dashboard)/pacientes/[patientId]/plano/page.tsx` (criar)

## Tabelas de banco tocadas
- `treatment_plans` (dono deste mini PRD)

## Variáveis de ambiente necessárias
Nenhuma.

## Contrato de Handoff
O MP-009 (Acompanhamento/Evolução) usa `treatment_plans.id` como referência para vincular métricas de acompanhamento. Exemplo real de plano criado:
```json
{
  "id": "8a9b0c1d-0000-4000-8000-000000000200",
  "patientId": "7d6e5f4c-0000-4000-8000-000000000015",
  "physicianId": "a1b2c3d4-0000-4000-8000-000000000001",
  "suggestionsIncluded": ["5e6f7a8b-...", "6f7a8b9c-..."],
  "status": "active",
  "activeFrom": "2026-07-25"
}
```

## Critérios de Aceite (testáveis)
- [ ] Criar plano com sugestões `approved` válidas retorna `201` com `planId`
- [ ] Criar plano incluindo sugestão não-`approved` retorna `400`
- [ ] Criar segundo plano enquanto há um ativo retorna `409`
- [ ] Adicionar sugestão a plano ativo via `add-suggestions` funciona sem duplicar IDs
- [ ] Encerrar plano (`status: "completed"`) seta `active_until` para a data atual

## Como testar e validar
1. Ter pelo menos 2 sugestões `approved` para o mesmo paciente (via MP-007).
2. Criar plano:
   ```
   curl -X POST http://localhost:3000/api/patients/<patientId>/treatment-plans -b cookies_medico.txt -H "Content-Type: application/json" -d '{"suggestionIds":["<id1>","<id2>"]}'
   ```
   Esperado: `201 { "planId": "<uuid>" }`
3. Tentar criar segundo plano imediatamente com outra sugestão aprovada — esperado: `409 { "error": "plano_ja_ativo", "existingPlanId": "<uuid do passo 2>" }`.
4. Adicionar sugestão ao plano existente:
   ```
   curl -X PATCH http://localhost:3000/api/treatment-plans/<planId>/add-suggestions -b cookies_medico.txt -H "Content-Type: application/json" -d '{"suggestionIds":["<id3>"]}'
   ```
   Esperado: `200`, e `suggestions_included` agora tem 3 IDs.
5. Encerrar plano:
   ```
   curl -X PATCH http://localhost:3000/api/treatment-plans/<planId>/status -b cookies_medico.txt -H "Content-Type: application/json" -d '{"status":"completed"}'
   ```
   Esperado: `200`, `active_until` preenchido com data de hoje.
6. Caso de borda — incluir sugestão não aprovada (`status: "pending_review"`) na criação do plano — esperado: `400 { "error": "sugestao_invalida", "suggestionId": "<id>" }`.

## Mocks necessários para testar isolado
Se MP-006/MP-007 ainda não estiverem completos, crie manualmente 2 linhas em `suggestions` via SQL com `status = 'approved'` para o mesmo `patient_id`, para testar este componente isoladamente.
