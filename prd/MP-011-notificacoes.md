# MP-011 — Notificações (WhatsApp/E-mail)

## Status
pendente

## Depende de
MP-001 (Auth & Multi-tenant), MP-005 (Motor de Regras Clínicas & Insights)

## Contexto completo (leia antes de começar)
"Hemograma Insights" gera insights clínicos automaticamente (MP-005), alguns deles marcados como `severity: "critico"` (achado muito fora da referência, que merece atenção imediata do médico). Este mini PRD garante que, quando um insight crítico é gerado, o médico responsável pelo paciente é avisado por WhatsApp (via Hermes, agente já existente na infraestrutura) e/ou e-mail (via Mailcow, já configurado), em vez de depender dele entrar no sistema e checar a fila manualmente.

Sotaque técnico: Next.js 14 API routes, TypeScript. Integração HTTP simples com Hermes (endpoint REST já existente) e com Mailcow via SMTP (usar `nodemailer`).

## Objetivo
Disparar notificação (WhatsApp e/ou e-mail) para o médico responsável sempre que um insight `severity: "critico"` for gerado para um paciente dele.

## Entradas
Do MP-005: insight recém-criado com `severity: "critico"`. Exemplo:
```json
{
  "id": "9f8e7d6c-0000-4000-8000-000000000300",
  "patientId": "7d6e5f4c-0000-4000-8000-000000000015",
  "generatedText": "Valor de Hemoglobina muito fora da referência (5.1 g/dL, referência 12.0-15.5) — recomenda-se avaliação médica prioritária.",
  "severity": "critico"
}
```
Do MP-002: `patients.responsible_physician_id` para saber quem notificar.
Do MP-001: dados de contato do médico (`users.email`) — **nota**: `users` não tem campo de telefone hoje; este mini PRD precisa adicionar `phone TEXT` à tabela `users` (ALTER TABLE, não recriar — MP-001 é o dono da criação da tabela).

## Elementos necessários
- Instalar: `npm install nodemailer` e `npm install -D @types/nodemailer`
- Variáveis de ambiente novas:
  - `MAILCOW_SMTP_HOST`, `MAILCOW_SMTP_PORT`, `MAILCOW_SMTP_USER`, `MAILCOW_SMTP_PASS`
  - `HERMES_API_URL`, `HERMES_API_KEY`
- Acesso de rede ao Hermes e ao Mailcow já configurados na infraestrutura (assumir disponíveis; se a chamada falhar, tratar como erro de integração, não travar o fluxo principal)

## Funcionalidade detalhada (passo a passo)

1. Adicionar migration `ALTER TABLE users ADD COLUMN phone TEXT;` (arquivo `lib/db/migrations/0009_users_phone.sql` — este mini PRD só altera a tabela, não é dono dela).
2. Criar tabela nova:
   ```sql
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
   ```
3. Gerar/rodar migration + RLS:
   ```sql
   ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_notifications ON notifications USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
4. Criar `lib/notifications/send-whatsapp.ts` exportando `sendWhatsapp(phone: string, message: string): Promise<{ success: boolean; error?: string }>`:
   - `POST` para `HERMES_API_URL` com header `Authorization: Bearer ${HERMES_API_KEY}`, payload `{ to: phone, message }`
   - Capturar erro de rede/timeout, retornar `{ success: false, error: <mensagem> }` sem lançar exceção
5. Criar `lib/notifications/send-email.ts` exportando `sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; error?: string }>` usando `nodemailer.createTransport` com as variáveis `MAILCOW_SMTP_*`.
6. Criar `lib/notifications/notify-critical-insight.ts` exportando `notifyCriticalInsight(insightId: string): Promise<void>`:
   1. Buscar o insight (deve ter `severity === 'critico'` — se não for, não fazer nada e retornar)
   2. Buscar o paciente e seu `responsible_physician_id`; se não houver médico responsável definido, criar notificação com `channel: 'painel'` apenas (fica visível na fila de revisão, sem disparo externo) e encerrar
   3. Buscar `phone` e `email` do médico responsável
   4. Montar mensagem: `"⚠️ Achado crítico para o paciente {nome}: {generatedText}. Acesse o sistema para revisar."`
   5. Se `phone` existir, chamar `sendWhatsapp`; gravar resultado em `notifications` (`channel: 'whatsapp'`, `status: 'sent'` ou `'failed'`)
   6. Sempre também enviar e-mail (`sendEmail`), independente do WhatsApp ter funcionado — gravar em `notifications` (`channel: 'email'`)
7. Criar `app/api/internal/notify-critical/route.ts` (protegido por `x-webhook-secret`):
   - `POST` recebe `{ insightId }`, chama `notifyCriticalInsight`, retorna `200`. Este endpoint deve ser chamado em sequência pelo n8n logo após o MP-005 gerar insights (o n8n verifica se algum insight retornado tem `severity: critico` e, se sim, chama este endpoint).

## Saídas / Entregáveis
- Coluna `phone` adicionada a `users`
- Tabela `notifications` criada
- `notifyCriticalInsight()` funcional, registrando tentativas de notificação
- Endpoint interno `/api/internal/notify-critical`

## Arquivos tocados
- `lib/db/schema.ts` (editar — ALTER em `users`, criar `notifications`)
- `lib/db/migrations/0009_users_phone.sql`, `0010_notifications.sql` (criar)
- `lib/notifications/send-whatsapp.ts`, `send-email.ts`, `notify-critical-insight.ts` (criar)
- `app/api/internal/notify-critical/route.ts` (criar)

## Tabelas de banco tocadas
- `notifications` (dono deste mini PRD)
- `users` (ALTER apenas — adicionar coluna `phone`; dono da tabela continua sendo o MP-001)

## Variáveis de ambiente necessárias
- `MAILCOW_SMTP_HOST`, `MAILCOW_SMTP_PORT`, `MAILCOW_SMTP_USER`, `MAILCOW_SMTP_PASS`
- `HERMES_API_URL`, `HERMES_API_KEY`

## Contrato de Handoff
Componente "folha" do ponto de vista de dado — nenhum outro mini PRD consome `notifications` diretamente (é registro de auditoria de envio). Não há contrato de handoff adiante.

## Critérios de Aceite (testáveis)
- [ ] Insight com `severity: "critico"` e médico com telefone/email cadastrados dispara WhatsApp e e-mail, ambos registrados em `notifications`
- [ ] Insight com `severity` diferente de `critico` não gera nenhuma notificação
- [ ] Paciente sem `responsible_physician_id` gera apenas notificação `channel: 'painel'`
- [ ] Falha na chamada ao Hermes não impede o envio do e-mail (os dois canais são independentes)
- [ ] Endpoint retorna `401` com secret errado

## Como testar e validar
1. `npm install nodemailer && npm run dev`
2. Ter um médico com `phone` e `email` preenchidos, responsável por um paciente com um insight `severity: "critico"` já gerado (MP-005).
3. Chamar:
   ```
   curl -X POST http://localhost:3000/api/internal/notify-critical -H "x-webhook-secret: <valor>" -H "Content-Type: application/json" -d '{"insightId":"<uuid>"}'
   ```
   Esperado: `200`. Verificar `SELECT channel, status FROM notifications WHERE patient_id = '<patientId>'` — deve haver 2 linhas (`whatsapp`, `email`), idealmente ambas `sent` (se Hermes/Mailcow estiverem acessíveis no ambiente de teste).
4. Testar insight não-crítico: rodar o mesmo endpoint com `insightId` de severidade `info` — esperado: nenhuma linha nova em `notifications`.
5. Testar paciente sem médico responsável: remover `responsible_physician_id` do paciente de teste e repetir o passo 3 — esperado: 1 linha em `notifications` com `channel: 'painel'`, nenhuma chamada externa.
6. Testar falha do Hermes: apontar `HERMES_API_URL` pra uma URL inválida e repetir o passo 3 — esperado: linha `whatsapp` com `status: 'failed'`, mas linha `email` ainda `sent` (os dois são independentes).
7. Testar secret errado — esperado `401`.

## Mocks necessários para testar isolado
- **Hermes**: se não estiver acessível no ambiente de teste, simule com um servidor HTTP local que sempre responde `200` (ou proposicionalmente teste só o caminho de falha, conforme passo 6).
- **Mailcow/SMTP**: para teste local sem SMTP real, usar um serviço de teste tipo Mailtrap ou similar, ou mockar `nodemailer.createTransport` para não enviar de fato, documentando isso claramente no resultado do teste.
