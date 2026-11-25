-- Dados puxados do HeraDash (PDV da loja) de hora em hora pela função hera-sincronizar.
create table if not exists public.hera_dias (
  data          date not null,
  loja          int  not null,
  faturamento   numeric(14,2) not null default 0,
  caixa         jsonb not null default '[]',   -- [{x: tipo de documento, y: valor}]
  vendedoras    jsonb not null default '[]',   -- [{x, y}]
  clientes      jsonb not null default '[]',   -- [{nome, valor, vendas, pecas}]
  atualizado_em timestamptz not null default now(),
  primary key (data, loja)
);

create table if not exists public.hera_meses (
  mes           date not null check (extract(day from mes) = 1),
  loja          int  not null,
  metricas      jsonb,                          -- VALOR_TOTAL, PREVISAO, QUANTIDADE, ATENDIMENTOS, TICKET_MEDIO, MEDIA_DIA
  caixa         jsonb not null default '[]',
  vendedoras    jsonb not null default '[]',
  produtos      jsonb not null default '[]',    -- ranking de produtos (curva ABC)
  subgrupos     jsonb not null default '[]',
  atualizado_em timestamptz not null default now(),
  primary key (mes, loja)
);

create table if not exists public.hera_sincronizacoes (
  id      bigint generated always as identity primary key,
  inicio  timestamptz not null default now(),
  fim     timestamptz,
  ok      boolean,
  origem  text,
  erro    text,
  resumo  jsonb
);

-- Sessão do robô no HeraDash: só a função (chave de serviço) lê e grava.
create table if not exists public.hera_sessao (
  id      int primary key default 1 check (id = 1),
  cookie  text,
  expira  timestamptz
);

alter table public.hera_dias enable row level security;
alter table public.hera_meses enable row level security;
alter table public.hera_sincronizacoes enable row level security;
alter table public.hera_sessao enable row level security;

create policy hera_dias_ver on public.hera_dias for select to authenticated
  using (public.tem_permissao('comercial', 'ver') or public.tem_permissao('financeiro', 'ver'));
create policy hera_meses_ver on public.hera_meses for select to authenticated
  using (public.tem_permissao('comercial', 'ver') or public.tem_permissao('financeiro', 'ver'));
create policy hera_sinc_ver on public.hera_sincronizacoes for select to authenticated
  using (public.tem_permissao('comercial', 'ver') or public.tem_permissao('financeiro', 'ver'));

create index if not exists hera_sinc_inicio on public.hera_sincronizacoes (inicio desc);
