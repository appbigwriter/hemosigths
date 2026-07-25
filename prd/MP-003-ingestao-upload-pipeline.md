# MP-003 — Ingestão de Exames: Upload & Pipeline

## Status
pendente

## Depende de
MP-002 (Cadastro de Pacientes & Anamnese)

## Contexto completo (leia antes de começar)
"Hemograma Insights" recebe hemogramas em PDF que os pacientes/clínicas sobem pro sistema. Este mini PRD NÃO faz a extração dos dados do PDF (isso é outro componente, o MP-004) — ele só cuida da parte de infraestrutura: receber o upload, guardar o PDF original no MinIO (armazenamento de arquivos self-hosted, compatível com S3), criar o registro do exame no banco com status "pendente", e disparar um webhook pro n8n (ferramenta de automação já existente na infraestrutura) que vai coordenar o processamento assíncrono. Pense nisso como "a esteira que carrega a caixa", não como "o que tem dentro da caixa".

Sotaque técnico: Next.js 14 App Router (API routes aceitando `multipart/form-data`), TypeScript, cliente MinIO via SDK `minio` (compatível com S3). Toda tabela tocada aqui é tenant-scoped — use `withClinicContext` do MP-001.

## Objetivo
Receber upload de PDF de hemograma, armazenar o arquivo, criar o registro `lab_exams` com status `pending`, e notificar o pipeline externo (n8n) pra continuar o processamento.

## Entradas
- `patients.id` (UUID) do MP-002 — o paciente ao qual o exame pertence. Exemplo: `"7d6e5f4c-0000-4000-8000-000000000015"`
- Sessão do usuário via `auth()` (mesmo formato do MP-001/MP-002)

## Elementos necessários
- Instalar SDK MinIO: `npm install minio`
- Instalar SDK do n8n não é necessário — comunicação é via HTTP simples (`fetch`)
- Variáveis de ambiente (adicionar ao `.env.local`):
  - `MINIO_ENDPOINT` (ex: `minio.suainfra.com`)
  - `MINIO_PORT` (ex: `9000`)
  - `MINIO_ACCESS_KEY`
  - `MINIO_SECRET_KEY`
  - `MINIO_BUCKET_EXAMES` (ex: `hemograma-exames`)
  - `MINIO_USE_SSL` (`true` ou `false`)
  - `N8N_WEBHOOK_INGESTAO_URL` (URL do workflow n8n que recebe o aviso de novo upload)
  - `N8N_WEBHOOK_SECRET` (usado como header de autenticação simples no webhook)
- Bucket MinIO já deve existir (se não existir, criar programaticamente no primeiro uso, verificando com `bucketExists` antes de `makeBucket`)

## Funcionalidade detalhada (passo a passo)

1. Adicionar ao `lib/db/schema.ts`:
   ```sql
   CREATE TABLE lab_exams (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
     patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
     lab_name TEXT,
     collected_at DATE,
     raw_pdf_url TEXT NOT NULL,
     parse_status TEXT NOT NULL DEFAULT 'pending',
     parse_confidence NUMERIC(4,3),
     uploaded_by UUID REFERENCES users(id),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
   `parse_status` aceita: `pending`, `parsed`, `needs_review`, `failed` (validação feita na aplicação, não via CHECK, porque o MP-004 pode adicionar mais estados no futuro).
2. Gerar/rodar migration + RLS:
   ```sql
   ALTER TABLE lab_exams ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_lab_exams ON lab_exams USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
3. Criar `lib/storage/minio-client.ts` exportando um client MinIO configurado com as variáveis de ambiente acima, e uma função `ensureBucketExists()` que checa/cria o bucket na inicialização.
4. Criar `app/api/patients/[patientId]/exams/route.ts`:
   - `POST`: aceita `multipart/form-data` com campo `file` (PDF) e campo opcional `labName` (string) e `collectedAt` (string `YYYY-MM-DD`).
     1. Validar que `file` existe e tem `content-type` = `application/pdf`. Se não for PDF, retornar `400 { error: "arquivo_invalido", detail: "apenas PDF é aceito" }`.
     2. Validar tamanho máximo de 15MB. Se maior, retornar `400 { error: "arquivo_muito_grande" }`.
     3. Gerar nome de objeto único: `{clinicId}/{patientId}/{uuid}.pdf`
     4. Fazer upload pro MinIO usando `putObject(bucket, objectName, buffer)`
     5. Inserir linha em `lab_exams` (via `withClinicContext`) com `raw_pdf_url = objectName`, `parse_status = 'pending'`, `uploaded_by = session.user.id`
     6. Disparar webhook pro n8n via `fetch(N8N_WEBHOOK_INGESTAO_URL, { method: 'POST', headers: {'x-webhook-secret': N8N_WEBHOOK_SECRET}, body: JSON.stringify({ labExamId, objectName, bucket }) })`. Se o fetch falhar (n8n fora do ar), NÃO falhar o upload — logar o erro e deixar o `parse_status = 'pending'` (um job de retry poderá reprocessar depois; isso é aceitável na v1).
     7. Retornar `201 { labExamId: string, parseStatus: "pending" }`
   - `GET`: lista todos os exames do paciente, ordenados por `collected_at DESC NULLS LAST, created_at DESC`.
5. Criar `app/api/webhooks/n8n/parse-callback/route.ts`:
   - `POST`: endpoint que o n8n (ou o MP-004 rodando como parte do pipeline) vai chamar de volta quando o parsing terminar. Recebe header `x-webhook-secret` (deve bater com `N8N_WEBHOOK_SECRET`, senão `401`). Payload:
     ```json
     { "labExamId": "uuid", "status": "parsed", "confidence": 0.94 }
     ```
     Atualiza `lab_exams.parse_status` e `parse_confidence` para o `labExamId` informado. **Nota importante**: este endpoint só atualiza o status — a gravação dos `exam_results` propriamente ditos é responsabilidade do MP-004, não deste componente.

## Saídas / Entregáveis
- `POST /api/patients/[patientId]/exams` funcional (upload + storage + registro + webhook)
- `GET /api/patients/[patientId]/exams` funcional (listagem)
- `POST /api/webhooks/n8n/parse-callback` funcional (atualização de status)
- Tela `app/(dashboard)/pacientes/[patientId]/exames/page.tsx` com botão de upload e lista de exames com status visível

## Arquivos tocados
- `lib/db/schema.ts` (editar)
- `lib/db/migrations/0003_lab_exams.sql` (criar)
- `lib/storage/minio-client.ts` (criar)
- `app/api/patients/[patientId]/exams/route.ts` (criar)
- `app/api/webhooks/n8n/parse-callback/route.ts` (criar)
- `app/(dashboard)/pacientes/[patientId]/exames/page.tsx` (criar)

## Tabelas de banco tocadas
- `lab_exams` (dono deste mini PRD)

## Variáveis de ambiente necessárias
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_EXAMES`, `MINIO_USE_SSL`
- `N8N_WEBHOOK_INGESTAO_URL`, `N8N_WEBHOOK_SECRET`

## Contrato de Handoff
O MP-004 (motor de parsing) recebe do webhook n8n o payload `{ labExamId, objectName, bucket }` e é responsável por:
1. Baixar o PDF do MinIO usando `objectName`/`bucket`
2. Processar e gravar em `exam_results`
3. Chamar de volta `POST /api/webhooks/n8n/parse-callback` com `{ labExamId, status: "parsed"|"needs_review"|"failed", confidence }`

Exemplo real de payload que o n8n envia pro MP-004 processar:
```json
{ "labExamId": "3f2e1d0c-0000-4000-8000-000000000042", "objectName": "f1e2d3c4-.../7d6e5f4c-.../a9b8c7d6-uuid.pdf", "bucket": "hemograma-exames" }
```

## Critérios de Aceite (testáveis)
- [ ] Upload de PDF válido (< 15MB) retorna `201` com `labExamId` e `parseStatus: "pending"`
- [ ] Upload de arquivo não-PDF retorna `400 { error: "arquivo_invalido" }`
- [ ] Upload de PDF > 15MB retorna `400 { error: "arquivo_muito_grande" }`
- [ ] `GET /api/patients/[patientId]/exams` retorna lista ordenada corretamente
- [ ] Callback de parsing com secret errado retorna `401`
- [ ] Callback de parsing válido atualiza `parse_status` e `parse_confidence` corretamente

## Como testar e validar
1. `npm install && npm run dev`
2. Ter um paciente já criado (via MP-002) e sessão autenticada (cookie salvo em `cookies.txt`)
3. Upload de PDF de teste (qualquer PDF pequeno serve pra este teste, não precisa ser um hemograma real ainda):
   ```
   curl -X POST http://localhost:3000/api/patients/<patientId>/exams -b cookies.txt -F "file=@teste.pdf" -F "labName=Fleury" -F "collectedAt=2026-07-01"
   ```
   Esperado: `201 { "labExamId": "<uuid>", "parseStatus": "pending" }`
4. Testar arquivo inválido: `curl -X POST .../exams -b cookies.txt -F "file=@imagem.png"` — esperado: `400 { "error": "arquivo_invalido" }`
5. Verificar no MinIO (via console web ou `mc ls`) que o objeto foi criado no bucket configurado.
6. Testar callback:
   ```
   curl -X POST http://localhost:3000/api/webhooks/n8n/parse-callback -H "x-webhook-secret: <valor de N8N_WEBHOOK_SECRET>" -H "Content-Type: application/json" -d '{"labExamId":"<uuid do passo 3>","status":"parsed","confidence":0.95}'
   ```
   Esperado: `200`. Conferir no banco: `SELECT parse_status, parse_confidence FROM lab_exams WHERE id = '<uuid>'` deve retornar `parsed` e `0.950`.
7. Testar secret errado: repetir o passo 6 com header errado — esperado: `401`.
8. Caso de borda — n8n indisponível: apontar `N8N_WEBHOOK_INGESTAO_URL` pra uma URL inválida (ex: `http://localhost:1`) e repetir o passo 3 — esperado: upload ainda retorna `201` normalmente (o erro do webhook deve ser só logado no console do servidor, nunca quebrar a resposta ao usuário).

## Mocks necessários para testar isolado
- **n8n**: não precisa estar rodando de verdade para testar este componente — o teste do passo 8 acima já cobre a ausência dele. Se quiser simular o n8n respondendo, suba um servidor HTTP simples (`npx http-echo-server` ou similar) na URL configurada.
- **MP-004 (parser)**: ainda não existe — simule o callback manualmente com `curl` conforme passo 6, usando valores fixos de `status` e `confidence`.
