# MP-009 — Acompanhamento & Evolução

## Status
pendente

## Depende de
MP-008 (Plano de Tratamento)

## Contexto completo (leia antes de começar)
"Hemograma Insights" já permite montar um plano de tratamento ativo para um paciente (MP-008). Este mini PRD cria o mecanismo de MEDIR se o plano está funcionando ao longo do tempo: registra pontos de acompanhamento (novo hemograma processado, autorrelato do paciente sobre aderência/sintomas, ou anotação do profissional) vinculados ao plano ativo. Isso é o dado bruto que o MP-010 (visualização) vai transformar em gráfico de evolução.

Sotaque técnico: Next.js 14 App Router, TypeScript, Tailwind, Drizzle.

## Objetivo
Registrar entradas de acompanhamento (`tracking_entries`) ao longo do tempo, vinculadas a um plano de tratamento, e disponibilizar consulta dessas entradas por métrica.

## Entradas
Do MP-008: `treatment_plans.id` de um plano ativo. Exemplo: `"8a9b0c1d-0000-4000-8000-000000000200"`.
Do MP-004: quando um novo hemograma é processado para um paciente que já tem plano ativo, os `exam_results` daquele biomarcador devem alimentar automaticamente uma `tracking_entry` (integração leve — ver passo 4).

## Elementos necessários
Nenhuma dependência nova de pacote.

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts`:
   ```sql
   CREATE TABLE tracking_entries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
     patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
     plan_id UUID REFERENCES treatment_plans(id),
     metric TEXT NOT NULL,
     value NUMERIC,
     value_text TEXT,
     source TEXT NOT NULL CHECK (source IN ('novo_hemograma','self_report','profissional')),
     recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
2. Gerar/rodar migration + RLS:
   ```sql
   ALTER TABLE tracking_entries ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_tracking ON tracking_entries USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
3. Criar `app/api/patients/[patientId]/tracking/route.ts`:
   - `POST`: recebe `{ metric: string, value?: number, valueText?: string, source: 'self_report'|'profissional', planId?: string }`. Validar: `metric` obrigatório; `value` ou `valueText` (pelo menos um); se `source === 'self_report'`, permitir que o próprio paciente envie (autenticação de paciente é fora do escopo deste mini PRD — v1 assume que staff/médico registra em nome do paciente via UI; se autoatendimento do paciente for necessário, é um mini PRD futuro de "portal do paciente"). Gravar via `withClinicContext`.
   - `GET`: aceita query params `?metric=hb&from=2026-01-01&to=2026-12-31`. Retorna entradas ordenadas por `recorded_at ASC`, filtradas por métrica e período quando informados.
4. Criar `lib/tracking/auto-track-from-exam.ts` exportando `autoTrackFromExam(labExamId: string): Promise<void>`:
   - Buscar `exam_results` do `labExamId`
   - Buscar se o paciente tem `treatment_plans` com `status = 'active'`
   - Se houver plano ativo, para cada `exam_results.biomarkerCode` que também aparece em alguma sugestão do tipo relacionado (simplificação v1: gravar `tracking_entries` para TODOS os biomarcadores do exame, não só os relacionados às sugestões — é mais simples e não perde dado; filtragem de relevância fica para visualização, não para a gravação), criar uma `tracking_entries` com `metric = biomarkerCode`, `value = value do exame`, `source = 'novo_hemograma'`, `planId = id do plano ativo`
   - Esta função deve ser chamada automaticamente ao final do pipeline do MP-004 (adicionar a chamada no endpoint `parse-exam` do MP-004, OU expor como endpoint interno separado `app/api/internal/auto-track/route.ts` chamado em sequência pelo n8n — escolha a segunda opção para não acoplar o MP-004 a este mini PRD; o n8n encadeia as chamadas).
5. Criar `app/api/internal/auto-track/route.ts` (protegido por `x-webhook-secret`):
   - `POST` recebe `{ labExamId }`, chama `autoTrackFromExam(labExamId)`, retorna `200 { entriesCreated: number }`.

## Saídas / Entregáveis
- `POST`/`GET /api/patients/[patientId]/tracking` funcionais
- `autoTrackFromExam()` funcional, criando entradas automaticamente a partir de novo hemograma
- Endpoint interno `/api/internal/auto-track`

## Arquivos tocados
- `lib/db/schema.ts` (editar)
- `lib/db/migrations/0008_tracking_entries.sql` (criar)
- `app/api/patients/[patientId]/tracking/route.ts` (criar)
- `lib/tracking/auto-track-from-exam.ts` (criar)
- `app/api/internal/auto-track/route.ts` (criar)

## Tabelas de banco tocadas
- `tracking_entries` (dono deste mini PRD)

## Variáveis de ambiente necessárias
Nenhuma nova (reutiliza `N8N_WEBHOOK_SECRET`).

## Contrato de Handoff
O MP-010 (Visualização) consome `tracking_entries` via `GET /api/patients/[patientId]/tracking?metric=X` para montar gráficos de linha temporal. Exemplo real de resposta:
```json
[
  { "metric": "hb", "value": 10.2, "source": "novo_hemograma", "recordedAt": "2026-05-01T00:00:00.000Z" },
  { "metric": "hb", "value": 11.8, "source": "novo_hemograma", "recordedAt": "2026-07-01T00:00:00.000Z" }
]
```

## Critérios de Aceite (testáveis)
- [ ] `POST /api/patients/[patientId]/tracking` com payload válido cria entrada
- [ ] `POST` sem `value` nem `valueText` retorna `400`
- [ ] `GET .../tracking?metric=hb` retorna só entradas de hemoglobina, ordenadas por data
- [ ] `autoTrackFromExam` cria uma `tracking_entry` por biomarcador do exame quando há plano ativo
- [ ] `autoTrackFromExam` não cria nenhuma entrada quando não há plano ativo (sem erro)

## Como testar e validar
1. Criar plano ativo para um paciente (MP-008) e processar um novo hemograma (MP-004) para o mesmo paciente.
2. Chamar:
   ```
   curl -X POST http://localhost:3000/api/internal/auto-track -H "x-webhook-secret: <valor>" -H "Content-Type: application/json" -d '{"labExamId":"<uuid do novo exame>"}'
   ```
   Esperado: `200 { "entriesCreated": <número de biomarcadores do exame> }`
3. Consultar: `curl "http://localhost:3000/api/patients/<patientId>/tracking?metric=hb" -b cookies.txt` — esperado: array com a entrada de hemoglobina do novo exame.
4. Testar registro manual (autorrelato):
   ```
   curl -X POST http://localhost:3000/api/patients/<patientId>/tracking -b cookies.txt -H "Content-Type: application/json" -d '{"metric":"aderencia_suplemento","valueText":"tomou todos os dias","source":"self_report"}'
   ```
   Esperado: `201`.
5. Testar payload inválido (sem `value` nem `valueText`) — esperado: `400`.
6. Caso de borda — paciente sem plano ativo: rodar `autoTrackFromExam` para um exame de paciente sem plano — esperado: `entriesCreated: 0`, sem erro.

## Mocks necessários para testar isolado
Se MP-004/MP-008 ainda não estiverem prontos, insira manualmente `exam_results` e um `treatment_plans` ativo via SQL para o mesmo paciente, para testar `autoTrackFromExam` isoladamente.
