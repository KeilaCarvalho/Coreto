-- =====================================================================
-- Coreto · Fluxo financeiro (relatório da Deborah) e clientes das vendedoras
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fluxo financeiro (mesmos campos do sistema antigo)
-- ---------------------------------------------------------------------
create table public.fluxo_dias (
  data           date primary key,
  vendas         jsonb not null default '[]' check (jsonb_typeof(vendas) = 'array'),     -- vendas do dia anterior: [{nome, valor}]
  saldos         jsonb not null default '[]' check (jsonb_typeof(saldos) = 'array'),     -- saldos bancários: [{nome, valor}]
  a_receber      jsonb not null default '[]' check (jsonb_typeof(a_receber) = 'array'),  -- contas a receber: [{nome, valor}]
  observacao     text,
  atualizado_por uuid references public.pessoas(id),
  atualizado_em  timestamptz not null default now()
);
create index fluxo_dias_pessoa on public.fluxo_dias (atualizado_por);

create table public.fluxo_meses (
  mes             date primary key check (extract(day from mes) = 1),
  vendas          jsonb not null default '[]' check (jsonb_typeof(vendas) = 'array'),      -- acumulado do mês: [{nome, valor}]
  vendedoras      jsonb not null default '[]' check (jsonb_typeof(vendedoras) = 'array'),  -- [{nome, valor}]
  contas_a_pagar  numeric(12,2) not null default 0,
  contas_pagas    numeric(12,2) not null default 0,
  atualizado_por  uuid references public.pessoas(id),
  atualizado_em   timestamptz not null default now()
);
create index fluxo_meses_pessoa on public.fluxo_meses (atualizado_por);

create or replace function public.carimbar_fluxo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if not public.e_processo_interno() then new.atualizado_por := public.pessoa_atual_id(); end if;
  return new;
end $$;
create trigger fluxo_dias_carimbo before insert or update on public.fluxo_dias
  for each row execute function public.carimbar_fluxo();
create trigger fluxo_meses_carimbo before insert or update on public.fluxo_meses
  for each row execute function public.carimbar_fluxo();

-- ---------------------------------------------------------------------
-- 2. Clientes (CRM das vendedoras)
-- ---------------------------------------------------------------------
-- Como a vendedora aparece nos relatórios do sistema de vendas (ex.: "BRUNA S").
alter table public.pessoas add column nome_vendas text;

-- Comparação de nomes sem acento, espaço ou pontuação.
create or replace function public.normalizar_nome(p text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'), '[^A-Za-z0-9]', '', 'g'))
$$;
create unique index pessoas_nome_vendas_unico on public.pessoas (public.normalizar_nome(nome_vendas))
  where nome_vendas is not null and arquivado_em is null;

create table public.clientes (
  id               uuid primary key default gen_random_uuid(),
  codigo_externo   text unique,                       -- código no sistema de vendas
  nome             text not null check (length(trim(nome)) > 0),
  cpf              text,
  nascimento       date,
  telefone         text,
  telefone_2       text,
  email            text,
  cidade           text,
  uf               text,
  vendedora_nome   text,                              -- como veio do relatório
  vendedora_id     uuid references public.pessoas(id),
  primeira_compra  date,
  ultima_compra    date,
  qtd_compras      int not null default 0,
  qtd_pecas        int not null default 0,
  total_gasto      numeric(12,2) not null default 0,
  etapa            text not null default 'nao_contatada' check (etapa in (
                     'nao_contatada', 'primeiro_contato', 'segundo_contato', 'aguardando_retorno',
                     'respondeu', 'venda_realizada', 'sem_retorno')),
  proximo_contato  date,
  observacao       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  arquivado_em     timestamptz
);
create index clientes_vendedora on public.clientes (vendedora_id);
create index clientes_nome_normalizado on public.clientes (public.normalizar_nome(nome));
create index clientes_proximo_contato on public.clientes (proximo_contato) where proximo_contato is not null;
create index clientes_aniversario on public.clientes ((extract(month from nascimento)));
create trigger clientes_atualizado before update on public.clientes
  for each row execute function public.tocar_atualizado_em();

-- Liga a cliente à vendedora pelo nome do relatório. Vendedora sem permissão de
-- aprovar só cadastra cliente para a própria carteira.
create or replace function public.vincular_vendedora_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.e_processo_interno() and not public.tem_permissao('comercial', 'aprovar') then
    if tg_op = 'INSERT' then
      new.vendedora_id := public.pessoa_atual_id();
      new.vendedora_nome := (select coalesce(nome_vendas, nome) from public.pessoas where id = new.vendedora_id);
    else
      new.vendedora_id := old.vendedora_id;
      new.vendedora_nome := old.vendedora_nome;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' or new.vendedora_nome is distinct from old.vendedora_nome then
    if new.vendedora_nome is not null and (tg_op = 'INSERT' and new.vendedora_id is null
                                           or tg_op = 'UPDATE' and new.vendedora_id is not distinct from old.vendedora_id) then
      new.vendedora_id := (select id from public.pessoas
                           where public.normalizar_nome(nome_vendas) = public.normalizar_nome(new.vendedora_nome)
                             and arquivado_em is null limit 1);
    end if;
  end if;
  return new;
end $$;
create trigger clientes_vendedora before insert or update on public.clientes
  for each row execute function public.vincular_vendedora_cliente();

-- Quando a administração informa o "nome nos relatórios" da vendedora, a carteira dela é ligada.
create or replace function public.religar_carteira()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nome_vendas is distinct from old.nome_vendas then
    update public.clientes set vendedora_id = null
     where vendedora_id = new.id and public.normalizar_nome(vendedora_nome) is distinct from public.normalizar_nome(new.nome_vendas);
    update public.clientes set vendedora_id = new.id
     where new.nome_vendas is not null and public.normalizar_nome(vendedora_nome) = public.normalizar_nome(new.nome_vendas);
  end if;
  return new;
end $$;
create trigger pessoas_religar_carteira after update of nome_vendas on public.pessoas
  for each row execute function public.religar_carteira();

create table public.cliente_contatos (
  id               bigint generated always as identity primary key,
  cliente_id       uuid not null references public.clientes(id),
  pessoa_id        uuid references public.pessoas(id),
  etapa            text not null check (etapa in (
                     'nao_contatada', 'primeiro_contato', 'segundo_contato', 'aguardando_retorno',
                     'respondeu', 'venda_realizada', 'sem_retorno')),
  nota             text not null check (length(trim(nota)) > 0),
  contatado_em     date not null default public.hoje_sp(),
  proximo_contato  date,
  registrado_em    timestamptz not null default now()
);
create index cliente_contatos_cliente on public.cliente_contatos (cliente_id, contatado_em desc);
create index cliente_contatos_pessoa on public.cliente_contatos (pessoa_id);

create or replace function public.registrar_contato_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.e_processo_interno() then
      new.pessoa_id := public.pessoa_atual_id();
      new.registrado_em := now();
    end if;
    return new;
  end if;
  return new;
end $$;
create trigger cliente_contatos_carimbo before insert on public.cliente_contatos
  for each row execute function public.registrar_contato_cliente();

create or replace function public.atualizar_etapa_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.clientes set etapa = new.etapa, proximo_contato = new.proximo_contato where id = new.cliente_id;
  return new;
end $$;
create trigger cliente_contatos_etapa after insert on public.cliente_contatos
  for each row execute function public.atualizar_etapa_cliente();

create table public.importacoes_clientes (
  id          uuid primary key default gen_random_uuid(),
  arquivo     text not null,
  tipo        text not null check (tipo in ('primeira_compra', 'aniversariantes', 'vendas_vendedora', 'carteira')),
  mes         text,
  registros   int not null default 0,
  ignorados   int not null default 0,
  criado_por  uuid references public.pessoas(id),
  criado_em   timestamptz not null default now()
);
create index importacoes_clientes_pessoa on public.importacoes_clientes (criado_por);

create table public.cliente_compras (
  id              bigint generated always as identity primary key,
  codigo_venda    text not null unique,
  cliente_id      uuid references public.clientes(id),
  cliente_nome    text not null,
  vendedora_nome  text,
  data            date not null,
  valor           numeric(12,2) not null default 0,
  valor_produtos  numeric(12,2) not null default 0,
  valor_trocas    numeric(12,2) not null default 0,
  valor_variacao  numeric(12,2) not null default 0,
  importacao_id   uuid references public.importacoes_clientes(id) on delete cascade
);
create index cliente_compras_cliente on public.cliente_compras (cliente_id, data desc);
create index cliente_compras_importacao on public.cliente_compras (importacao_id);

-- Recalcula compras, valor gasto e última compra a partir das vendas importadas.
create or replace function public.recalcular_clientes()
returns void language sql security definer set search_path = public as $$
  update public.clientes c
     set ultima_compra = t.ultima, qtd_compras = t.qtd, total_gasto = t.total
    from (select cliente_id, max(data) as ultima, count(*)::int as qtd, sum(valor) as total
            from public.cliente_compras where cliente_id is not null group by cliente_id) t
   where t.cliente_id = c.id
     and (c.ultima_compra, c.qtd_compras, c.total_gasto) is distinct from (t.ultima, t.qtd, t.total)
$$;

-- Importa linhas já lidas de um relatório (PDF do sistema de vendas ou carteira antiga).
create or replace function public.importar_clientes(p_tipo text, p_linhas jsonb, p_arquivo text, p_mes text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  imp uuid;
  l jsonb;
  n_importados int := 0;
  n_ignorados int := 0;
  cod text;
  nome_l text;
  achados uuid[];
  data_l date;
begin
  if not public.tem_permissao('comercial', 'aprovar') then
    raise exception 'Somente a gestão comercial pode importar relatórios de clientes.';
  end if;
  if p_tipo not in ('primeira_compra', 'aniversariantes', 'vendas_vendedora', 'carteira') then
    raise exception 'Tipo de relatório inválido.';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'O relatório não tem linhas para importar.';
  end if;

  insert into public.importacoes_clientes (arquivo, tipo, mes, criado_por)
  values (coalesce(nullif(trim(p_arquivo), ''), 'relatório'), p_tipo, nullif(p_mes, ''), public.pessoa_atual_id())
  returning id into imp;

  for l in select * from jsonb_array_elements(p_linhas) loop
    cod := nullif(trim(l ->> 'codigo'), '');
    nome_l := nullif(trim(l ->> 'nome'), '');

    if p_tipo in ('primeira_compra', 'carteira') then
      if nome_l is null then n_ignorados := n_ignorados + 1; continue; end if;
      insert into public.clientes as c (codigo_externo, nome, cpf, nascimento, telefone, telefone_2, email, cidade, uf,
                                        vendedora_nome, primeira_compra, ultima_compra, qtd_compras, qtd_pecas, total_gasto,
                                        etapa, proximo_contato)
      values (cod, nome_l, nullif(l ->> 'cpf', ''), nullif(l ->> 'nascimento', '')::date,
              nullif(l ->> 'telefone', ''), nullif(l ->> 'telefone_2', ''), nullif(lower(l ->> 'email'), ''),
              nullif(l ->> 'cidade', ''), nullif(upper(l ->> 'uf'), ''), nullif(trim(l ->> 'vendedora'), ''),
              nullif(l ->> 'primeira_compra', '')::date,
              coalesce(nullif(l ->> 'ultima_compra', '')::date, nullif(l ->> 'primeira_compra', '')::date),
              coalesce(nullif(l ->> 'qtd_compras', '')::int, 1), coalesce(nullif(l ->> 'qtd_pecas', '')::int, 0),
              coalesce(nullif(l ->> 'total_gasto', '')::numeric, 0),
              coalesce(nullif(l ->> 'etapa', ''), 'nao_contatada'), nullif(l ->> 'proximo_contato', '')::date)
      on conflict (codigo_externo) do update set
        nome = excluded.nome,
        cpf = coalesce(excluded.cpf, c.cpf),
        nascimento = coalesce(excluded.nascimento, c.nascimento),
        telefone = coalesce(excluded.telefone, c.telefone),
        telefone_2 = coalesce(excluded.telefone_2, c.telefone_2),
        email = coalesce(excluded.email, c.email),
        cidade = coalesce(excluded.cidade, c.cidade),
        uf = coalesce(excluded.uf, c.uf),
        vendedora_nome = coalesce(excluded.vendedora_nome, c.vendedora_nome),
        primeira_compra = least(c.primeira_compra, excluded.primeira_compra),
        ultima_compra = greatest(c.ultima_compra, excluded.ultima_compra),
        qtd_pecas = greatest(c.qtd_pecas, excluded.qtd_pecas),
        total_gasto = greatest(c.total_gasto, excluded.total_gasto),
        qtd_compras = greatest(c.qtd_compras, excluded.qtd_compras);
      n_importados := n_importados + 1;

    elsif p_tipo = 'aniversariantes' then
      if cod is null or nome_l is null then n_ignorados := n_ignorados + 1; continue; end if;
      insert into public.clientes as c (codigo_externo, nome, cpf, nascimento, telefone, telefone_2, email, cidade, uf)
      values (cod, nome_l, nullif(l ->> 'cpf', ''), nullif(l ->> 'nascimento', '')::date, nullif(l ->> 'telefone', ''),
              nullif(l ->> 'telefone_2', ''), nullif(lower(l ->> 'email'), ''), nullif(l ->> 'cidade', ''), nullif(upper(l ->> 'uf'), ''))
      on conflict (codigo_externo) do update set
        nome = excluded.nome,
        cpf = coalesce(excluded.cpf, c.cpf),
        nascimento = coalesce(excluded.nascimento, c.nascimento),
        telefone = coalesce(excluded.telefone, c.telefone),
        telefone_2 = coalesce(excluded.telefone_2, c.telefone_2),
        email = coalesce(excluded.email, c.email),
        cidade = coalesce(excluded.cidade, c.cidade),
        uf = coalesce(excluded.uf, c.uf);
      n_importados := n_importados + 1;

    else -- vendas_vendedora
      cod := nullif(trim(l ->> 'codigo_venda'), '');
      data_l := nullif(l ->> 'data', '')::date;
      if cod is null or data_l is null or nome_l is null then n_ignorados := n_ignorados + 1; continue; end if;
      select array_agg(id) into achados from public.clientes
       where public.normalizar_nome(nome) = public.normalizar_nome(nome_l) and arquivado_em is null;
      insert into public.cliente_compras as v (codigo_venda, cliente_id, cliente_nome, vendedora_nome, data, valor,
                                               valor_produtos, valor_trocas, valor_variacao, importacao_id)
      values (cod, case when cardinality(achados) = 1 then achados[1] end, nome_l, nullif(trim(l ->> 'vendedora'), ''), data_l,
              coalesce(nullif(l ->> 'valor', '')::numeric, 0), coalesce(nullif(l ->> 'valor_produtos', '')::numeric, 0),
              coalesce(nullif(l ->> 'valor_trocas', '')::numeric, 0), coalesce(nullif(l ->> 'valor_variacao', '')::numeric, 0), imp)
      on conflict (codigo_venda) do update set
        cliente_id = coalesce(excluded.cliente_id, v.cliente_id), cliente_nome = excluded.cliente_nome,
        vendedora_nome = excluded.vendedora_nome, data = excluded.data, valor = excluded.valor,
        valor_produtos = excluded.valor_produtos, valor_trocas = excluded.valor_trocas,
        valor_variacao = excluded.valor_variacao, importacao_id = excluded.importacao_id;
      n_importados := n_importados + 1;
    end if;
  end loop;

  perform public.recalcular_clientes();
  update public.importacoes_clientes set registros = n_importados, ignorados = n_ignorados where id = imp;
  return jsonb_build_object('importacao_id', imp, 'importados', n_importados, 'ignorados', n_ignorados);
end $$;

-- Desfaz uma importação de vendas (cadastros de clientes são preservados).
create or replace function public.desfazer_importacao_clientes(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.tem_permissao('comercial', 'aprovar') then
    raise exception 'Somente a gestão comercial pode desfazer importações.';
  end if;
  delete from public.cliente_compras where importacao_id = p_id;
  delete from public.importacoes_clientes where id = p_id;
  perform public.recalcular_clientes();
end $$;

-- ---------------------------------------------------------------------
-- Auditoria das tabelas novas
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fluxo_dias', 'fluxo_meses', 'clientes', 'importacoes_clientes']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t || '_auditoria', t);
  end loop;
end $$;

-- A chave do histórico também reconhece "data", "mes" e "cliente_id".
create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  linha jsonb := to_jsonb(coalesce(new, old));
  chave text;
begin
  chave := coalesce(linha ->> 'id', linha ->> 'produto_id', linha ->> 'perfil_id', linha ->> 'grade_id',
                    linha ->> 'data', linha ->> 'mes', linha ->> 'cliente_id');
  insert into public.auditoria (tabela, registro_id, acao, antes, depois, usuario_id)
  values (
    tg_table_name, coalesce(chave, '?'),
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'apagou' end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    public.usuario_atual());
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Acesso (RLS)
-- ---------------------------------------------------------------------
revoke all on public.fluxo_dias, public.fluxo_meses, public.clientes,
  public.cliente_contatos, public.importacoes_clientes, public.cliente_compras from anon, authenticated;

grant select, insert, update on public.fluxo_dias, public.fluxo_meses to authenticated;
grant select, insert, update on public.clientes to authenticated;
grant select, insert on public.cliente_contatos to authenticated;
grant select on public.importacoes_clientes, public.cliente_compras to authenticated;

do $$
declare t text;
begin
  foreach t in array array['fluxo_dias', 'fluxo_meses', 'clientes', 'cliente_contatos', 'importacoes_clientes', 'cliente_compras']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Fluxo financeiro.
create policy ver on public.fluxo_dias for select to authenticated using (public.tem_permissao('financeiro', 'ver'));
create policy criar on public.fluxo_dias for insert to authenticated with check (public.tem_permissao('financeiro', 'criar'));
create policy editar on public.fluxo_dias for update to authenticated using (public.tem_permissao('financeiro', 'editar'));
create policy ver on public.fluxo_meses for select to authenticated using (public.tem_permissao('financeiro', 'ver'));
create policy criar on public.fluxo_meses for insert to authenticated with check (public.tem_permissao('financeiro', 'criar'));
create policy editar on public.fluxo_meses for update to authenticated using (public.tem_permissao('financeiro', 'editar'));

-- Clientes: a gestão comercial vê todas; cada vendedora vê a própria carteira.
create policy ver on public.clientes for select to authenticated using (
  public.tem_permissao('comercial', 'aprovar')
  or (public.tem_permissao('comercial', 'ver') and vendedora_id = public.pessoa_atual_id()));
create policy criar on public.clientes for insert to authenticated with check (public.tem_permissao('comercial', 'criar'));
create policy editar on public.clientes for update to authenticated using (
  public.tem_permissao('comercial', 'aprovar')
  or (public.tem_permissao('comercial', 'criar') and vendedora_id = public.pessoa_atual_id()));
create policy ver on public.cliente_contatos for select to authenticated using (
  exists (select 1 from public.clientes c where c.id = cliente_id));
create policy criar on public.cliente_contatos for insert to authenticated with check (
  public.tem_permissao('comercial', 'criar') and exists (select 1 from public.clientes c where c.id = cliente_id));
create policy ver on public.cliente_compras for select to authenticated using (
  public.tem_permissao('comercial', 'aprovar') or exists (select 1 from public.clientes c where c.id = cliente_id));
create policy ver on public.importacoes_clientes for select to authenticated using (public.tem_permissao('comercial', 'aprovar'));
-- inserts e exclusões de importação passam pelas funções acima (que checam a permissão)
create policy criar on public.importacoes_clientes for insert to authenticated with check (public.tem_permissao('comercial', 'aprovar'));
create policy editar on public.importacoes_clientes for update to authenticated using (public.tem_permissao('comercial', 'aprovar'));
create policy apagar on public.importacoes_clientes for delete to authenticated using (public.tem_permissao('comercial', 'aprovar'));
create policy criar on public.cliente_compras for insert to authenticated with check (public.tem_permissao('comercial', 'aprovar'));
create policy editar on public.cliente_compras for update to authenticated using (public.tem_permissao('comercial', 'aprovar'));
create policy apagar on public.cliente_compras for delete to authenticated using (public.tem_permissao('comercial', 'aprovar'));
grant insert, update, delete on public.cliente_compras to authenticated;
grant insert, update, delete on public.importacoes_clientes to authenticated;

grant execute on function public.normalizar_nome(text), public.importar_clientes(text, jsonb, text, text),
  public.desfazer_importacao_clientes(uuid), public.recalcular_clientes() to authenticated;

revoke execute on function public.carimbar_fluxo(), public.vincular_vendedora_cliente(), public.religar_carteira(),
  public.registrar_contato_cliente(), public.atualizar_etapa_cliente()
from authenticated, anon, public;
revoke execute on function public.registrar_auditoria() from authenticated, anon, public;
