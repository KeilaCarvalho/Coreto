# Coreto · Sistema de gestão

Sistema interno da Coreto, construído sobre a base descrita no documento
*Coreto — Diagnóstico e Arquitetura do Sistema* (Fase 1: fundação).

- **Aplicação:** Next.js 16 (React 19), hospedada na Hostinger.
- **Banco, login e arquivos:** Supabase (Postgres), região São Paulo.
- **Segurança:** as permissões ficam no próprio banco (Row Level Security). Cada leitura e gravação é checada lá, inclusive se alguém tentar acessar o banco por fora das telas.

## O que já funciona

| Área | O que faz |
| --- | --- |
| Login | Entrar, pedir acesso. O **primeiro login vira administrador**; os seguintes ficam bloqueados até a liberação. |
| Início | Saudação, números do catálogo e do estoque, pessoas aguardando acesso, últimas movimentações. |
| Produto → Catálogo | Cadastro do modelo com grade. O sistema cria sozinho as variantes cor × tamanho, cada uma com SKU (`VL001-VAG-M`) e código de barras EAN-13 interno. Grade com saldo por cor e tamanho. |
| Estoque → Saldos | Peças por variante e por local (Loja, Depósito, Marketing, cada facção). |
| Estoque → Movimentações | O livro de estoque. Entrada de produção, transferência, ajustes de inventário e perdas. Leitor de código de barras funciona direto no campo. Não aceita saldo negativo. Nada se apaga; erros se corrigem com estorno. |
| Pessoas → Equipe | Cadastro único de pessoas (substitui usuários + funcionários do sistema antigo). |
| Configurações → Acessos | Liberar logins, escolher perfil, pré-cadastrar acesso por e-mail e ver a matriz de permissões. |
| Configurações → Cadastros | Cores (com código para o SKU), grades de tamanho, categorias (com NCM) e coleções. |
| Configurações → Parceiros | Facções, fornecedores, fotógrafos, modelos, influenciadoras. Cada facção ganha seu local de estoque. |

Os itens das próximas fases (quadro de produção, facções, caixa com NFC-e, marketing,
folha, financeiro) já aparecem no menu, marcados com a fase em que chegam.

## Perfis

| Perfil | Pode |
| --- | --- |
| Administração | Tudo, inclusive acessos e permissões |
| Gestão | Ver tudo; operar Comercial e Financeiro |
| Produção | Produtos, produção e facções |
| Conferência | Lançar entradas no estoque |
| Vendedora | Caixa, vendas e clientes; consultar produtos e estoque |
| Marketing | Peças para fotos e sessões |

A matriz completa está em `supabase/migrations/20261016000003_dados_iniciais.sql` e
na tela Configurações → Acessos.

## Como colocar no ar

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) na região **South America (São Paulo)**.
   Use um plano pago para ter backup diário.
2. Em **SQL Editor**, rode os três arquivos de `supabase/migrations/` **na ordem do nome**.
   (Ou, com a CLI do Supabase instalada: `supabase link` e depois `supabase db push`.)
3. Em **Authentication → URL Configuration**, coloque em *Site URL* o endereço do sistema
   na Hostinger (ex.: `https://sistema.coreto.com.br`) e, em *Redirect URLs*,
   `https://sistema.coreto.com.br/auth/confirmar` (o link de confirmação de e-mail volta para lá).
4. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public*.

### 2. Hostinger

O plano precisa aceitar aplicações Node.js (Business ou Cloud; para o caixa, prefira Cloud).

1. Suba esta pasta para um repositório no GitHub.
2. No hPanel: **Websites → Adicionar site → Node.js Web App → Importar do GitHub**.
3. Configuração de build: comando `npm run build`, comando de início `npm start`, Node 22.
4. Em variáveis de ambiente, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Publique. **Entre primeiro com o login da administração**: o primeiro login do sistema vira administrador.

### 3. Rodar no computador (opcional)

```bash
cp .env.example .env.local   # preencha com os dados do Supabase
npm install
npm run dev                  # abre em http://localhost:3000
```

## Testes do banco

Os testes criam um banco limpo, aplicam as migrações e conferem 30 regras: permissões
por perfil, saldo que não fica negativo, livro de estoque que não aceita alteração,
estorno, facção que não devolve mais do que recebeu, último administrador protegido,
histórico de alterações.

```bash
PGHOST=localhost PGPORT=5432 npm run test:db
```

## Organização do código

```
app/
  entrar/, aguardando/          login e acesso pendente
  (sistema)/                    telas com menu (exigem login liberado)
    produto/  estoque/  pessoas/  configuracoes/  em-breve/
  acoes/auth.ts                 entrar, pedir acesso, sair
components/                     menu, formulários, cabeçalho
lib/
  sessao.ts                     usuário logado e permissões
  navegacao.ts                  menu e fases
  supabase/                     conexão com o Supabase
supabase/migrations/            banco: tabelas, permissões e dados iniciais
tests/db/                       testes do banco
```

## Próximo passo (ainda na Fase 1)

Migrar os dados do sistema antigo: modelos e cores digitados nos recebimentos viram
produtos do catálogo; funcionários e usuários viram pessoas; vendas e folha passam a
apontar para essas pessoas.
