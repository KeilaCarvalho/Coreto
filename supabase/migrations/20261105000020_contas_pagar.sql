-- Contas a pagar importadas do Conta Azul ("Visão Contas a Pagar", .xls/.xlsx).
-- Cada importação substitui as contas com vencimento dentro do período do arquivo.

create table public.contas_pagar (
  id bigint generated always as identity primary key,
  fornecedor text not null default '',
  descricao text not null default '',
  categoria text,
  conta text,
  forma text,
  competencia date,
  vencimento date not null,
  previsto date,
  situacao text,
  valor numeric(12,2) not null default 0,
  valor_pago numeric(12,2) not null default 0,
  em_aberto numeric(12,2) not null default 0,
  pago_em date,
  nota_fiscal text,
  observacao text,
  importado_em timestamptz not null default now(),
  importado_por uuid default auth.uid()
);
create index contas_pagar_venc on public.contas_pagar (vencimento);

alter table public.contas_pagar enable row level security;
create policy ver on public.contas_pagar for select to authenticated using (public.tem_permissao('financeiro', 'ver'));
create policy criar on public.contas_pagar for insert to authenticated with check (public.tem_permissao('financeiro', 'criar'));
create policy apagar on public.contas_pagar for delete to authenticated using (public.tem_permissao('financeiro', 'criar'));

-- Troca as contas do período [de, ate] pelas do arquivo, numa transação só.
create or replace function public.importar_contas_pagar(p_de date, p_ate date, p_contas jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.tem_permissao('financeiro', 'criar') then raise exception 'Sem permissão para importar contas.'; end if;
  delete from public.contas_pagar where vencimento between p_de and p_ate;
  insert into public.contas_pagar (fornecedor, descricao, categoria, conta, forma, competencia, vencimento, previsto, situacao,
    valor, valor_pago, em_aberto, pago_em, nota_fiscal, observacao)
  select coalesce(c->>'fornecedor',''), coalesce(c->>'descricao',''), c->>'categoria', c->>'conta', c->>'forma',
    (c->>'competencia')::date, (c->>'vencimento')::date, (c->>'previsto')::date, c->>'situacao',
    coalesce((c->>'valor')::numeric,0), coalesce((c->>'valor_pago')::numeric,0), coalesce((c->>'em_aberto')::numeric,0),
    (c->>'pago_em')::date, c->>'nota_fiscal', c->>'observacao'
  from jsonb_array_elements(p_contas) c;
  get diagnostics n = row_count;
  return n;
end $$;
