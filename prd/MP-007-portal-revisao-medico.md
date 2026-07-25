# MP-007 — Portal de Revisão do Médico

## Status
pendente

## Depende de
MP-001 (Auth & Multi-tenant), MP-005 (Motor de Regras Clínicas & Insights), MP-006 (Motor de Sugestões)

## Contexto completo (leia antes de começar)
"Hemograma Insights" gera automaticamente, nos componentes anteriores, "insights" (achados clínicos) e "suggestions" (exames/suplementação/dieta propostos) — mas nada disso chega ao paciente sem um médico aprovar. Este mini PRD é a TELA e os ENDPOINTS onde o médico vê a fila de insights e sugestões pendentes de um paciente e decide: aprovar, editar o texto/conteúdo, ou rejeitar. Este é o único lugar do sistema onde `status = 'pending_review'` muda para `approved`/`rejected`/`edited_by_physician`. Sem este componente, o produto inteiro não tem "trava humana" — e essa trava é o ponto mais importante do produto, tanto do ponto de vista clínico quanto regulatório.

Sotaque técnico: Next.js 14 App Router, TypeScript, Tailwind, Drizzle. Só usuários com `role IN ('medico', 'admin_clinica')` podem aprovar/rejeitar (staff pode visualizar, não decidir — validar isso no backend, não só esconder botão no frontend).

## Objetivo
Permitir que o médico veja, por paciente, a fila de insights e sugestões pendentes, e aprove, edite ou rejeite cada um.

## Entradas
Do MP-005: `insights` com `status = 'pending_review'`.
Do MP-006: `suggestions` com `status = 'pending_review'`.
Do MP-001: sessão do usuário com `role`.

Exemplo real de payload que este componente vai listar (combinando os dois, já documentados nos MPs anteriores):
```json
{
  "insight": { "id": "1a2b3c4d-...", "generatedText": "Padrão sugestivo de anemia ferropriva...", "severity": "atencao", "status": "pending_review" },
  "suggestions": [
    { "id": "5e6f7a8b-...", "type": "suplementacao", "content": {"suplemento":"Sulfato ferroso","doseSugerida":"40mg elementar/dia"}, "status": "pending_review" }
  ]
}
```

## Elementos necessários
Nenhuma dependência nova de pacote.

## Funcionalidade detalhada (passo a passo)

1. Criar `app/api/patients/[patientId]/review-queue/route.ts`:
   - `GET`: retorna todos os `insights` do paciente com `status = 'pending_review'`, cada um com o array de `suggestions` vinculadas (via `insight_id`) que também estejam `pending_review`. Ordenar por `severity` (`critico` primeiro, depois `atencao`, depois `info`) e dentro disso por `created_at ASC` (mais antigo primeiro).
2. Criar `app/api/insights/[insightId]/review/route.ts`:
   - `PATCH`: recebe `{ action: 'approve' | 'reject' | 'edit', editedText?: string }`.
     1. Validar que `session.user.role` é `medico` ou `admin_clinica`. Se `staff`, retornar `403 { error: "acao_nao_permitida_para_staff" }`.
     2. Se `action === 'edit'`, exigir `editedText` (mínimo 5 caracteres); atualizar `generated_text = editedText`, `status = 'edited_by_physician'`
     3. Se `action === 'approve'`, `status = 'approved'`
     4. Se `action === 'reject'`, `status = 'rejected'`
     5. Em todos os casos, setar `reviewed_by = session.user.id`, `reviewed_at = now()`
     6. Retornar `200` com o insight atualizado
3. Criar `app/api/suggestions/[suggestionId]/review/route.ts`: mesma lógica do passo 2, mas para a tabela `suggestions` (`content` pode ser editado via campo `editedContent` em vez de `editedText`, mesma validação de role).
4. Criar tela `app/(dashboard)/revisao/page.tsx`: fila consolidada de TODOS os pacientes da clínica com itens pendentes (não só um paciente) — útil para o médico começar o dia vendo tudo que precisa revisar. Cada linha mostra nome do paciente, texto do insight, severidade (com destaque visual pra `critico`), e botões Aprovar/Editar/Rejeitar.
5. Criar tela `app/(dashboard)/pacientes/[patientId]/insights/page.tsx`: mesma fila, mas escopada a um paciente específico (reusa o mesmo componente de card de revisão).
6. Criar `components/review/insight-review-card.tsx` e `components/review/suggestion-review-card.tsx`: componentes de UI reutilizados pelas duas telas acima, cada um com estado local pro modo de edição (mostrar textarea quando "Editar" é clicado).

## Saídas / Entregáveis
- `GET /api/patients/[patientId]/review-queue` funcional
- `PATCH /api/insights/[insightId]/review` e `PATCH /api/suggestions/[suggestionId]/review` funcionais, com checagem de role
- Tela de fila consolidada (`/revisao`) e tela por paciente (`/pacientes/[patientId]/insights`)

## Arquivos tocados
- `app/api/patients/[patientId]/review-queue/route.ts` (criar)
- `app/api/insights/[insightId]/review/route.ts` (criar)
- `app/api/suggestions/[suggestionId]/review/route.ts` (criar)
- `app/(dashboard)/revisao/page.tsx` (criar)
- `app/(dashboard)/pacientes/[patientId]/insights/page.tsx` (criar)
- `components/review/insight-review-card.tsx`, `suggestion-review-card.tsx` (criar)

## Tabelas de banco tocadas
Nenhuma tabela nova — apenas leitura/atualização de `insights` e `suggestions` (já criadas pelo MP-005 e MP-006; este componente não altera schema).

## Variáveis de ambiente necessárias
Nenhuma.

## Contrato de Handoff
O MP-008 (Plano de Tratamento) consome `suggestions` com `status = 'approved'` para montar o plano ativo. Exemplo real do que fica disponível após aprovação:
```json
{ "id": "5e6f7a8b-...", "type": "suplementacao", "content": {"suplemento":"Sulfato ferroso","doseSugerida":"40mg elementar/dia"}, "status": "approved", "reviewedBy": "a1b2c3d4-...", "reviewedAt": "2026-07-25T10:00:00.000Z" }
```

## Critérios de Aceite (testáveis)
- [ ] `GET /api/patients/[patientId]/review-queue` retorna insights ordenados por severidade (crítico primeiro)
- [ ] `PATCH /api/insights/[insightId]/review` com `action: "approve"` por usuário `medico` muda `status` para `approved`
- [ ] Mesma chamada por usuário `staff` retorna `403`
- [ ] `action: "edit"` sem `editedText` retorna `400`
- [ ] `action: "edit"` válido atualiza `generated_text` e `status: "edited_by_physician"`

## Como testar e validar
1. Ter insights/suggestions `pending_review` já existentes (do MP-005/MP-006) para um paciente.
2. `curl http://localhost:3000/api/patients/<patientId>/review-queue -b cookies_medico.txt` — esperado: array de insights com suggestions aninhadas, ordenado por severidade.
3. Aprovar um insight:
   ```
   curl -X PATCH http://localhost:3000/api/insights/<insightId>/review -b cookies_medico.txt -H "Content-Type: application/json" -d '{"action":"approve"}'
   ```
   Esperado: `200`, e `SELECT status FROM insights WHERE id = '<insightId>'` retorna `approved`.
4. Repetir o passo 3 logado como usuário `staff` — esperado: `403 { "error": "acao_nao_permitida_para_staff" }`.
5. Testar edição:
   ```
   curl -X PATCH http://localhost:3000/api/insights/<insightId>/review -b cookies_medico.txt -H "Content-Type: application/json" -d '{"action":"edit","editedText":"Texto revisado pelo médico com ajuste clínico."}'
   ```
   Esperado: `200`, `generated_text` atualizado, `status: "edited_by_physician"`.
6. Testar edição sem `editedText` — esperado `400`.
7. Repetir passos 3-6 trocando `insights` por `suggestions` no path, usando um `suggestionId` real.

## Mocks necessários para testar isolado
Se MP-005/MP-006 ainda não estiverem gerando dado real, insira manualmente 2-3 linhas de teste em `insights` e `suggestions` via SQL com `status = 'pending_review'`, usando os exemplos de payload já documentados acima.
