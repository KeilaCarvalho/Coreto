alter table public.contas_pagar add column if not exists chave text;
create index if not exists contas_pagar_chave on public.contas_pagar (chave);

create table if not exists public.contas_pagar_nota_ok (
  chave text primary key,
  marcado_em timestamptz not null default now(),
  marcado_por uuid default auth.uid()
);
alter table public.contas_pagar_nota_ok enable row level security;
create policy ver on public.contas_pagar_nota_ok for select to authenticated using (public.tem_permissao('financeiro', 'ver'));
create policy criar on public.contas_pagar_nota_ok for insert to authenticated with check (public.tem_permissao('financeiro', 'criar'));
create policy apagar on public.contas_pagar_nota_ok for delete to authenticated using (public.tem_permissao('financeiro', 'criar'));

create or replace function public.chave_conta_pagar(p_fornecedor text, p_descricao text, p_vencimento date, p_valor numeric)
returns text language sql immutable as $$
  select md5(lower(coalesce(p_fornecedor,'')) || '|' || lower(coalesce(p_descricao,'')) || '|' || to_char(p_vencimento, 'YYYY-MM-DD') || '|' || round(coalesce(p_valor,0), 2)::text)
$$;

-- Contas do mês no Fluxo vêm do Conta Azul: pagas e em aberto por mês de vencimento.
create or replace function public.contas_pagar_para_fluxo(p_de date, p_ate date)
returns void language sql security invoker set search_path = public as $$
  insert into public.fluxo_meses (mes, contas_pagas, contas_a_pagar, atualizado_por, atualizado_em)
  select date_trunc('month', vencimento)::date, round(sum(valor_pago), 2), round(sum(em_aberto), 2), auth.uid(), now()
  from public.contas_pagar
  where vencimento between date_trunc('month', p_de)::date and (date_trunc('month', p_ate) + interval '1 month - 1 day')::date
  group by 1
  on conflict (mes) do update set contas_pagas = excluded.contas_pagas, contas_a_pagar = excluded.contas_a_pagar,
    atualizado_por = excluded.atualizado_por, atualizado_em = now();
$$;

create or replace function public.importar_contas_pagar(p_de date, p_ate date, p_contas jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if not public.tem_permissao('financeiro', 'criar') then raise exception 'Sem permissão para importar contas.'; end if;
  delete from public.contas_pagar where vencimento between p_de and p_ate;
  insert into public.contas_pagar (fornecedor, descricao, categoria, conta, forma, competencia, vencimento, previsto, situacao,
    valor, valor_pago, em_aberto, pago_em, nota_fiscal, observacao, chave)
  select coalesce(c->>'fornecedor',''), coalesce(c->>'descricao',''), c->>'categoria', c->>'conta', c->>'forma',
    (c->>'competencia')::date, (c->>'vencimento')::date, (c->>'previsto')::date, c->>'situacao',
    coalesce((c->>'valor')::numeric,0), coalesce((c->>'valor_pago')::numeric,0), coalesce((c->>'em_aberto')::numeric,0),
    (c->>'pago_em')::date, c->>'nota_fiscal', c->>'observacao',
    public.chave_conta_pagar(c->>'fornecedor', c->>'descricao', (c->>'vencimento')::date, (c->>'valor')::numeric)
  from jsonb_array_elements(p_contas) c;
  get diagnostics n = row_count;
  perform public.contas_pagar_para_fluxo(p_de, p_ate);
  return n;
end $$;
