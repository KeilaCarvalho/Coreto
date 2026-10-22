-- =====================================================================
-- Relatórios de vendas importados do sistema da loja (PDF), mês a mês:
-- resumo por mês, comissão das vendedoras, curva ABC de produtos e
-- vendas peça a peça. Reimportar o mesmo mês substitui os dados dele.
-- =====================================================================

create table public.relatorios_importados (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('evolucao', 'comissao', 'curva_abc', 'vendas_dia')),
  mes           date,
  arquivo       text,
  linhas        int  not null default 0,
  importado_em  timestamptz not null default now(),
  importado_por uuid references public.pessoas(id) default public.pessoa_atual_id()
);
create index relatorios_importados_data on public.relatorios_importados (importado_em desc);
create index relatorios_importados_por on public.relatorios_importados (importado_por);

create table public.vendas_mensais (
  mes          date primary key,
  pecas        int not null default 0,
  devolucoes   int not null default 0,
  faturadas    int not null default 0,
  qtd_vendas   int not null default 0,
  valor_total  numeric(14,2) not null default 0,
  preco_medio  numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

create table public.comissoes_mensais (
  mes          date not null,
  codigo       text not null,
  vendedora    text not null,
  meta         numeric(14,2) not null default 0,
  vendas       numeric(14,2) not null default 0,
  comissao     numeric(12,2) not null default 0,
  percentual   numeric(6,2)  not null default 0,
  qtd_vendas   int not null default 0,
  qtd_pecas    int not null default 0,
  preco_medio  numeric(12,2) not null default 0,
  ticket_medio numeric(12,2) not null default 0,
  valor_pagar  numeric(12,2) not null default 0,
  primary key (mes, codigo)
);

create table public.produtos_vendidos_mes (
  mes         date not null,
  codigo      text not null,
  referencia  text,
  descricao   text not null,
  classe      text,
  quantidade  int not null default 0,
  custo       numeric(12,2) not null default 0,
  venda       numeric(12,2) not null default 0,
  percentual  numeric(8,4) not null default 0,
  primary key (mes, codigo)
);

create table public.vendas_itens (
  id              bigint generated always as identity primary key,
  mes             date not null,
  data            date not null,
  venda           text not null,
  codigo          text,
  referencia      text,
  produto         text not null,
  quantidade      int not null default 1,
  valor_produto   numeric(12,2) not null default 0,
  variacao_pct    numeric(7,2)  not null default 0,
  variacao_valor  numeric(12,2) not null default 0,
  valor_total     numeric(12,2) not null default 0
);
create index vendas_itens_mes on public.vendas_itens (mes, data);

-- Importa um relatório já lido. Só a gestão comercial (ou quem edita o financeiro).
create or replace function public.importar_vendas(p_tipo text, p_mes text, p_linhas jsonb, p_arquivo text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_mes date;
  n int := 0;
begin
  if not (public.tem_permissao('comercial', 'aprovar') or public.tem_permissao('financeiro', 'editar')) then
    raise exception 'Somente a gestão comercial pode importar relatórios de vendas.';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'O relatório não tem linhas para importar.';
  end if;
  if p_tipo <> 'evolucao' then
    if p_mes is null or p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Não achei o mês do relatório.'; end if;
    v_mes := (p_mes || '-01')::date;
  end if;

  if p_tipo = 'evolucao' then
    insert into public.vendas_mensais (mes, pecas, devolucoes, faturadas, qtd_vendas, valor_total, preco_medio)
    select ((l ->> 'mes') || '-01')::date, coalesce((l ->> 'pecas')::int, 0), coalesce((l ->> 'devolucoes')::int, 0),
           coalesce((l ->> 'faturadas')::int, 0), coalesce((l ->> 'qtd_vendas')::int, 0),
           coalesce((l ->> 'valor_total')::numeric, 0), coalesce((l ->> 'preco_medio')::numeric, 0)
    from jsonb_array_elements(p_linhas) l
    where (l ->> 'mes') ~ '^\d{4}-\d{2}$'
    on conflict (mes) do update set pecas = excluded.pecas, devolucoes = excluded.devolucoes, faturadas = excluded.faturadas,
      qtd_vendas = excluded.qtd_vendas, valor_total = excluded.valor_total, preco_medio = excluded.preco_medio, atualizado_em = now();
    get diagnostics n = row_count;

  elsif p_tipo = 'comissao' then
    delete from public.comissoes_mensais where mes = v_mes;
    insert into public.comissoes_mensais (mes, codigo, vendedora, meta, vendas, comissao, percentual, qtd_vendas, qtd_pecas, preco_medio, ticket_medio, valor_pagar)
    select distinct on (l ->> 'codigo') v_mes, l ->> 'codigo', trim(l ->> 'vendedora'), coalesce((l ->> 'meta')::numeric, 0), coalesce((l ->> 'vendas')::numeric, 0),
           coalesce((l ->> 'comissao')::numeric, 0), coalesce((l ->> 'percentual')::numeric, 0), coalesce((l ->> 'qtd_vendas')::int, 0),
           coalesce((l ->> 'qtd_pecas')::int, 0), coalesce((l ->> 'preco_medio')::numeric, 0), coalesce((l ->> 'ticket_medio')::numeric, 0),
           coalesce((l ->> 'valor_pagar')::numeric, 0)
    from jsonb_array_elements(p_linhas) l where coalesce(l ->> 'codigo', '') <> '';
    get diagnostics n = row_count;

  elsif p_tipo = 'curva_abc' then
    delete from public.produtos_vendidos_mes where mes = v_mes;
    insert into public.produtos_vendidos_mes (mes, codigo, referencia, descricao, classe, quantidade, custo, venda, percentual)
    select distinct on (l ->> 'codigo') v_mes, l ->> 'codigo', l ->> 'referencia', trim(l ->> 'descricao'), nullif(l ->> 'classe', ''),
           coalesce((l ->> 'quantidade')::int, 0), coalesce((l ->> 'custo')::numeric, 0), coalesce((l ->> 'venda')::numeric, 0),
           coalesce((l ->> 'percentual')::numeric, 0)
    from jsonb_array_elements(p_linhas) l where coalesce(l ->> 'codigo', '') <> '';
    get diagnostics n = row_count;

  elsif p_tipo = 'vendas_dia' then
    delete from public.vendas_itens where mes = v_mes;
    insert into public.vendas_itens (mes, data, venda, codigo, referencia, produto, quantidade, valor_produto, variacao_pct, variacao_valor, valor_total)
    select v_mes, (l ->> 'data')::date, l ->> 'venda', l ->> 'codigo', l ->> 'referencia', trim(l ->> 'produto'),
           coalesce((l ->> 'quantidade')::int, 1), coalesce((l ->> 'valor_produto')::numeric, 0), coalesce((l ->> 'variacao_pct')::numeric, 0),
           coalesce((l ->> 'variacao_valor')::numeric, 0), coalesce((l ->> 'valor_total')::numeric, 0)
    from jsonb_array_elements(p_linhas) l where (l ->> 'data') ~ '^\d{4}-\d{2}-\d{2}$';
    get diagnostics n = row_count;

  else
    raise exception 'Tipo de relatório desconhecido.';
  end if;

  insert into public.relatorios_importados (tipo, mes, arquivo, linhas) values (p_tipo, v_mes, p_arquivo, n);
  return n;
end $$;

-- Segurança: números de venda e comissão só para a gestão.
do $$
declare t text;
begin
  foreach t in array array['relatorios_importados', 'vendas_mensais', 'comissoes_mensais', 'produtos_vendidos_mes', 'vendas_itens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy ver on public.%I for select to authenticated using (
      public.tem_permissao(''comercial'', ''aprovar'') or public.tem_permissao(''financeiro'', ''ver''))', t);
  end loop;
end $$;
grant select on public.relatorios_importados, public.vendas_mensais, public.comissoes_mensais, public.produtos_vendidos_mes, public.vendas_itens to authenticated;

create trigger relatorios_importados_auditoria after insert or update or delete on public.relatorios_importados
  for each row execute function public.registrar_auditoria();

revoke execute on function public.importar_vendas(text, text, jsonb, text) from anon, public;
grant execute on function public.importar_vendas(text, text, jsonb, text) to authenticated;
