# MP-001 — Auth & Fundação Multi-tenant

## Status
pendente

## Depende de
nenhum

## Contexto completo (leia antes de começar)
Este é o componente mais básico de um sistema chamado "Hemograma Insights": uma plataforma SaaS onde várias clínicas médicas (cada uma um "tenant") usam o mesmo sistema, mas cada clínica só pode ver os dados dela mesma — nunca os de outra clínica. Este mini PRD cria a base disso: as tabelas de clínica e usuário, o login, e o mecanismo que garante que uma clínica nunca vê dado de outra (isolamento por Row-Level Security no Postgres).

Sotaque técnico do projeto: Next.js 14 (App Router), TypeScript, Tailwind CSS, Postgres, ORM Drizzle, autenticação com NextAuth (Auth.js). Todo código em TypeScript com tipagem explícita (evite `any`). Nomes de arquivo em kebab-case, nomes de função em camelCase, nomes de tabela em snake_case (já definidos no schema abaixo — não invente nomes novos).

## Objetivo
Permitir que um usuário (médico, staff ou admin de clínica) faça login, e garantir que toda query ao banco feita por ele só retorna dados da clínica (`clinic_id`) à qual pertence.

## Entradas
Nenhuma entrada de outro mini PRD — este é o primeiro componente. Entrada é o próprio `DATABASE_URL` do ambiente Postgres já provisionado.

Exemplo de variável de ambiente que você vai receber configurada:
```
DATABASE_URL=postgres://usuario:senha@localhost:5432/hemograma_insights
```

## Elementos necessários
- Node.js 20+ instalado
- Projeto Next.js 14 já inicializado com `npx create-next-app@14 --typescript --tailwind --app` (se ainda não existir, crie como parte deste mini PRD)
- Instalar dependências exatas:
  ```
  npm install drizzle-orm pg
  npm install -D drizzle-kit @types/pg
  npm install next-auth@beta
  npm install zod bcryptjs
  npm install -D @types/bcryptjs
  ```
- Variáveis de ambiente necessárias (criar arquivo `.env.local` na raiz):
  - `DATABASE_URL` — string de conexão Postgres (fornecida pelo ambiente)
  - `NEXTAUTH_SECRET` — gerar com `openssl rand -base64 32`
  - `NEXTAUTH_URL` — `http://localhost:3000` em desenvolvimento
- Banco Postgres já criado e acessível (assuma que existe; se a conexão falhar, reporte o erro exato, não tente criar o banco)

## Funcionalidade detalhada (passo a passo)

1. Criar `lib/db/schema.ts` com o schema Drizzle espelhando exatamente estas duas tabelas (usar `pgTable` do drizzle-orm):
   ```sql
   CREATE TABLE clinics (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     cnpj TEXT,
     plan TEXT NOT NULL DEFAULT 'trial',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     active BOOLEAN NOT NULL DEFAULT true
   );

   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
     email TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     full_name TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('admin_clinica','medico','staff')),
     crm_number TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     active BOOLEAN NOT NULL DEFAULT true
   );
   ```
   Nota: adicionamos `password_hash` (não estava explícito no MP-000, mas é obrigatório pra login por senha).

2. Rodar `npx drizzle-kit generate` e depois `npx drizzle-kit migrate` pra aplicar a migration no banco.

3. Criar `lib/db/client.ts` exportando um client Drizzle configurado com o pool `pg` usando `DATABASE_URL`.

4. Criar `lib/db/rls.ts` exportando a função `withClinicContext<T>(clinicId: string, fn: (tx) => Promise<T>): Promise<T>` que:
   - Abre uma transação
   - Executa `SET LOCAL app.current_clinic_id = '<clinicId>'`
   - Executa `fn(tx)` dentro dessa transação
   - Toda query feita dentro de `fn` deve respeitar RLS automaticamente

5. Aplicar RLS nas tabelas via SQL raw (incluir num arquivo de migration separado `lib/db/migrations/0001_rls.sql`):
   ```sql
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_users ON users
     USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
   ```
   Nota: `clinics` NÃO tem RLS (é a tabela que define os tenants, precisa ser lida sem filtro pra resolver login).

6. Criar endpoint de cadastro de clínica: `app/api/clinics/route.ts`, método POST, recebendo `{ name: string, adminEmail: string, adminPassword: string, adminFullName: string }`:
   - Validar com Zod: `name` mínimo 2 caracteres, `adminEmail` formato de e-mail válido, `adminPassword` mínimo 8 caracteres
   - Se `adminEmail` já existir na tabela `users` (contra qualquer clínica), retornar `400 { error: "email_ja_cadastrado" }`
   - Se válido: criar linha em `clinics` (plan = 'trial'), depois criar usuário com `role = 'admin_clinica'` vinculado a essa clínica, senha com hash `bcryptjs.hash(password, 10)`
   - Retornar `201 { clinicId: string, userId: string }`

7. Configurar NextAuth em `app/api/auth/[...nextauth]/route.ts` com `Credentials` provider:
   - `authorize({email, password})`: busca usuário por email na tabela `users` (sem filtro de RLS, usar conexão admin direta pra esse passo específico, já que login precisa achar o usuário antes de saber o `clinic_id`), compara hash com `bcryptjs.compare`
   - Se válido, retornar objeto de sessão com `{ id, email, clinicId, role }`
   - Configurar `session.strategy: "jwt"` e incluir `clinicId` e `role` no callback `jwt` e `session`

8. Criar middleware `middleware.ts` que bloqueia acesso a rotas `/dashboard/*` e `/api/*` (exceto `/api/auth/*` e `/api/clinics`) se não houver sessão válida.

9. Criar tela de login em `app/(auth)/login/page.tsx` — formulário simples com email/senha, chamando `signIn('credentials', {...})` do NextAuth.

## Saídas / Entregáveis
- Tabelas `clinics` e `users` criadas no banco, com RLS ativo em `users`
- Endpoint `POST /api/clinics` funcional
- Sistema de login funcional via NextAuth (`/login`)
- Função utilitária `withClinicContext()` exportada de `lib/db/rls.ts`, pronta para ser usada por TODOS os mini PRDs seguintes sempre que precisarem tocar dado tenant-scoped

## Arquivos tocados
- `lib/db/schema.ts` (criar)
- `lib/db/client.ts` (criar)
- `lib/db/rls.ts` (criar)
- `lib/db/migrations/0001_rls.sql` (criar)
- `app/api/clinics/route.ts` (criar)
- `app/api/auth/[...nextauth]/route.ts` (criar)
- `middleware.ts` (criar)
- `app/(auth)/login/page.tsx` (criar)
- `.env.local` (criar, não versionar)

## Tabelas de banco tocadas
- `clinics` (dono deste mini PRD)
- `users` (dono deste mini PRD)

## Variáveis de ambiente necessárias
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

## Contrato de Handoff
Todo mini PRD seguinte que precisar tocar dado tenant-scoped deve:
1. Importar `withClinicContext` de `lib/db/rls.ts`
2. Obter a sessão do usuário logado via `auth()` do NextAuth (retorna `{ user: { id, email, clinicId, role } }`)
3. Envolver toda query Drizzle assim:
   ```ts
   const result = await withClinicContext(session.user.clinicId, async (tx) => {
     return tx.select().from(patients); // exemplo — RLS filtra automaticamente
   });
   ```

Exemplo real de sessão retornada por `auth()`:
```json
{
  "user": {
    "id": "a1b2c3d4-0000-4000-8000-000000000001",
    "email": "dra.ana@clinicaexemplo.com.br",
    "clinicId": "f1e2d3c4-0000-4000-8000-000000000009",
    "role": "medico"
  }
}
```

## Critérios de Aceite (testáveis)
- [ ] `POST /api/clinics` com payload válido retorna `201` com `clinicId` e `userId` UUID válidos
- [ ] `POST /api/clinics` com email já existente retorna `400 { error: "email_ja_cadastrado" }`
- [ ] Login via `/login` com credenciais corretas redireciona para `/dashboard` (ou rota autenticada) com sessão contendo `clinicId`
- [ ] Login com senha errada retorna erro visível na tela, sem redirecionar
- [ ] Query feita dentro de `withClinicContext(clinicIdA, ...)` NUNCA retorna linhas de `clinicIdB`, mesmo que a tabela tenha linhas de ambos

## Como testar e validar
1. Rodar `npm install && npm run dev`
2. Criar duas clínicas de teste:
   ```
   curl -X POST http://localhost:3000/api/clinics -H "Content-Type: application/json" -d '{"name":"Clinica A","adminEmail":"admin@a.com","adminPassword":"senha1234","adminFullName":"Admin A"}'
   curl -X POST http://localhost:3000/api/clinics -H "Content-Type: application/json" -d '{"name":"Clinica B","adminEmail":"admin@b.com","adminPassword":"senha1234","adminFullName":"Admin B"}'
   ```
   Resultado esperado: ambos retornam `201` com JSON contendo `clinicId` e `userId` (UUIDs diferentes entre A e B).
3. Testar duplicidade de e-mail: repetir a primeira chamada acima. Resultado esperado: `400 { "error": "email_ja_cadastrado" }`.
4. Abrir `http://localhost:3000/login` no navegador, entrar com `admin@a.com` / `senha1234`. Resultado esperado: redirecionamento pra área autenticada, sem mensagem de erro.
5. Testar senha errada: tentar login com `admin@a.com` / `senhaerrada`. Resultado esperado: mensagem de erro na tela, sem redirecionamento, sem lançar exceção não tratada no console do servidor.
6. Testar isolamento RLS diretamente no banco (via `psql` ou client SQL):
   ```sql
   SET app.current_clinic_id = '<uuid da clinica A>';
   SELECT * FROM users; -- deve retornar só o admin da clínica A
   SET app.current_clinic_id = '<uuid da clinica B>';
   SELECT * FROM users; -- deve retornar só o admin da clínica B
   ```
   Se a segunda query retornar usuário da clínica A, o RLS está mal configurado — pare e revise a policy.

## Mocks necessários para testar isolado
Nenhum — este é o primeiro mini PRD, não tem dependência de outro componente. O único "mock" é o próprio banco Postgres de desenvolvimento, que deve estar vazio antes do passo 2 (rodar migration em banco limpo).
