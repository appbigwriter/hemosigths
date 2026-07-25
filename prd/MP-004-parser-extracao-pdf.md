# MP-004 — Motor de Extração/Parsing de PDF

## Status
pendente

## Depende de
MP-003 (Ingestão de Exames: Upload & Pipeline)

## Contexto completo (leia antes de começar)
"Hemograma Insights" recebe PDFs de hemograma de vários laboratórios brasileiros (Fleury, DASA, Hermes Pardini, Sabin, entre outros), cada um com layout diferente. Este mini PRD é o "cérebro de leitura": pega o PDF já armazenado (pelo MP-003) e extrai os valores de cada biomarcador (hemoglobina, hematócrito, VCM, leucócitos etc.), junto com a referência de normalidade impressa no próprio exame. Se o layout do laboratório não for reconhecido, cai num fallback de OCR genérico. Este componente é **puro processamento de dados** — não tem UI, é testável isoladamente com arquivos PDF de amostra, sem precisar de nenhuma outra parte do sistema rodando.

Sotaque técnico: TypeScript puro (funções, sem depender de Next.js para a lógica de extração em si — só o endpoint que a expõe é Next.js). Bibliotecas: `pdf-parse` para extração de texto de PDFs nativos, `tesseract.js` como fallback OCR para PDFs escaneados/sem camada de texto.

## Objetivo
Extrair de um PDF de hemograma os valores de cada biomarcador reconhecido, normalizar pra um formato estruturado, e gravar em `exam_results`, atualizando o status do exame.

## Entradas
Do MP-003, via webhook do n8n (ou chamada direta se preferir simplificar a v1 e pular o n8n neste ponto específico — decisão de implementação livre, desde que o contrato de saída seja respeitado):
```json
{ "labExamId": "3f2e1d0c-0000-4000-8000-000000000042", "objectName": "clinicId/patientId/uuid.pdf", "bucket": "hemograma-exames" }
```

## Elementos necessários
- Instalar dependências exatas:
  ```
  npm install pdf-parse tesseract.js
  ```
- Acesso de leitura ao MinIO (mesmo client criado no MP-003, `lib/storage/minio-client.ts` — reutilizar, não recriar)
- Tabela `biomarker_catalog` deve existir e estar populada com pelo menos os biomarcadores básicos de hemograma (ver seed abaixo — faz parte deste mini PRD criar e popular)
- Tabela `lab_parser_templates` deve existir (faz parte deste mini PRD)

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts`:
   ```sql
   CREATE TABLE biomarker_catalog (
     code TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL,
     standard_unit TEXT NOT NULL,
     description TEXT
   );

   CREATE TABLE exam_results (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
     lab_exam_id UUID NOT NULL REFERENCES lab_exams(id) ON DELETE CASCADE,
     biomarker_code TEXT NOT NULL REFERENCES biomarker_catalog(code),
     value NUMERIC NOT NULL,
     unit TEXT NOT NULL,
     ref_min NUMERIC,
     ref_max NUMERIC,
     ref_source TEXT,
     flag TEXT NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal','low','high','critical'))
   );

   CREATE TABLE lab_parser_templates (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lab_name TEXT NOT NULL UNIQUE,
     template_json JSONB NOT NULL,
     active BOOLEAN NOT NULL DEFAULT true
   );
   ```
   Nenhuma dessas três tabelas é tenant-scoped exceto `exam_results` (tem `clinic_id` porque pertence a um exame de uma clínica específica). `biomarker_catalog` e `lab_parser_templates` são globais (sem RLS, sem `clinic_id`).
2. Seed inicial de `biomarker_catalog` (inserir via migration ou script de seed), pelo menos estes 10 biomarcadores:
   ```sql
   INSERT INTO biomarker_catalog (code, name, category, standard_unit) VALUES
   ('hb', 'Hemoglobina', 'serie_vermelha', 'g/dL'),
   ('ht', 'Hematócrito', 'serie_vermelha', '%'),
   ('vcm', 'VCM', 'serie_vermelha', 'fL'),
   ('hcm', 'HCM', 'serie_vermelha', 'pg'),
   ('chcm', 'CHCM', 'serie_vermelha', 'g/dL'),
   ('rdw', 'RDW', 'serie_vermelha', '%'),
   ('leucocitos_total', 'Leucócitos totais', 'serie_branca', '/mm3'),
   ('neutrofilos', 'Neutrófilos', 'serie_branca', '/mm3'),
   ('linfocitos', 'Linfócitos', 'serie_branca', '/mm3'),
   ('plaquetas', 'Plaquetas', 'plaquetas', '/mm3');
   ```
3. Criar `lib/parser/extract-text.ts` exportando `extractTextFromPdf(buffer: Buffer): Promise<{ text: string; hasNativeText: boolean }>`:
   - Tentar `pdf-parse` primeiro. Se o texto extraído tiver menos de 50 caracteres (indício de PDF escaneado sem camada de texto), marcar `hasNativeText: false` e cair no OCR.
   - Se `hasNativeText: false`, converter o PDF em imagem (usar `pdf-parse` não serve pra isso — para v1, aceitar como limitação conhecida e documentar: se não houver lib de conversão PDF→imagem disponível sem custo, usar `tesseract.js` diretamente sobre o buffer do PDF quando suportado, ou registrar `parse_status = 'failed'` com motivo "pdf_sem_texto_extraivel" pra revisão manual). **Não invente uma solução de conversão de PDF pra imagem além do que as libs instaladas oferecem — se não for viável na v1, falhe explicitamente e documente.**
4. Criar `lib/parser/templates/` com um arquivo por laboratório, cada um exportando uma função `matchAndExtract(text: string): ParsedBiomarker[] | null` (retorna `null` se o texto não bater com o padrão esperado desse laboratório). Exemplo mínimo pra `fleury.ts`:
   ```ts
   export function matchAndExtract(text: string): ParsedBiomarker[] | null {
     if (!text.includes('FLEURY')) return null;
     const results: ParsedBiomarker[] = [];
     const hbMatch = text.match(/Hemoglobina[:\s]+([\d,.]+)\s*g\/dL/i);
     if (hbMatch) results.push({ code: 'hb', value: parseFloat(hbMatch[1].replace(',', '.')), unit: 'g/dL' });
     // repetir padrão de regex para os demais 9 biomarcadores do catálogo
     return results.length > 0 ? results : null;
   }
   ```
   Implemente pelo menos os templates: `fleury.ts`, `dasa.ts`, `hermes-pardini.ts`, `sabin.ts`. Cada um deve extrair, no mínimo, os 10 biomarcadores do seed do passo 2, quando presentes no texto.
5. Criar `lib/parser/generic-fallback.ts` exportando `extractGeneric(text: string): ParsedBiomarker[]`: usa regex mais genéricas cruzando o `name` de `biomarker_catalog` (busca fuzzy simples por nome + número + unidade próxima) — best-effort, aceita menor precisão. Sempre retorna array (pode ser vazio), nunca `null`.
6. Criar `lib/parser/index.ts` exportando `parseHemograma(buffer: Buffer, labNameHint?: string): { results: ParsedBiomarker[]; confidence: number; usedTemplate: string }`:
   1. Extrair texto via `extractTextFromPdf`
   2. Tentar cada template em `lib/parser/templates/` em ordem; usar o primeiro que retornar não-`null`
   3. Se nenhum template bater, usar `generic-fallback.ts`
   4. Calcular `confidence`: `1.0` se template específico bateu e extraiu todos os 10 biomarcadores esperados; `0.7` se template bateu mas faltou algum; `0.4` se caiu no fallback genérico
7. Criar `app/api/internal/parse-exam/route.ts` (endpoint chamado pelo n8n, não pelo usuário final — proteger com o mesmo header `x-webhook-secret` do MP-003):
   - `POST` recebe `{ labExamId, objectName, bucket }`
   - Baixa o PDF do MinIO (`getObject`)
   - Chama `parseHemograma(buffer)`
   - Para cada `ParsedBiomarker`, calcular `flag` comparando `value` com `ref_min`/`ref_max` extraídos do próprio PDF quando disponíveis (se o parser não conseguir extrair a referência, deixar `ref_min`/`ref_max` como `NULL` e `flag = 'normal'` — não adivinhar referência)
   - Gravar todos os resultados em `exam_results` (usando `clinic_id` do `lab_exams` correspondente, buscado antes)
   - Atualizar `lab_exams.parse_status` para `parsed` (se `confidence >= 0.7`) ou `needs_review` (se `confidence < 0.7`), e `parse_confidence`
   - Se qualquer erro não tratado ocorrer (PDF corrompido, etc.), setar `parse_status = 'failed'` e não deixar a exceção subir sem log

## Saídas / Entregáveis
- Função pura `parseHemograma()` testável isoladamente com arquivos PDF de amostra
- `exam_results` populada corretamente após parsing
- `lab_exams.parse_status`/`parse_confidence` atualizados
- Tabelas `biomarker_catalog` (populada) e `lab_parser_templates` criadas

## Arquivos tocados
- `lib/db/schema.ts` (editar)
- `lib/db/migrations/0004_exam_results.sql` (criar, incluir seed de `biomarker_catalog`)
- `lib/parser/extract-text.ts`, `lib/parser/index.ts`, `lib/parser/generic-fallback.ts` (criar)
- `lib/parser/templates/fleury.ts`, `dasa.ts`, `hermes-pardini.ts`, `sabin.ts` (criar)
- `app/api/internal/parse-exam/route.ts` (criar)

## Tabelas de banco tocadas
- `exam_results` (dono deste mini PRD)
- `biomarker_catalog` (dono deste mini PRD, seed inicial)
- `lab_parser_templates` (dono deste mini PRD, ainda não usada dinamicamente na v1 — templates são código, não dado; a tabela existe pra v2 permitir templates configuráveis sem deploy)

## Variáveis de ambiente necessárias
Nenhuma nova além das do MP-003 (reutiliza `MINIO_*` e `N8N_WEBHOOK_SECRET`).

## Contrato de Handoff
O MP-005 (Motor de Regras Clínicas) consome `exam_results` diretamente via query, filtrando por `lab_exam_id`. Exemplo real de linhas geradas por este componente para um exame:
```json
[
  { "biomarkerCode": "hb", "value": 10.2, "unit": "g/dL", "refMin": 12.0, "refMax": 15.5, "flag": "low" },
  { "biomarkerCode": "vcm", "value": 76.5, "unit": "fL", "refMin": 80.0, "refMax": 100.0, "flag": "low" },
  { "biomarkerCode": "rdw", "value": 16.8, "unit": "%", "refMin": 11.5, "refMax": 14.5, "flag": "high" }
]
```

## Critérios de Aceite (testáveis)
- [ ] `parseHemograma()` com PDF de amostra Fleury retorna `usedTemplate: "fleury"` e `confidence >= 0.7`
- [ ] `parseHemograma()` com PDF de laboratório não mapeado retorna `usedTemplate: "generic"` e `confidence` em torno de `0.4`
- [ ] `exam_results` gravado tem `flag` calculado corretamente (`low`/`high`/`normal`) comparando `value` com `ref_min`/`ref_max`
- [ ] Endpoint `/api/internal/parse-exam` com secret errado retorna `401`
- [ ] PDF corrompido/ilegível gera `parse_status = 'failed'` sem derrubar o servidor

## Como testar e validar
1. `npm install`
2. Testar a função pura isoladamente (sem servidor rodando), criando um script `scripts/test-parser.ts`:
   ```ts
   import fs from 'fs';
   import { parseHemograma } from '../lib/parser';
   const buffer = fs.readFileSync('./samples/fleury-exemplo.pdf');
   parseHemograma(buffer).then(console.log);
   ```
   Rodar com `npx tsx scripts/test-parser.ts`. Esperado: objeto com `results` (array não vazio), `confidence >= 0.7`, `usedTemplate: "fleury"`.
   **Nota**: você (executor) precisa obter ou criar PDFs de amostra realistas pra cada laboratório — se não tiver acesso a exemplos reais, crie PDFs de teste simples em texto puro que imitem o formato esperado (ex: contendo a string "FLEURY" e linhas tipo "Hemoglobina: 10,2 g/dL"), documentando isso como limitação do teste.
3. Rodar o servidor (`npm run dev`) e simular o endpoint interno:
   ```
   curl -X POST http://localhost:3000/api/internal/parse-exam -H "x-webhook-secret: <valor>" -H "Content-Type: application/json" -d '{"labExamId":"<uuid de um exame já criado no MP-003>","objectName":"<objectName retornado no upload>","bucket":"hemograma-exames"}'
   ```
   Esperado: `200`. Verificar no banco: `SELECT * FROM exam_results WHERE lab_exam_id = '<uuid>'` deve retornar linhas com `flag` coerente.
4. Testar secret errado: repetir com header errado — esperado `401`.
5. Caso de borda — PDF corrompido: subir um arquivo de texto renomeado pra `.pdf` (não é PDF válido de verdade) e rodar o parse — esperado: `lab_exams.parse_status = 'failed'`, sem exception não tratada no console (deve aparecer log de erro capturado, não um crash do processo Node).
6. Caso de borda — laboratório desconhecido: usar um PDF de amostra que não contenha nenhuma das strings de identificação dos templates (`FLEURY`, etc.) — esperado: `usedTemplate: "generic"`, `parse_status = 'needs_review'` (porque confidence < 0.7).

## Mocks necessários para testar isolado
- **MinIO real não é necessário** pra testar `parseHemograma()` isoladamente (passo 2 acima usa arquivo local direto). Só é necessário quando testar o endpoint completo (passo 3), que depende do MP-003 já ter feito upload real.
- **PDFs de amostra**: como não há PDFs reais de hemograma disponíveis neste contexto, crie/obtenha manualmente pelo menos 2 exemplos (1 com layout reconhecido, 1 genérico) antes de considerar este mini PRD testável de ponta a ponta.
