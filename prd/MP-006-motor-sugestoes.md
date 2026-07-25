# MP-006 — Motor de Sugestões (Exames, Suplementação, Dieta)

## Status
pendente

## Depende de
MP-005 (Motor de Regras Clínicas & Insights), MP-002 (Cadastro de Pacientes & Anamnese)

## Contexto completo (leia antes de começar)
"Hemograma Insights" já gera, até este ponto, "insights" clínicos a partir dos resultados de exame (ex: "padrão sugestivo de anemia ferropriva"). Este mini PRD dá um passo além: cruza esses insights com a anamnese do paciente (sintomas, dieta, medicamentos) para propor SUGESTÕES CONCRETAS — de exame complementar, suplementação, dieta ou estilo de vida. Assim como os insights, **nenhuma sugestão é aplicada automaticamente**: tudo fica em `status = 'pending_review'` até um médico aprovar (aprovação feita pelo MP-007).

Sotaque técnico: TypeScript puro para a lógica de cruzamento (função testável isoladamente com dados mockados de insight + anamnese, sem precisar do banco rodando).

## Objetivo
Para cada insight `pending_review` de um paciente, gerar de 0 a N registros de `suggestions`, cruzando com a anamnese mais recente do paciente.

## Entradas
Do MP-005, insight já gerado. Exemplo real:
```json
{
  "id": "1a2b3c4d-0000-4000-8000-000000000099",
  "patientId": "7d6e5f4c-0000-4000-8000-000000000015",
  "generatedText": "Padrão sugestivo de anemia ferropriva...",
  "severity": "atencao",
  "status": "pending_review"
}
```
Do MP-002, anamnese mais recente do paciente (mesmo formato de exemplo já documentado lá):
```json
{
  "symptoms": ["fadiga", "queda de cabelo"],
  "dietType": "vegetariano",
  "medications": ["losartana 50mg"],
  "comorbidities": ["hipotireoidismo"],
  "lifestyle": {"sono_horas": 6, "exercicio_semanal": 2}
}
```

## Elementos necessários
Nenhuma dependência nova de pacote.

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts`:
   ```sql
   CREATE TABLE suggestions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
     patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
     insight_id UUID REFERENCES insights(id),
     type TEXT NOT NULL CHECK (type IN ('exame_complementar','suplementacao','dieta','estilo_de_vida')),
     content JSONB NOT NULL,
     physician_id UUID REFERENCES users(id),
     status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','edited_by_physician')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     reviewed_at TIMESTAMPTZ
   );
   ```
2. Gerar/rodar migration + RLS:
   ```sql
   ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_suggestions ON suggestions USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
3. Criar `lib/suggestions-engine/rule-to-suggestions-map.ts`: um mapa estático (código, não tabela — decisão da v1, pode virar tabela configurável depois) ligando `rule_id` (ou padrão de hipótese) a modelos de sugestão. Exemplo de estrutura:
   ```ts
   export const ruleToSuggestions: Record<string, SuggestionTemplate[]> = {
     'anemia_ferropriva': [
       { type: 'exame_complementar', content: { exame: 'Ferritina sérica', motivo: 'confirmar depleção de estoque de ferro' } },
       { type: 'exame_complementar', content: { exame: 'Vitamina B12 e ácido fólico', motivo: 'descartar causa combinada' } },
       { type: 'suplementacao', content: { suplemento: 'Sulfato ferroso', doseSugerida: '40mg elementar/dia', observacao: 'dose e duração a critério médico' } },
       { type: 'dieta', content: { foco: 'aumentar ingestão de ferro heme (carnes vermelhas, vísceras) ou não-heme com vitamina C (leguminosas + limão)', observacao: 'ajustar conforme dietType do paciente' } }
     ],
     'anemia_macrocitica': [
       { type: 'exame_complementar', content: { exame: 'Vitamina B12, ácido fólico, TSH', motivo: 'investigar causa de macrocitose' } }
     ],
     'leucocitose': [
       { type: 'exame_complementar', content: { exame: 'PCR, hemocultura se febre associada', motivo: 'investigar processo infeccioso/inflamatório' } }
     ]
   };
   ```
   Nota: a chave do mapa (`anemia_ferropriva` etc.) deve ser derivada de forma determinística do `hypothesis` da regra ou de um novo campo `rule_key` — **adicione o campo `rule_key TEXT` em `clinical_rules`** (migration adicional) e popule com esses slugs nas regras já existentes do MP-005, para não depender de match de texto livre.
4. Criar `lib/suggestions-engine/generate-suggestions.ts` exportando `generateSuggestionsForInsight(insightId: string): Promise<SuggestionDraft[]>`:
   1. Buscar o insight (via `withClinicContext`), incluindo `rule_id` → buscar `rule_key` da `clinical_rules` correspondente
   2. Se `rule_key` não estiver no `ruleToSuggestions`, retornar array vazio (não gerar sugestão genérica sem base)
   3. Buscar anamnese mais recente do `patient_id` do insight
   4. Para cada `SuggestionTemplate` do mapa, montar o `content` final, ajustando o texto de dieta conforme `dietType` da anamnese quando o template tiver o placeholder `ajustar conforme dietType` (ex: se `dietType === 'vegetariano'`, substituir a recomendação de "carnes vermelhas" por "leguminosas + vitamina C, considerar suplementação por menor biodisponibilidade de ferro não-heme")
   5. Gravar cada sugestão em `suggestions` com `status = 'pending_review'`, `insight_id` vinculado
5. Criar `app/api/internal/generate-suggestions/route.ts` (endpoint interno, protegido por `x-webhook-secret`):
   - `POST` recebe `{ insightId }`
   - Chama `generateSuggestionsForInsight`
   - Retorna `201 { suggestionsCreated: number }`

## Saídas / Entregáveis
- Função pura `generateSuggestionsForInsight()`, testável isoladamente com insight + anamnese mockados
- Registros em `suggestions` com `status = 'pending_review'`
- Campo `rule_key` adicionado a `clinical_rules` (migration incremental sobre tabela do MP-005 — coordenar para não conflitar; este mini PRD é dono da ALTER TABLE, não recria a tabela)

## Arquivos tocados
- `lib/db/schema.ts` (editar — adicionar `suggestions`, alterar `clinical_rules` para incluir `rule_key`)
- `lib/db/migrations/0006_suggestions.sql` (criar, incluindo `ALTER TABLE clinical_rules ADD COLUMN rule_key TEXT` e `UPDATE clinical_rules SET rule_key = ...` para as 3 regras seed do MP-005)
- `lib/suggestions-engine/rule-to-suggestions-map.ts`, `generate-suggestions.ts` (criar)
- `app/api/internal/generate-suggestions/route.ts` (criar)

## Tabelas de banco tocadas
- `suggestions` (dono deste mini PRD)
- `clinical_rules` (ALTER apenas — adicionar coluna `rule_key`; o dono da criação da tabela é o MP-005, não recriar)

## Variáveis de ambiente necessárias
Nenhuma nova (reutiliza `N8N_WEBHOOK_SECRET`).

## Contrato de Handoff
O MP-007 (Portal de Revisão) e o MP-008 (Plano de Tratamento) consomem `suggestions` via query por `patient_id` e `status`. Exemplo real de sugestão gerada:
```json
{
  "id": "5e6f7a8b-0000-4000-8000-000000000123",
  "patientId": "7d6e5f4c-0000-4000-8000-000000000015",
  "insightId": "1a2b3c4d-0000-4000-8000-000000000099",
  "type": "suplementacao",
  "content": { "suplemento": "Sulfato ferroso", "doseSugerida": "40mg elementar/dia", "observacao": "dose e duração a critério médico" },
  "status": "pending_review"
}
```

## Critérios de Aceite (testáveis)
- [ ] Insight de anemia ferropriva gera pelo menos 3 sugestões (2 exames + 1 suplementação + 1 dieta, conforme mapa)
- [ ] Sugestão de dieta reflete `dietType: "vegetariano"` da anamnese quando aplicável
- [ ] Insight sem `rule_key` mapeado gera `0` sugestões, sem erro
- [ ] Endpoint retorna `401` com secret errado

## Como testar e validar
1. Ter um insight já gerado pelo MP-005 (`rule_key = 'anemia_ferropriva'`) e uma anamnese com `dietType: "vegetariano"` já cadastrada (MP-002) para o mesmo paciente.
2. Chamar:
   ```
   curl -X POST http://localhost:3000/api/internal/generate-suggestions -H "x-webhook-secret: <valor>" -H "Content-Type: application/json" -d '{"insightId":"<uuid>"}'
   ```
   Esperado: `201 { "suggestionsCreated": 4 }` (conforme o mapa de exemplo)
3. Verificar no banco: `SELECT type, content FROM suggestions WHERE insight_id = '<uuid>'` — o registro `type = 'dieta'` deve conter texto ajustado para vegetarianismo (ex: menção a "leguminosas" em vez de "carnes vermelhas").
4. Testar insight sem mapeamento: gerar manualmente um insight com `rule_id = NULL` (dos insights de severidade crítica do MP-005, que não têm regra) e rodar o endpoint — esperado: `201 { "suggestionsCreated": 0 }`.
5. Testar secret errado — esperado `401`.

## Mocks necessários para testar isolado
Se o MP-005 ainda não estiver gerando `rule_key` corretamente, insira manualmente um insight de teste via SQL com `rule_id` apontando para uma `clinical_rule` com `rule_key = 'anemia_ferropriva'` já setado, para validar este componente isoladamente.
