# Fase 0 · Correções urgentes (16/10/2026)

Mudanças pequenas e pontuais, sem alterar nenhuma tela. Publique esta versão no lugar da atual.

| Arquivo | O que mudou | Por quê |
| --- | --- | --- |
| `app/api/core/route.ts` | A leitura (GET) agora exige login com perfil Administração ou Gestão. Funcionários, salários, folha e retiradas só voltam para Administração. | Antes, qualquer pessoa logada, inclusive vendedora, lia salários e folha pelo navegador. |
| `app/api/core/route.ts` | Importação de vendas apaga e regrava o mês em um único lote atômico (ou grava tudo, ou nada) e busca as vendedoras uma vez só. | Antes, uma falha no meio deixava o mês com vendas faltando. |
| `app/api/core/route.ts` | A data padrão usa o fuso de São Paulo. | Depois das 21h o sistema já considerava o dia seguinte. |
| `app/api/receipts/route.ts` | Todas as operações (ler, criar, editar, apagar) exigem perfil Administração ou Conferência. O nome de quem conferiu vem do login real. | Antes, a rota não checava permissão nenhuma e tratava todo mundo como "admin". |
| `app/api/crm/route.ts` | Data de contato padrão no fuso de São Paulo. | Mesmo problema do horário. |
| `app/folha-comissao/page.tsx` | Mês padrão da folha no fuso de São Paulo. | No último dia do mês, à noite, abria o mês seguinte. |
| `app/page.tsx`, `app/globals.css` | "Outubro de 2026" em vez de "Outubro De 2026". | Detalhe visual. |

Perfil Gestão continua vendo o fluxo financeiro, as vendas e a análise como antes.
