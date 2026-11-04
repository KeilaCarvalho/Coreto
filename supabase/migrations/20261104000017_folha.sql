-- =====================================================================
-- Folha: comissão das vendedoras e vale-transporte + ajuda de custo.
-- Só quem tem "aprovar" em Pessoas (administração) vê e mexe.
--   folha_regras  → a regra de cada pessoa (uma vez só)
--   folhas        → a folha de cada mês (competência) e o período do VT
--   folha_pessoas → ajustes do mês por pessoa (realizado, dias de VT)
--   folha_itens   → o que muda no mês: retiradas, adiantamentos, prêmios, descontos
-- =====================================================================

create table public.folha_regras (
  pessoa_id           uuid primary key references public.pessoas(id) on delete cascade,
  ativo               boolean not null default true,
  comissao_percentual numeric(6,4) check (comissao_percentual is null or comissao_percentual between 0 and 1),
  nome_no_fluxo       text,            -- como a vendedora aparece na Equipe do fluxo financeiro ("Rose")
  recebe_vt           boolean not null default false,
  vt_conta_sabado     boolean not null default true,
  vt_tarifa           numeric(8,2) not null default 8.60 check (vt_tarifa >= 0),
  vt_desconta         boolean not null default true,       -- desconto de 6% do salário (lei do VT)
  salario_base        numeric(10,2) check (salario_base is null or salario_base >= 0),
  vt_desconto_valor   numeric(8,2) check (vt_desconto_valor is null or vt_desconto_valor >= 0), -- usado sem salário base
  ajuda_custo         numeric(10,2) not null default 0 check (ajuda_custo >= 0),
  bonus_fixo          numeric(10,2) not null default 0 check (bonus_fixo >= 0),
  observacao          text,
  atualizado_em       timestamptz not null default now()
);

create table public.folhas (
  mes         date primary key check (extract(day from mes) = 1),
  vt_inicio   date not null,
  vt_fim      date not null check (vt_fim >= vt_inicio),
  feriados    date[] not null default '{}',
  fechada_em  timestamptz,
  criado_em   timestamptz not null default now()
);

create table public.folha_pessoas (
  mes        date not null references public.folhas(mes) on delete cascade,
  pessoa_id  uuid not null references public.pessoas(id) on delete cascade,
  realizado  numeric(12,2),            -- substitui o valor da Equipe do fluxo
  dias_vt    integer check (dias_vt is null or dias_vt between 0 and 31),
  primary key (mes, pessoa_id)
);

create table public.folha_itens (
  id         bigserial primary key,
  mes        date not null references public.folhas(mes) on delete cascade,
  pessoa_id  uuid not null references public.pessoas(id) on delete cascade,
  parte      text not null check (parte in ('comissao', 'vt')),
  tipo       text not null check (tipo in ('retirada', 'adiantamento', 'desconto', 'premio', 'diferenca', 'bonus', 'outro')),
  descricao  text check (length(descricao) <= 200),
  valor      numeric(12,2) not null check (valor <> 0),   -- negativo desconta, positivo soma
  criado_em  timestamptz not null default now()
);
create index folha_itens_mes on public.folha_itens (mes, pessoa_id);

do $$
declare t text;
begin
  foreach t in array array['folha_regras', 'folhas', 'folha_pessoas', 'folha_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy admin on public.%I for all to authenticated
                    using (public.tem_permissao('pessoas', 'aprovar')) with check (public.tem_permissao('pessoas', 'aprovar'))$p$, t);
  end loop;
end $$;
grant usage on sequence public.folha_itens_id_seq to authenticated;

create trigger folha_regras_auditoria after insert or update or delete on public.folha_regras
  for each row execute function public.registrar_auditoria();
create trigger folha_itens_auditoria after insert or update or delete on public.folha_itens
  for each row execute function public.registrar_auditoria();
