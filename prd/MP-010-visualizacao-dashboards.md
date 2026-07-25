# MP-010 — Visualização & Dashboards

## Status
pendente

## Depende de
MP-004 (Motor de Extração/Parsing de PDF), MP-009 (Acompanhamento & Evolução)

## Contexto completo (leia antes de começar)
"Hemograma Insights" já tem, até este ponto, resultados de exame estruturados (`exam_results`, do MP-004) e pontos de acompanhamento ao longo do tempo (`tracking_entries`, do MP-009). Este mini PRD é a camada VISUAL — os gráficos que fazem o médico enxergar em segundos o que estava escondido em números soltos: um radar comparando o exame atual com a faixa de referência, uma linha de tendência temporal por biomarcador, e uma comparação lado a lado entre o exame atual e o anterior. Este componente é só leitura (nenhuma tabela nova, nenhuma escrita) — consome dado já existente e desenha.

Sotaque técnico: Next.js 14 (React Server/Client Components), TypeScript, Tailwind, biblioteca **Recharts** para os gráficos.

## Objetivo
Renderizar três visualizações no dashboard do paciente: radar por categoria de biomarcador, linha de tendência temporal, e comparação lado a lado entre exames.

## Entradas
Do MP-004, via endpoint a criar neste mini PRD que agrega `exam_results` por `lab_exam_id` (não existe ainda um endpoint de leitura agregada — só a gravação foi feita no MP-004, então a leitura estruturada para consumo do frontend é responsabilidade deste componente).
Do MP-009, via `GET /api/patients/[patientId]/tracking?metric=X` (já existe, contrato documentado lá).

Exemplo real de dado de entrada (resultado de exame, do MP-004):
```json
[
  { "biomarkerCode": "hb", "biomarkerName": "Hemoglobina", "value": 10.2, "unit": "g/dL", "refMin": 12.0, "refMax": 15.5, "flag": "low" },
  { "biomarkerCode": "vcm", "biomarkerName": "VCM", "value": 76.5, "unit": "fL", "refMin": 80.0, "refMax": 100.0, "flag": "low" }
]
```

## Elementos necessários
- Instalar: `npm install recharts`
- Nenhuma variável de ambiente nova

## Funcionalidade detalhada (passo a passo)

1. Criar `app/api/lab-exams/[labExamId]/results/route.ts`:
   - `GET`: retorna `exam_results` do exame, cada linha enriquecida com `biomarkerName` e `category` (via JOIN com `biomarker_catalog`). Formato de saída: array conforme exemplo do contexto acima.
2. Criar `app/api/lab-exams/[labExamId]/compare-previous/route.ts`:
   - `GET`: busca o `lab_exam_id` anterior do mesmo paciente (por `collected_at` mais recente antes do exame atual). Retorna um array combinando os dois exames por `biomarkerCode`:
     ```json
     [
       { "biomarkerCode": "hb", "biomarkerName": "Hemoglobina", "current": 10.2, "previous": 9.6, "deltaPercent": 6.25, "unit": "g/dL" }
     ]
     ```
     Se não houver exame anterior, retornar `{ hasPrevious: false, results: [] }`.
3. Criar `lib/charts/normalize-for-radar.ts` exportando `normalizeForRadar(results: ExamResult[]): RadarPoint[]`:
   - Para cada resultado, calcular um valor normalizado de 0 a 100 representando a posição do `value` dentro da faixa `refMin`-`refMax` (ex: `value = refMin` → 0, `value = refMax` → 100, `value` fora da faixa pode passar de 100 ou ser negativo, truncar em `[-20, 120]` para o gráfico não distorcer)
   - Agrupar por `category` (serie_vermelha, serie_branca, plaquetas) para gerar um radar por categoria
4. Criar `components/charts/radar-biomarcadores.tsx` (Client Component): recebe `RadarPoint[]` e renderiza `RadarChart` do Recharts, com a faixa de referência representada como área sombreada de 0-100.
5. Criar `components/charts/tendencia-temporal.tsx` (Client Component): recebe array de `tracking_entries` (do MP-009) para uma métrica específica, renderiza `LineChart` do Recharts com linha do valor ao longo do tempo e uma área sombreada representando `refMin`-`refMax` (buscar essa referência do `exam_results` mais recente do mesmo biomarcador, passado como prop adicional).
6. Criar `components/charts/comparativo-exames.tsx` (Client Component): recebe o array de `compare-previous`, renderiza `BarChart` pareado (barra do valor atual ao lado da barra do valor anterior, por biomarcador), com destaque de cor quando `deltaPercent` indica piora (ex: se o biomarcador está em `low` e o delta é negativo, ou está em `high` e o delta é positivo).
7. Criar tela `app/(dashboard)/pacientes/[patientId]/evolucao/page.tsx`: monta a página combinando os três componentes de gráfico, com um seletor de biomarcador para a tendência temporal (dropdown populado a partir de `biomarker_catalog`).

## Saídas / Entregáveis
- `GET /api/lab-exams/[labExamId]/results` e `GET /api/lab-exams/[labExamId]/compare-previous` funcionais
- Três componentes de gráfico reutilizáveis (`radar-biomarcadores`, `tendencia-temporal`, `comparativo-exames`)
- Tela de evolução do paciente

## Arquivos tocados
- `app/api/lab-exams/[labExamId]/results/route.ts` (criar)
- `app/api/lab-exams/[labExamId]/compare-previous/route.ts` (criar)
- `lib/charts/normalize-for-radar.ts` (criar)
- `components/charts/radar-biomarcadores.tsx`, `tendencia-temporal.tsx`, `comparativo-exames.tsx` (criar)
- `app/(dashboard)/pacientes/[patientId]/evolucao/page.tsx` (criar)

## Tabelas de banco tocadas
Nenhuma (componente só de leitura).

## Variáveis de ambiente necessárias
Nenhuma.

## Contrato de Handoff
Este é um componente "folha" — nenhum mini PRD depende da saída dele (é consumido diretamente pelo usuário final via UI). Não há contrato de handoff para outro mini PRD.

## Critérios de Aceite (testáveis)
- [ ] `GET /api/lab-exams/[labExamId]/results` retorna resultados com `biomarkerName` preenchido (via JOIN)
- [ ] `GET /api/lab-exams/[labExamId]/compare-previous` retorna `hasPrevious: false` quando não há exame anterior
- [ ] `normalizeForRadar` normaliza corretamente: `value == refMin` → `0`, `value == refMax` → `100`
- [ ] Tela de evolução renderiza os 3 gráficos sem erro de console para um paciente com pelo menos 2 exames
- [ ] Seletor de biomarcador na tendência temporal atualiza o gráfico ao trocar de opção

## Como testar e validar
1. `npm install recharts && npm run dev`
2. Ter pelo menos 2 exames processados (MP-004) para o mesmo paciente, com datas diferentes.
3. `curl http://localhost:3000/api/lab-exams/<labExamId>/results -b cookies.txt` — esperado: array com `biomarkerName` preenchido (não só `biomarkerCode`).
4. `curl http://localhost:3000/api/lab-exams/<labExamId mais recente>/compare-previous -b cookies.txt` — esperado: array com `current`, `previous`, `deltaPercent` calculados corretamente (`deltaPercent = ((current - previous) / previous) * 100`).
5. Testar sem exame anterior: usar o `labExamId` do PRIMEIRO exame do paciente — esperado: `{ "hasPrevious": false, "results": [] }`.
6. Testar `normalizeForRadar` isoladamente com um script: `normalizeForRadar([{value: 12, refMin: 12, refMax: 15.5, ...}])` — esperado: ponto com valor normalizado `0`.
7. Abrir `http://localhost:3000/pacientes/<patientId>/evolucao` no navegador — verificar visualmente que os 3 gráficos aparecem, sem erro no console do navegador (F12).
8. Trocar o biomarcador no seletor da tendência temporal — esperado: gráfico de linha atualiza pra refletir a nova métrica escolhida.

## Mocks necessários para testar isolado
Se MP-004/MP-009 ainda não estiverem completos, insira manualmente 2+ `exam_results` (mesmo biomarcador, datas diferentes, via `lab_exams` com `collected_at` diferentes) e algumas `tracking_entries` via SQL, para testar os componentes de gráfico isoladamente com dado real do banco.
