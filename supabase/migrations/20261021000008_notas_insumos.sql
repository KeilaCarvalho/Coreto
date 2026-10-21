-- =====================================================================
-- Entrada de notas de compra (tecidos, aviamentos e outros insumos).
-- Cada item lançado guarda o preço pago; o insumo fica com o último preço
-- (pela data da nota) para aparecer sozinho na precificação.
-- Também aceita "sem nota" (preço que a Keila sabe, de compras antigas)
-- e guarda o PDF ou a foto da nota no Storage (bucket privado "notas").
-- =====================================================================

create table public.insumos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(trim(nome)) > 0),
  tipo              text not null default 'aviamento' check (tipo in ('tecido', 'aviamento', 'outro')),
  unidade           text not null default 'un',
  ultimo_preco      numeric(12,4),
  ultimo_preco_em   date,
  ultimo_fornecedor text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  arquivado_em      timestamptz
);
create unique index insumos_nome_unico on public.insumos (lower(trim(nome))) where arquivado_em is null;
create trigger insumos_atualizado before update on public.insumos
  for each row execute function public.tocar_atualizado_em();

create table public.notas_compra (
  id            uuid primary key default gen_random_uuid(),
  numero        text,
  fornecedor    text check (fornecedor is null or length(trim(fornecedor)) > 0),
  sem_nota      boolean not null default false,
  arquivo       text,          -- caminho no Storage (bucket "notas"): PDF ou foto da nota
  emitida_em    date not null default public.hoje_sp(),
  valor_total   numeric(12,2) not null default 0,
  observacao    text,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references public.pessoas(id) default public.pessoa_atual_id()
);
create index notas_compra_data on public.notas_compra (emitida_em desc);
create index notas_compra_criado_por on public.notas_compra (criado_por);

create table public.nota_compra_itens (
  id              uuid primary key default gen_random_uuid(),
  nota_id         uuid not null references public.notas_compra(id) on delete cascade,
  ordem           int  not null default 0,
  insumo_id       uuid not null references public.insumos(id),
  quantidade      numeric(12,3) not null check (quantidade > 0),
  unidade         text,
  valor_unitario  numeric(12,4) not null check (valor_unitario >= 0)
);
create index nota_compra_itens_nota on public.nota_compra_itens (nota_id);
create index nota_compra_itens_insumo on public.nota_compra_itens (insumo_id);

-- Último preço de um insumo = item da nota mais recente (pela data da nota).
create or replace function public.recalcular_insumo(p_insumo uuid)
returns void language sql security invoker set search_path = public as $$
  update public.insumos i set
    ultimo_preco = u.valor_unitario, ultimo_preco_em = u.emitida_em, ultimo_fornecedor = coalesce(u.fornecedor, 'Sem nota'),
    unidade = coalesce(nullif(trim(u.unidade), ''), i.unidade)
  from (select 1) _
  left join lateral (
    select it.valor_unitario, it.unidade, n.emitida_em, n.fornecedor
    from public.nota_compra_itens it join public.notas_compra n on n.id = it.nota_id
    where it.insumo_id = p_insumo
    order by n.emitida_em desc, n.criado_em desc, it.ordem desc limit 1
  ) u on true
  where i.id = p_insumo;
$$;

-- Lança uma nota (ou um registro "sem nota") com os itens.
-- p_nota: {numero, fornecedor, data, observacao, sem_nota, arquivo}
-- p_itens: [{nome, tipo, unidade, quantidade, valor_unitario}]
-- Insumo novo é criado pelo nome; insumo existente é reaproveitado (sem diferenciar maiúsculas).
create or replace function public.registrar_nota_compra(p_nota jsonb, p_itens jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  nota uuid;
  e jsonb;
  ord bigint;
  ins uuid;
  nome_item text;
  total numeric := 0;
  v_data date := coalesce(nullif(p_nota ->> 'data', '')::date, public.hoje_sp());
  v_sem_nota boolean := coalesce((p_nota ->> 'sem_nota')::boolean, false);
  v_fornecedor text := nullif(trim(p_nota ->> 'fornecedor'), '');
begin
  if v_data > public.hoje_sp() then raise exception 'A data da nota não pode ser no futuro.'; end if;
  if not v_sem_nota and v_fornecedor is null then raise exception 'Informe o fornecedor da nota.'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Informe pelo menos um item.'; end if;

  insert into public.notas_compra (numero, fornecedor, emitida_em, observacao, sem_nota, arquivo)
  values (case when v_sem_nota then null else nullif(trim(p_nota ->> 'numero'), '') end, v_fornecedor, v_data,
          nullif(trim(p_nota ->> 'observacao'), ''), v_sem_nota, nullif(trim(p_nota ->> 'arquivo'), ''))
  returning id into nota;

  for e, ord in select x.e, x.ord from jsonb_array_elements(p_itens) with ordinality as x(e, ord) loop
    nome_item := trim(e ->> 'nome');
    if nome_item is null or nome_item = '' then raise exception 'Todo item precisa de um nome.'; end if;
    select id into ins from public.insumos where lower(trim(nome)) = lower(nome_item) and arquivado_em is null;
    if ins is null then
      insert into public.insumos (nome, tipo, unidade)
      values (nome_item, coalesce(nullif(e ->> 'tipo', ''), 'aviamento'), coalesce(nullif(trim(e ->> 'unidade'), ''), 'un'))
      returning id into ins;
    end if;
    insert into public.nota_compra_itens (nota_id, ordem, insumo_id, quantidade, unidade, valor_unitario)
    values (nota, ord::int, ins, coalesce((e ->> 'quantidade')::numeric, 1), nullif(trim(e ->> 'unidade'), ''), (e ->> 'valor_unitario')::numeric);
    total := total + coalesce((e ->> 'quantidade')::numeric, 1) * (e ->> 'valor_unitario')::numeric;
    perform public.recalcular_insumo(ins);
  end loop;

  update public.notas_compra set valor_total = round(total, 2) where id = nota;
  return nota;
end $$;

-- Apaga uma nota lançada errada e devolve aos insumos o preço da nota anterior.
create or replace function public.excluir_nota_compra(p_nota uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  afetados uuid[];
  ins uuid;
begin
  select array_agg(distinct insumo_id) into afetados from public.nota_compra_itens where nota_id = p_nota;
  delete from public.notas_compra where id = p_nota;
  if not found then raise exception 'Nota não encontrada ou sem permissão.'; end if;
  foreach ins in array coalesce(afetados, '{}') loop
    perform public.recalcular_insumo(ins);
  end loop;
end $$;

-- Segurança: custos são sensíveis, como a precificação.
alter table public.insumos enable row level security;
alter table public.notas_compra enable row level security;
alter table public.nota_compra_itens enable row level security;

do $$
declare t text;
begin
  foreach t in array array['insumos', 'notas_compra', 'nota_compra_itens']
  loop
    execute format('create policy ver on public.%I for select to authenticated using (
      public.tem_permissao(''produto'', ''editar'') or public.tem_permissao(''financeiro'', ''ver''))', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (
      public.tem_permissao(''produto'', ''editar'') or public.tem_permissao(''financeiro'', ''criar''))', t);
    execute format('create policy editar on public.%I for update to authenticated using (
      public.tem_permissao(''produto'', ''editar'') or public.tem_permissao(''financeiro'', ''criar''))', t);
    execute format('create policy remover on public.%I for delete to authenticated using (
      public.tem_permissao(''produto'', ''editar'') or public.tem_permissao(''financeiro'', ''editar''))', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t || '_auditoria', t);
  end loop;
end $$;

grant select, insert, update, delete on public.insumos, public.notas_compra, public.nota_compra_itens to authenticated;

revoke execute on function public.recalcular_insumo(uuid), public.registrar_nota_compra(jsonb, jsonb),
  public.excluir_nota_compra(uuid) from anon, public;
grant execute on function public.recalcular_insumo(uuid), public.registrar_nota_compra(jsonb, jsonb),
  public.excluir_nota_compra(uuid) to authenticated;

-- Arquivos das notas (PDF ou foto) num bucket privado. Só quem vê custos acessa.
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('notas', 'notas', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  on conflict (id) do nothing;
  execute $p$create policy notas_ver on storage.objects for select to authenticated using (
    bucket_id = 'notas' and (public.tem_permissao('produto', 'editar') or public.tem_permissao('financeiro', 'ver')))$p$;
  execute $p$create policy notas_enviar on storage.objects for insert to authenticated with check (
    bucket_id = 'notas' and (public.tem_permissao('produto', 'editar') or public.tem_permissao('financeiro', 'criar')))$p$;
  execute $p$create policy notas_apagar on storage.objects for delete to authenticated using (
    bucket_id = 'notas' and (public.tem_permissao('produto', 'editar') or public.tem_permissao('financeiro', 'editar')))$p$;
end $$;
