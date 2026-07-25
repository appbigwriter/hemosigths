# MP-005 — Motor de Regras Clínicas & Insights

## Status
pendente

## Depende de
MP-004 (Motor de Extração/Parsing de PDF)

## Contexto completo (leia antes de começar)
"Hemograma Insights" já consegue, até este ponto, transformar um PDF de hemograma em linhas estruturadas na tabela `exam_results` (valor, unidade, referência, flag normal/alto/baixo). Este mini PRD é a camada que dá SIGNIFICADO CLÍNICO a esses números: aplica regras determinísticas (ex: "VCM baixo + RDW alto sugere anemia ferropriva") e gera "insights" — textos explicando o achado, com a fonte da regra, para o médico revisar depois. **Este componente NUNCA decide um diagnóstico** — ele gera hipóteses com nível de confiança, sempre atribuídas a uma regra rastreável, e sempre em estado `pending_review` até um médico aprovar (a aprovação em si é feita por outro componente, o MP-007).

Sotaque técnico: TypeScript puro para o motor de regras (função testável isoladamente, sem depender de rota HTTP para a lógica central). Regras armazenadas como JSON estruturado no banco (`clinical_rules.condition_logic`), não como código hardcoded, para permitir adicionar regras sem deploy no futuro.

## Objetivo
Avaliar os `exam_results` de um exame recém-processado contra a base de `clinical_rules`, e gerar registros em `insights` para cada regra que "bater".

## Entradas
Do MP-004, via `exam_results` já gravado para um `lab_exam_id`. Exemplo real de entrada (mesmo exemplo do MP-004):
```json
[
  { "biomarkerCode": "hb", "value": 10.2, "unit": "g/dL", "refMin": 12.0, "refMax": 15.5, "flag": "low" },
  { "biomarkerCode": "vcm", "value": 76.5, "unit": "fL", "refMin": 80.0, "refMax": 100.0, "flag": "low" },
  { "biomarkerCode": "rdw", "value": 16.8, "unit": "%", "refMin": 11.5, "refMax": 14.5, "flag": "high" }
]
```

## Elementos necessários
- Nenhuma dependência nova de pacote (TypeScript puro sobre dados já em Postgres)
- Tabela `clinical_rules` deve existir e ser populada com um seed inicial de regras (faz parte deste mini PRD)

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts`:
   ```sql
   CREATE TABLE clinical_rules (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     condition_logic JSONB NOT NULL,
     biomarkers_involved TEXT[] NOT NULL,
     hypothesis TEXT NOT NULL,
     confidence_level TEXT NOT NULL CHECK (confidence_level IN ('alta','media','baixa')),
     source_reference TEXT NOT NULL,
     active BOOLEAN NOT NULL DEFAULT true
   );

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
   ```
   `clinical_rules` é global (sem `clinic_id`, sem RLS). `insights` é tenant-scoped.
2. Gerar/rodar migration + RLS em `insights`:
   ```sql
   ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_insights ON insights USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
3. Seed inicial de `clinical_rules` — inserir pelo menos estas 3 regras (formato de `condition_logic`: objeto onde cada chave é um `biomarker_code` e o valor é uma expressão simples `"<X"`, `">X"`, `"between:X,Y"`):
   ```sql
   INSERT INTO clinical_rules (condition_logic, biomarkers_involved, hypothesis, confidence_level, source_reference) VALUES
   ('{"vcm":"<80","rdw":">14.5"}', ARRAY['vcm','rdw'], 'Padrão sugestivo de anemia ferropriva (microcítica, heterogênea)', 'media', 'Mentzer index / algoritmo clássico de investigação de anemias microcíticas'),
   ('{"vcm":">100"}', ARRAY['vcm'], 'Padrão sugestivo de anemia macrocítica — investigar deficiência de B12/folato ou hipotireoidismo', 'media', 'Algoritmo clássico de investigação de anemias macrocíticas'),
   ('{"leucocitos_total":">11000"}', ARRAY['leucocitos_total'], 'Leucocitose — investigar processo infeccioso/inflamatório em curso', 'baixa', 'Interpretação padrão de hemograma — leucograma');
   ```
4. Criar `lib/rules-engine/evaluate-condition.ts` exportando `evaluateCondition(conditionLogic: Record<string,string>, results: Record<string, number>): boolean`:
   - Para cada chave em `conditionLogic` (ex: `"vcm": "<80"`), parsear o operador (`<`, `>`, `between:min,max`) e comparar com `results[chave]`
   - Se `results` não tiver a chave (biomarcador não presente no exame), a condição inteira é `false` (não avaliar como verdadeiro por ausência de dado)
   - Todas as chaves da condição devem ser verdadeiras (AND implícito) para a regra "bater"
5. Criar `lib/rules-engine/generate-insights.ts` exportando `generateInsightsForExam(labExamId: string): Promise<InsightDraft[]>`:
   1. Buscar todos os `exam_results` do `labExamId` (via `withClinicContext`, usando o `clinic_id` do `lab_exams` correspondente)
   2. Montar um objeto `{ [biomarkerCode]: value }` a partir dos resultados
   3. Buscar todas as `clinical_rules` ativas (`active = true`)
   4. Para cada regra, chamar `evaluateCondition`; se `true`, montar um `InsightDraft`:
      ```ts
      {
        ruleId: rule.id,
        generatedText: `${rule.hypothesis} (baseado em: ${rule.biomarkersInvolved.join(', ')}). Fonte: ${rule.sourceReference}`,
        severity: rule.confidenceLevel === 'alta' ? 'atencao' : 'info' // critico é reservado para casos fora de faixa extrema, ver passo 6
      }
      ```
   5. Adicionalmente, gerar insights de severidade `critico` de forma independente das `clinical_rules`, para qualquer `exam_results` cujo `value` esteja **muito** fora da referência (ex: `value < ref_min * 0.5` ou `value > ref_max * 1.5`), com texto genérico: `"Valor de {biomarkerName} muito fora da referência ({value} {unit}, referência {refMin}-{refMax}) — recomenda-se avaliação médica prioritária."` e `rule_id = NULL` (não vem de uma regra clínica específica, é um alerta estrutural de "fora da faixa por muito")
   6. Gravar todos os `InsightDraft` gerados em `insights`, com `status = 'pending_review'`
6. Criar `app/api/internal/generate-insights/route.ts` (endpoint interno, protegido por `x-webhook-secret`, chamado após o MP-004 concluir o parsing — pode ser encadeado no mesmo webhook do n8n ou chamado em sequência):
   - `POST` recebe `{ labExamId }`
   - Chama `generateInsightsForExam(labExamId)`
   - Retorna `201 { insightsCreated: number }`

## Saídas / Entregáveis
- Função pura `evaluateCondition()` e `generateInsightsForExam()`, testáveis isoladamente
- Registros em `insights` com `status = 'pending_review'` após processamento de um exame
- Seed de `clinical_rules` com pelo menos 3 regras

## Arquivos tocados
- `lib/db/schema.ts` (editar)
- `lib/db/migrations/0005_clinical_rules_insights.sql` (criar, incluir seed)
- `lib/rules-engine/evaluate-condition.ts`, `lib/rules-engine/generate-insights.ts` (criar)
- `app/api/internal/generate-insights/route.ts` (criar)

## Tabelas de banco tocadas
- `clinical_rules` (dono deste mini PRD, seed inicial)
- `insights` (dono deste mini PRD)

## Variáveis de ambiente necessárias
Nenhuma nova (reutiliza `N8N_WEBHOOK_SECRET` do MP-003).

## Contrato de Handoff
O MP-006 (Motor de Sugestões) e o MP-007 (Portal de Revisão) consomem `insights` via query filtrando por `patient_id` e `status = 'pending_review'`. Exemplo real de insight gerado:
```json
{
  "id": "1a2b3c4d-0000-4000-8000-000000000099",
  "patientId": "7d6e5f4c-0000-4000-8000-000000000015",
  "labExamId": "3f2e1d0c-0000-4000-8000-000000000042",
  "ruleId": "aa11bb22-0000-4000-8000-000000000001",
  "generatedText": "Padrão sugestivo de anemia ferropriva (microcítica, heterogênea) (baseado em: vcm, rdw). Fonte: Mentzer index / algoritmo clássico de investigação de anemias microcíticas",
  "severity": "atencao",
  "status": "pending_review"
}
```

## Critérios de Aceite (testáveis)
- [ ] `evaluateCondition({"vcm":"<80","rdw":">14.5"}, {vcm: 76.5, rdw: 16.8})` retorna `true`
- [ ] `evaluateCondition({"vcm":"<80"}, {rdw: 16.8})` (sem `vcm` presente) retorna `false`
- [ ] `generateInsightsForExam()` com o exame de exemplo (hb baixo, vcm baixo, rdw alto) gera pelo menos o insight de anemia ferropriva
- [ ] Valor extremamente fora da referência gera insight com `severity: "critico"` mesmo sem regra específica bater
- [ ] Endpoint retorna `401` com secret errado

## Como testar e validar
1. Testar `evaluateCondition` isoladamente com um script `scripts/test-rules.ts`:
   ```ts
   import { evaluateCondition } from '../lib/rules-engine/evaluate-condition';
   console.log(evaluateCondition({vcm:"<80", rdw:">14.5"}, {vcm: 76.5, rdw: 16.8})); // esperado: true
   console.log(evaluateCondition({vcm:"<80"}, {rdw: 16.8})); // esperado: false (vcm ausente)
   ```
   Rodar com `npx tsx scripts/test-rules.ts`.
2. Ter um `lab_exam_id` já processado pelo MP-004 (com `exam_results` gravado conforme exemplo do contexto).
3. Chamar o endpoint:
   ```
   curl -X POST http://localhost:3000/api/internal/generate-insights -H "x-webhook-secret: <valor>" -H "Content-Type: application/json" -d '{"labExamId":"<uuid>"}'
   ```
   Esperado: `201 { "insightsCreated": <número >= 1> }`
4. Verificar no banco: `SELECT generated_text, severity, status FROM insights WHERE lab_exam_id = '<uuid>'` — deve conter o texto da regra de anemia ferropriva com `status = 'pending_review'`.
5. Testar caso extremo: inserir manualmente um `exam_results` com `value` muito fora da referência (ex: `hb = 3.0`, `ref_min = 12.0`) e rodar `generateInsightsForExam` de novo — esperado: insight adicional com `severity: "critico"` e `rule_id = NULL`.
6. Testar secret errado — esperado `401`.
7. Caso de borda — exame sem nenhum `exam_results` (lista vazia): esperado `201 { "insightsCreated": 0 }`, sem erro.

## Mocks necessários para testar isolado
Se o MP-004 ainda não estiver pronto, insira manualmente linhas de teste em `exam_results` via SQL direto (respeitando `clinic_id` e `lab_exam_id` de um exame/paciente/clínica já existentes do MP-001/002/003), usando os valores do exemplo do contexto acima, para testar este componente de forma independente.
