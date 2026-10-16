-- =====================================================================
-- Coreto · Chegada da facção, precificação e liberação para a loja
--
-- Fluxo:
--   1. A peça chega da facção e é contada por cor e tamanho. Ela entra no
--      estoque no local "Aguardando liberação" (não aparece para venda).
--   2. Se o modelo ainda não tem preço, ele é precificado pela ficha de custo.
--   3. O lote pode ficar pendente (faltou peça). Peças que faltavam entram
--      como complemento no mesmo lote.
--   4. A liberação move as peças para a loja (ou depósito), no todo ou em parte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Local "Aguardando liberação" e o tipo de movimento "liberacao"
-- ---------------------------------------------------------------------
alter table public.locais_estoque drop constraint locais_estoque_tipo_check;
alter table public.locais_estoque add constraint locais_estoque_tipo_check
  check (tipo in ('loja', 'deposito', 'faccao', 'marketing', 'recebimento', 'outro'));
create unique index locais_um_recebimento on public.locais_estoque (tipo) where tipo = 'recebimento';
insert into public.locais_estoque (nome, tipo) values ('Aguardando liberação', 'recebimento');

alter table public.movimentacoes_estoque drop constraint movimentacoes_estoque_tipo_check;
alter table public.movimentacoes_estoque add constraint movimentacoes_estoque_tipo_check check (tipo in (
  'entrada_producao', 'remessa_faccao', 'retorno_faccao', 'liberacao',
  'venda', 'troca', 'retirada',
  'emprestimo_marketing', 'devolucao_marketing', 'brinde',
  'perda', 'ajuste_entrada', 'ajuste_saida', 'transferencia', 'estorno'));
create index movimentacoes_documento on public.movimentacoes_estoque (documento_tipo, documento_id);

create or replace function public.local_recebimento_id()
returns uuid language sql stable set search_path = public as $$
  select id from public.locais_estoque where tipo = 'recebimento'
$$;

-- Peças aguardando liberação só entram e saem pela tela de chegada da facção.
create or replace function public.proteger_local_recebimento()
returns trigger language plpgsql set search_path = public as $$
declare
  r uuid := public.local_recebimento_id();
begin
  if new.tipo = 'liberacao' and (new.local_origem_id is distinct from r or new.documento_tipo is distinct from 'recebimento') then
    raise exception 'Liberação só sai de um lote aguardando liberação.';
  end if;
  if new.local_origem_id = r and new.tipo not in ('liberacao', 'estorno') then
    raise exception 'Peças aguardando liberação só saem pela tela de chegada da facção.';
  end if;
  if new.local_destino_id = r and not (new.tipo in ('entrada_producao', 'estorno') and new.documento_tipo = 'recebimento') then
    raise exception 'Peças só entram em "Aguardando liberação" por um recebimento.';
  end if;
  return new;
end $$;
create trigger movimentacoes_local_recebimento before insert on public.movimentacoes_estoque
  for each row execute function public.proteger_local_recebimento();

-- ---------------------------------------------------------------------
-- Recebimentos (lotes que chegam da facção)
-- ---------------------------------------------------------------------
create sequence public.recebimentos_numero_seq;
create table public.recebimentos (
  id             uuid primary key default gen_random_uuid(),
  numero         int  not null unique default nextval('public.recebimentos_numero_seq'),
  produto_id     uuid not null references public.produtos(id),
  parceiro_id    uuid references public.parceiros(id),          -- facção que entregou
  recebido_em    date not null default public.hoje_sp(),
  pendente       boolean not null default false,                -- segurando o lote: faltou peça
  pendencia      text,                                          -- o que faltou
  observacao     text,
  criado_por     uuid references public.pessoas(id) default public.pessoa_atual_id(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (not pendente or length(trim(coalesce(pendencia, ''))) > 0)
);
alter sequence public.recebimentos_numero_seq owned by public.recebimentos.numero;
create index recebimentos_produto on public.recebimentos (produto_id);
create index recebimentos_parceiro on public.recebimentos (parceiro_id);
create index recebimentos_criado_por on public.recebimentos (criado_por);
create trigger recebimentos_atualizado before update on public.recebimentos
  for each row execute function public.tocar_atualizado_em();

-- Quantidades por variante de cada lote, calculadas pelo livro de estoque.
-- recebido   = entrou no local de liberação (menos estornos)
-- liberado   = saiu para a loja/depósito (menos estornos)
-- aguardando = ainda parado esperando liberação
create view public.recebimento_itens with (security_invoker = true) as
select m.documento_id::uuid as recebimento_id, m.variante_id,
  sum(case when m.local_origem_id is null and m.local_destino_id = r.id then m.quantidade
           when m.local_origem_id = r.id and m.local_destino_id is null then -m.quantidade else 0 end)::int as recebido,
  sum(case when m.local_origem_id = r.id and m.local_destino_id is not null then m.quantidade
           when m.local_destino_id = r.id and m.local_origem_id is not null then -m.quantidade else 0 end)::int as liberado,
  sum(case when m.local_destino_id = r.id then m.quantidade
           when m.local_origem_id = r.id then -m.quantidade else 0 end)::int as aguardando
from public.movimentacoes_estoque m
cross join (select public.local_recebimento_id() as id) r
where m.documento_tipo = 'recebimento'
group by m.documento_id, m.variante_id;

create view public.recebimentos_resumo with (security_invoker = true) as
select rc.*, p.referencia, p.nome as produto_nome, p.preco_venda, pa.nome as faccao_nome,
  coalesce(t.recebido, 0) as recebido, coalesce(t.liberado, 0) as liberado, coalesce(t.aguardando, 0) as aguardando,
  case
    when coalesce(t.recebido, 0) = 0 then 'vazio'
    when rc.pendente then 'pendente'
    when coalesce(t.aguardando, 0) = 0 then 'concluido'
    when p.preco_venda is null then 'sem_preco'
    else 'pronto'
  end as situacao
from public.recebimentos rc
join public.produtos p on p.id = rc.produto_id
left join public.parceiros pa on pa.id = rc.parceiro_id
left join (
  select recebimento_id, sum(recebido)::int as recebido, sum(liberado)::int as liberado, sum(aguardando)::int as aguardando
  from public.recebimento_itens group by recebimento_id
) t on t.recebimento_id = rc.id;

-- Data do recebimento + hora atual, no fuso de São Paulo.
create or replace function public.momento_em(p_data date)
returns timestamptz language sql stable set search_path = public as $$
  select case when p_data is null or p_data = public.hoje_sp() then now()
              else (p_data + time '12:00') at time zone 'America/Sao_Paulo' end
$$;

-- Registra a contagem de um lote novo ou o complemento de um lote existente.
-- p_itens: [{"variante_id": "...", "quantidade": 3}, ...]
create or replace function public.registrar_recebimento(
  p_recebimento uuid, p_produto uuid, p_parceiro uuid, p_data date, p_observacao text, p_itens jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  rec public.recebimentos;
  item record;
  total int := 0;
begin
  if p_recebimento is null then
    if p_data > public.hoje_sp() then raise exception 'A data do recebimento não pode ser no futuro.'; end if;
    insert into public.recebimentos (produto_id, parceiro_id, recebido_em, observacao)
    values (p_produto, p_parceiro, coalesce(p_data, public.hoje_sp()), nullif(trim(p_observacao), ''))
    returning * into rec;
  else
    select * into rec from public.recebimentos where id = p_recebimento;
    if not found then raise exception 'Recebimento não encontrado.'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('recebimento:' || rec.id::text, 0));

  for item in
    select (e ->> 'variante_id')::uuid as variante_id, (e ->> 'quantidade')::int as quantidade
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
  loop
    continue when coalesce(item.quantidade, 0) = 0;
    if item.quantidade < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    if not exists (select 1 from public.variantes where id = item.variante_id and produto_id = rec.produto_id) then
      raise exception 'Variante não pertence ao produto deste recebimento.';
    end if;
    insert into public.movimentacoes_estoque
      (ocorrido_em, tipo, variante_id, quantidade, local_destino_id, parceiro_id, documento_tipo, documento_id, observacao)
    values
      (public.momento_em(case when p_recebimento is null then rec.recebido_em else p_data end),
       'entrada_producao', item.variante_id, item.quantidade, public.local_recebimento_id(),
       coalesce(p_parceiro, rec.parceiro_id), 'recebimento', rec.id::text,
       case when p_recebimento is null then 'Recebimento nº ' || rec.numero
            else 'Complemento do recebimento nº ' || rec.numero end);
    total := total + item.quantidade;
  end loop;

  if total = 0 then raise exception 'Informe a quantidade de pelo menos uma cor e tamanho.'; end if;
  return rec.id;
end $$;

-- Libera peças de um lote para a loja ou o depósito (tudo ou parte).
create or replace function public.liberar_recebimento(p_recebimento uuid, p_destino uuid, p_itens jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare
  rec public.recebimentos_resumo;
  item record;
  disponivel int;
  total int := 0;
  tipo_destino text;
begin
  select * into rec from public.recebimentos_resumo where id = p_recebimento;
  if not found then raise exception 'Recebimento não encontrado.'; end if;
  if rec.preco_venda is null then
    raise exception 'Defina o preço de venda de % antes de liberar.', rec.produto_nome;
  end if;
  select tipo into tipo_destino from public.locais_estoque where id = p_destino and arquivado_em is null;
  if tipo_destino is null or tipo_destino not in ('loja', 'deposito') then
    raise exception 'Escolha a loja ou o depósito como destino.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('recebimento:' || p_recebimento::text, 0));

  for item in
    select (e ->> 'variante_id')::uuid as variante_id, (e ->> 'quantidade')::int as quantidade
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
  loop
    continue when coalesce(item.quantidade, 0) = 0;
    if item.quantidade < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    select coalesce(sum(aguardando), 0) into disponivel
      from public.recebimento_itens where recebimento_id = p_recebimento and variante_id = item.variante_id;
    if item.quantidade > disponivel then
      raise exception 'Só há % peça(s) de % aguardando neste lote.', disponivel,
        (select sku from public.variantes where id = item.variante_id);
    end if;
    insert into public.movimentacoes_estoque
      (tipo, variante_id, quantidade, local_origem_id, local_destino_id, parceiro_id, documento_tipo, documento_id, observacao)
    values
      ('liberacao', item.variante_id, item.quantidade, public.local_recebimento_id(), p_destino,
       rec.parceiro_id, 'recebimento', p_recebimento::text, 'Liberação do recebimento nº ' || rec.numero);
    total := total + item.quantidade;
  end loop;

  if total = 0 then raise exception 'Informe quantas peças liberar.'; end if;
  return total;
end $$;

-- ---------------------------------------------------------------------
-- Precificação: ficha de custo por produto
-- preço sugerido = custo ÷ (1 − (Simples + cartão + comissão + despesas fixas + lucro) ÷ 100)
-- ---------------------------------------------------------------------
create table public.config_precificacao (
  id              smallint primary key default 1 check (id = 1),
  simples         numeric(5,2) not null default 0 check (simples >= 0),
  cartao          numeric(5,2) not null default 0 check (cartao >= 0),
  comissao        numeric(5,2) not null default 0 check (comissao >= 0),
  despesas_fixas  numeric(5,2) not null default 0 check (despesas_fixas >= 0),
  lucro_desejado  numeric(5,2) not null default 30 check (lucro_desejado >= 0),
  atualizado_em   timestamptz not null default now(),
  check (simples + cartao + comissao + despesas_fixas + lucro_desejado < 100)
);
insert into public.config_precificacao default values;
create trigger config_precificacao_atualizado before update on public.config_precificacao
  for each row execute function public.tocar_atualizado_em();

create table public.fichas_custo (
  produto_id      uuid primary key references public.produtos(id),
  simples         numeric(5,2) not null check (simples >= 0),
  cartao          numeric(5,2) not null check (cartao >= 0),
  comissao        numeric(5,2) not null check (comissao >= 0),
  despesas_fixas  numeric(5,2) not null check (despesas_fixas >= 0),
  lucro_desejado  numeric(5,2) not null check (lucro_desejado >= 0),
  custo_total     numeric(12,2) not null default 0,
  preco_sugerido  numeric(12,2),
  observacao      text,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.pessoas(id) default public.pessoa_atual_id(),
  check (simples + cartao + comissao + despesas_fixas + lucro_desejado < 100)
);
create index fichas_custo_atualizado_por on public.fichas_custo (atualizado_por);
create trigger fichas_custo_atualizado before update on public.fichas_custo
  for each row execute function public.tocar_atualizado_em();

create table public.ficha_custo_itens (
  id              uuid primary key default gen_random_uuid(),
  produto_id      uuid not null references public.fichas_custo(produto_id) on delete cascade,
  ordem           int  not null default 0,
  tipo            text not null check (tipo in ('material', 'mao_de_obra', 'outro')),
  descricao       text not null check (length(trim(descricao)) > 0),
  quantidade      numeric(12,3) not null default 1 check (quantidade > 0),
  unidade         text,
  valor_unitario  numeric(12,4) not null check (valor_unitario >= 0)
);
create index ficha_custo_itens_produto on public.ficha_custo_itens (produto_id);

create table public.historico_precos (
  id            bigint generated always as identity primary key,
  produto_id    uuid not null references public.produtos(id),
  preco         numeric(12,2) not null check (preco >= 0),
  custo         numeric(12,2),
  margem        numeric(7,2),   -- % que sobra do preço depois do custo e das taxas
  definido_em   timestamptz not null default now(),
  definido_por  uuid references public.pessoas(id) default public.pessoa_atual_id()
);
create index historico_precos_produto on public.historico_precos (produto_id, definido_em desc);
create index historico_precos_definido_por on public.historico_precos (definido_por);

-- Salva a ficha inteira de uma vez e, se informado, o preço de venda.
-- p_taxas: {"simples": 6, "cartao": 3.5, "comissao": 5, "despesas_fixas": 15, "lucro_desejado": 30}
-- p_itens: [{"tipo": "material", "descricao": "Viscose", "quantidade": 1.8, "unidade": "m", "valor_unitario": 22}, ...]
create or replace function public.salvar_ficha_custo(
  p_produto uuid, p_taxas jsonb, p_itens jsonb, p_observacao text, p_preco numeric)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t_simples numeric := coalesce((p_taxas ->> 'simples')::numeric, 0);
  t_cartao numeric := coalesce((p_taxas ->> 'cartao')::numeric, 0);
  t_comissao numeric := coalesce((p_taxas ->> 'comissao')::numeric, 0);
  t_fixas numeric := coalesce((p_taxas ->> 'despesas_fixas')::numeric, 0);
  t_lucro numeric := coalesce((p_taxas ->> 'lucro_desejado')::numeric, 0);
  custo numeric;
  sugerido numeric;
  preco_atual numeric;
  taxas numeric;
begin
  if t_simples + t_cartao + t_comissao + t_fixas + t_lucro >= 100 then
    raise exception 'A soma dos percentuais precisa ficar abaixo de 100%%.';
  end if;

  insert into public.fichas_custo (produto_id, simples, cartao, comissao, despesas_fixas, lucro_desejado, observacao)
  values (p_produto, t_simples, t_cartao, t_comissao, t_fixas, t_lucro, nullif(trim(p_observacao), ''))
  on conflict (produto_id) do update set
    simples = excluded.simples, cartao = excluded.cartao, comissao = excluded.comissao,
    despesas_fixas = excluded.despesas_fixas, lucro_desejado = excluded.lucro_desejado,
    observacao = excluded.observacao, atualizado_por = public.pessoa_atual_id();

  delete from public.ficha_custo_itens where produto_id = p_produto;
  insert into public.ficha_custo_itens (produto_id, ordem, tipo, descricao, quantidade, unidade, valor_unitario)
  select p_produto, ord::int, coalesce(e ->> 'tipo', 'outro'), trim(e ->> 'descricao'),
         coalesce((e ->> 'quantidade')::numeric, 1), nullif(trim(e ->> 'unidade'), ''), (e ->> 'valor_unitario')::numeric
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) with ordinality as x(e, ord);

  select round(coalesce(sum(quantidade * valor_unitario), 0), 2) into custo
    from public.ficha_custo_itens where produto_id = p_produto;
  sugerido := case when custo > 0
                   then round(custo / (1 - (t_simples + t_cartao + t_comissao + t_fixas + t_lucro) / 100), 2) end;
  update public.fichas_custo set custo_total = custo, preco_sugerido = sugerido where produto_id = p_produto;

  select preco_venda into preco_atual from public.produtos where id = p_produto;
  update public.produtos set custo_previsto = nullif(custo, 0),
         preco_venda = coalesce(p_preco, preco_venda)
   where id = p_produto;

  if p_preco is not null and p_preco is distinct from preco_atual then
    if p_preco <= 0 then raise exception 'O preço de venda precisa ser maior que zero.'; end if;
    taxas := t_simples + t_cartao + t_comissao + t_fixas;
    insert into public.historico_precos (produto_id, preco, custo, margem)
    values (p_produto, p_preco, nullif(custo, 0),
            case when custo > 0 then round((p_preco * (1 - taxas / 100) - custo) / p_preco * 100, 2) end);
  end if;

  return jsonb_build_object('custo', custo, 'sugerido', sugerido);
end $$;

-- ---------------------------------------------------------------------
-- Auditoria, acesso e segurança
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recebimentos', 'config_precificacao', 'fichas_custo', 'ficha_custo_itens', 'historico_precos']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t || '_auditoria', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

grant select, insert, update on public.recebimentos, public.config_precificacao, public.fichas_custo,
  public.ficha_custo_itens to authenticated;
grant delete on public.ficha_custo_itens to authenticated;
grant select, insert on public.historico_precos to authenticated;
grant select on public.recebimento_itens, public.recebimentos_resumo to authenticated;
grant usage on sequence public.recebimentos_numero_seq to authenticated;

-- Recebimentos: Produção e Estoque (a conferência conta as peças).
create policy ver on public.recebimentos for select to authenticated using (
  public.tem_permissao('producao', 'ver') or public.tem_permissao('estoque', 'criar'));
create policy criar on public.recebimentos for insert to authenticated with check (
  public.tem_permissao('producao', 'criar') or public.tem_permissao('estoque', 'criar'));
create policy editar on public.recebimentos for update to authenticated using (
  public.tem_permissao('producao', 'editar') or public.tem_permissao('estoque', 'criar'));

-- Custos são sensíveis: só quem edita produto ou vê o financeiro.
create policy ver on public.config_precificacao for select to authenticated using (
  public.tem_permissao('produto', 'editar') or public.tem_permissao('financeiro', 'ver'));
create policy editar on public.config_precificacao for update to authenticated using (
  public.tem_permissao('configuracoes', 'editar') or public.tem_permissao('financeiro', 'editar'));

do $$
declare t text;
begin
  foreach t in array array['fichas_custo', 'ficha_custo_itens', 'historico_precos']
  loop
    execute format('create policy ver on public.%I for select to authenticated using (
      public.tem_permissao(''produto'', ''editar'') or public.tem_permissao(''financeiro'', ''ver''))', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (
      public.tem_permissao(''produto'', ''editar''))', t);
  end loop;
end $$;
create policy editar on public.fichas_custo for update to authenticated using (public.tem_permissao('produto', 'editar'));
create policy editar on public.ficha_custo_itens for update to authenticated using (public.tem_permissao('produto', 'editar'));
create policy remover on public.ficha_custo_itens for delete to authenticated using (public.tem_permissao('produto', 'editar'));

-- Livro: a liberação é decisão de quem aprova a produção.
drop policy criar on public.movimentacoes_estoque;
create policy criar on public.movimentacoes_estoque for insert to authenticated with check (
  public.tem_permissao('estoque', 'criar')
  or (tipo in ('remessa_faccao', 'retorno_faccao', 'entrada_producao') and public.tem_permissao('producao', 'criar'))
  or (tipo = 'liberacao' and public.tem_permissao('producao', 'aprovar'))
  or (tipo in ('emprestimo_marketing', 'devolucao_marketing', 'brinde') and public.tem_permissao('marketing', 'criar'))
  or (tipo = 'retirada' and public.tem_permissao('pessoas', 'criar'))
  or (tipo in ('venda', 'troca') and public.tem_permissao('comercial', 'criar'))
  or (tipo = 'estorno' and public.tem_permissao('estoque', 'aprovar')));

-- Estoque "criar" não basta para liberar: o tipo liberacao exige aprovação da produção.
create or replace function public.exigir_aprovacao_liberacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'liberacao' and not public.e_processo_interno()
     and not public.tem_permissao('producao', 'aprovar') then
    raise exception 'Somente quem aprova a produção pode liberar peças para a loja.';
  end if;
  return new;
end $$;
create trigger movimentacoes_aprovar_liberacao before insert on public.movimentacoes_estoque
  for each row execute function public.exigir_aprovacao_liberacao();

revoke execute on function public.registrar_recebimento(uuid, uuid, uuid, date, text, jsonb),
  public.liberar_recebimento(uuid, uuid, jsonb), public.salvar_ficha_custo(uuid, jsonb, jsonb, text, numeric),
  public.local_recebimento_id(), public.momento_em(date)
  from anon, public;
grant execute on function public.registrar_recebimento(uuid, uuid, uuid, date, text, jsonb),
  public.liberar_recebimento(uuid, uuid, jsonb), public.salvar_ficha_custo(uuid, jsonb, jsonb, text, numeric),
  public.local_recebimento_id(), public.momento_em(date)
  to authenticated;
revoke execute on function public.proteger_local_recebimento(), public.exigir_aprovacao_liberacao()
  from authenticated, anon, public;
