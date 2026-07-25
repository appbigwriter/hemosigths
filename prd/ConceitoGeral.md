## Conceito Geral — Hemograma Insights

**O que é, numa frase:** uma plataforma que transforma o hemograma — o exame mais pedido e mais subutilizado da medicina — numa ferramenta de acompanhamento contínuo de saúde, em vez de uma foto isolada que o médico olha uma vez e esquece.

### O problema que resolve

O hemograma é riquíssimo em dado, mas pobre em uso. Na prática:
- O médico olha o exame, vê "dentro da normalidade" e segue em frente — mesmo quando há uma tendência de queda ao longo de anos que só fica óbvia se alguém comparar os exames lado a lado.
- Cada exame vira um PDF solto, sem conexão com os anteriores nem com o que o paciente relatou na consulta.
- Sinais tratáveis com intervenção simples (ferro, B12, D, ajuste de dieta) passam despercebidos porque não há tempo de consulta pra cruzar biomarcador + sintoma + histórico de vida do paciente.
- O paciente sai da consulta sem entender o que os números significam, e sem nenhum jeito de acompanhar se a conduta está funcionando.

### O que o sistema propõe

Fechar esse ciclo em quatro movimentos:

1. **Capturar** — qualquer hemograma em PDF vira dado estruturado, de qualquer laboratório.
2. **Revelar** — gráficos comparam o exame atual com o histórico do paciente e com os parâmetros de referência, tornando visível o que estava escondido em números soltos.
3. **Interpretar** — cruza os achados com a anamnese do paciente para propor hipóteses e sugestões (exame complementar, suplementação, dieta), sempre em linguagem clínica rastreável.
4. **Acompanhar** — depois que o médico aprova uma conduta, o sistema mede a evolução ao longo do tempo e mostra, com dado real, se está funcionando.

### Princípio central: copiloto, não piloto automático

O sistema nunca decide sozinho. Ele organiza, cruza e sugere — o médico aprova, edita ou rejeita. Isso não é só cautela regulatória: é o que faz o produto ser adotado. Nenhum profissional de saúde vai usar uma ferramenta que tenta substituir seu julgamento clínico; vai usar (e pagar por) uma que economiza o tempo de fazer manualmente o que ele já faria — olhar histórico, cruzar sintoma com exame, redigir a sugestão.

### Para quem é

| Perfil | O que ganha |
|---|---|
| **Médico clínico geral / endocrinologista / nutrólogo** | Visão longitudinal do paciente em segundos, achados pré-mastigados com evidência citada, menos tempo de "detetive" em cada consulta |
| **Clínica/consultório (o tenant)** | Diferencial competitivo — oferece acompanhamento contínuo, não só consulta pontual; retenção de paciente maior |
| **Nutricionista integrado à clínica** | Dado laboratorial já cruzado com anamnese alimentar, pronto pra desenhar dieta customizada |
| **Paciente** | Entende seus próprios números, vê evolução visual do tratamento, sente que está sendo acompanhado entre uma consulta e outra |

### O que diferencia isso de "só um dashboard de exames"

- **Rastreabilidade**: toda sugestão cita a regra clínica e a fonte que a gerou — não é caixa-preta de IA "achando" coisa.
- **Continuidade**: o valor não está no exame isolado, está na linha do tempo — é o mesmo princípio que torna um Apple Watch mais útil que um check-up anual.
- **Fechamento de loop**: a maioria das ferramentas de exame para na visualização. Aqui, a sugestão vira plano, o plano vira acompanhamento, e o acompanhamento vira prova visual de resultado — isso é o que justifica cobrança recorrente da clínica.

### Modelo de negócio (esboço)

SaaS multi-tenant por clínica, com plano por volume de pacientes ativos/exames processados por mês — trial inicial pra prova de valor rápida (primeiro upload já mostra o "uau" do gráfico comparativo, antes mesmo de precisar configurar o motor de sugestões).

### Posicionamento em uma linha

*"O hemograma sempre teve a resposta. Faltava alguém prestando atenção nele o tempo todo."*

