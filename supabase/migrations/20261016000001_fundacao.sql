-- =====================================================================
-- Coreto · Fundação do sistema
-- Cadastros mestres, livro de estoque e histórico de alterações.
-- Regras:
--   * Nada é apagado: registros são arquivados (arquivado_em) ou estornados.
--   * Todo módulo aponta para os cadastros pelo id, nunca por nome digitado.
--   * O saldo de estoque é sempre a soma do livro de movimentações.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- Data "de hoje" sempre no fuso de São Paulo.
create or replace function public.hoje_sp()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- ---------------------------------------------------------------------
-- Perfis e permissões
-- ---------------------------------------------------------------------
create table public.perfis (
  id          text primary key,
  nome        text not null,
  descricao   text,
  criado_em   timestamptz not null default now()
);

create table public.modulos (
  id     text primary key,
  nome   text not null,
  ordem  int  not null default 0
);

create table public.perfil_permissoes (
  perfil_id  text not null references public.perfis(id) on delete cascade,
  modulo_id  text not null references public.modulos(id),
  acao       text not null check (acao in ('ver', 'criar', 'editar', 'aprovar')),
  primary key (perfil_id, modulo_id, acao)
);

-- ---------------------------------------------------------------------
-- Pessoas: um cadastro único para quem tem acesso, funcionárias e vendedoras
-- (substitui app_users + employees do sistema antigo)
-- ---------------------------------------------------------------------
create table public.pessoas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  apelido        text,
  email          text unique check (email is null or email = lower(email)),
  telefone       text,
  cargo          text,
  usuario_id     uuid unique,                -- auth.users(id) quando a pessoa entra no sistema
  perfil_id      text references public.perfis(id),
  acesso_ativo   boolean not null default false,
  e_funcionaria  boolean not null default true,
  e_vendedora    boolean not null default false,
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  arquivado_em   timestamptz
);
create trigger pessoas_atualizado before update on public.pessoas
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Cadastros auxiliares do produto
-- ---------------------------------------------------------------------
create table public.cores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  codigo        text,                        -- código curto usado no SKU (ex.: VRD)
  hex           text check (hex is null or hex ~ '^#[0-9A-Fa-f]{6}$'),
  criado_em     timestamptz not null default now(),
  arquivado_em  timestamptz
);
create unique index cores_nome_unico on public.cores (lower(nome)) where arquivado_em is null;
create unique index cores_codigo_unico on public.cores (upper(codigo)) where arquivado_em is null and codigo is not null;

create table public.grades (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  criado_em     timestamptz not null default now(),
  arquivado_em  timestamptz
);

create table public.grade_tamanhos (
  grade_id  uuid not null references public.grades(id) on delete cascade,
  tamanho   text not null,
  ordem     int  not null,
  primary key (grade_id, tamanho)
);

create table public.colecoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  lancamento    date,
  criado_em     timestamptz not null default now(),
  arquivado_em  timestamptz
);

create table public.categorias (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  ncm           text,                        -- padrão fiscal da categoria (definido com o contador)
  criado_em     timestamptz not null default now(),
  arquivado_em  timestamptz
);

-- ---------------------------------------------------------------------
-- Produto (modelo) e variantes (SKU = produto + cor + tamanho)
-- ---------------------------------------------------------------------
create table public.produtos (
  id             uuid primary key default gen_random_uuid(),
  referencia     text not null,
  nome           text not null check (length(trim(nome)) > 0),
  categoria_id   uuid references public.categorias(id),
  colecao_id     uuid references public.colecoes(id),
  grade_id       uuid not null references public.grades(id),
  preco_venda    numeric(12,2) check (preco_venda is null or preco_venda >= 0),
  custo_previsto numeric(12,2) check (custo_previsto is null or custo_previsto >= 0),
  ncm            text,
  descricao      text,
  foto_url       text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  arquivado_em   timestamptz
);
create unique index produtos_referencia_unica on public.produtos (upper(referencia));
create trigger produtos_atualizado before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

create table public.produto_cores (
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  cor_id      uuid not null references public.cores(id),
  primary key (produto_id, cor_id)
);

create table public.variantes (
  id             uuid primary key default gen_random_uuid(),
  produto_id     uuid not null references public.produtos(id),
  cor_id         uuid not null references public.cores(id),
  tamanho        text not null,
  sku            text not null unique,
  codigo_barras  text unique,
  preco_venda    numeric(12,2) check (preco_venda is null or preco_venda >= 0), -- vazio = preço do produto
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (produto_id, cor_id, tamanho)
);

-- EAN-13 interno (prefixo 2 = uso interno da loja) com dígito verificador.
create sequence public.codigo_barras_seq start 1;
create or replace function public.proximo_codigo_barras()
returns text language plpgsql set search_path = public as $$
declare
  base text := '2' || lpad(nextval('public.codigo_barras_seq')::text, 11, '0');
  soma int := 0;
  i int;
begin
  for i in 1..12 loop
    soma := soma + substr(base, i, 1)::int * (case when i % 2 = 0 then 3 else 1 end);
  end loop;
  return base || ((10 - soma % 10) % 10)::text;
end $$;

-- Gera todas as combinações cor × tamanho que ainda não existem.
-- Variantes de cores retiradas do produto são desativadas, nunca apagadas.
create or replace function public.gerar_variantes(p_produto_id uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare
  criadas int;
begin
  insert into public.variantes (produto_id, cor_id, tamanho, sku, codigo_barras)
  select p.id, c.id, gt.tamanho,
         upper(p.referencia) || '-' || upper(coalesce(c.codigo, left(regexp_replace(c.nome, '\s', '', 'g'), 3))) || '-' || upper(gt.tamanho),
         public.proximo_codigo_barras()
  from public.produtos p
  join public.produto_cores pc on pc.produto_id = p.id
  join public.cores c on c.id = pc.cor_id
  join public.grade_tamanhos gt on gt.grade_id = p.grade_id
  where p.id = p_produto_id
    and not exists (
      select 1 from public.variantes v
      where v.produto_id = p.id and v.cor_id = c.id and v.tamanho = gt.tamanho)
  order by c.nome, gt.ordem;
  get diagnostics criadas = row_count;

  update public.variantes v set ativa = exists (
           select 1 from public.produto_cores pc
           where pc.produto_id = v.produto_id and pc.cor_id = v.cor_id)
  where v.produto_id = p_produto_id;

  return criadas;
end $$;

-- ---------------------------------------------------------------------
-- Parceiros: facções, fornecedores, fotógrafos, modelos, influenciadoras
-- ---------------------------------------------------------------------
create table public.parceiros (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('faccao', 'cortador', 'fornecedor', 'fotografo', 'modelo', 'influenciadora', 'outro')),
  nome           text not null check (length(trim(nome)) > 0),
  documento      text,                       -- CPF ou CNPJ
  contato        text,
  telefone       text,
  email          text,
  cidade         text,
  pix            text,
  observacao     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  arquivado_em   timestamptz
);
create trigger parceiros_atualizado before update on public.parceiros
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- Locais de estoque: loja, depósito, cada facção, marketing...
-- ---------------------------------------------------------------------
create table public.locais_estoque (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  tipo          text not null check (tipo in ('loja', 'deposito', 'faccao', 'marketing', 'outro')),
  parceiro_id   uuid unique references public.parceiros(id),
  criado_em     timestamptz not null default now(),
  arquivado_em  timestamptz
);

-- Toda facção cadastrada ganha automaticamente o seu local de estoque.
create or replace function public.criar_local_da_faccao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'faccao' then
    insert into public.locais_estoque (nome, tipo, parceiro_id)
    values ('Facção · ' || new.nome, 'faccao', new.id)
    on conflict (parceiro_id) do nothing;
  end if;
  return new;
end $$;
create trigger parceiros_local_faccao after insert on public.parceiros
  for each row execute function public.criar_local_da_faccao();

-- ---------------------------------------------------------------------
-- Livro de movimentações de estoque (somente inclusão)
--   origem nula  = a peça entra no sistema (produção pronta, ajuste +)
--   destino nulo = a peça sai do sistema (venda, retirada, brinde, perda)
-- ---------------------------------------------------------------------
create table public.movimentacoes_estoque (
  id                bigint generated always as identity primary key,
  ocorrido_em       timestamptz not null default now(),
  tipo              text not null check (tipo in (
                      'entrada_producao', 'remessa_faccao', 'retorno_faccao',
                      'venda', 'troca', 'retirada',
                      'emprestimo_marketing', 'devolucao_marketing', 'brinde',
                      'perda', 'ajuste_entrada', 'ajuste_saida', 'transferencia', 'estorno')),
  variante_id       uuid not null references public.variantes(id),
  quantidade        int  not null check (quantidade > 0),
  local_origem_id   uuid references public.locais_estoque(id),
  local_destino_id  uuid references public.locais_estoque(id),
  pessoa_id         uuid references public.pessoas(id),     -- quem retirou / levou a peça
  parceiro_id       uuid references public.parceiros(id),   -- facção, influenciadora...
  documento_tipo    text,                                    -- ex.: 'ordem_producao', 'venda'
  documento_id      text,
  estorno_de        bigint unique references public.movimentacoes_estoque(id),
  observacao        text,
  registrado_por    uuid references public.pessoas(id),
  registrado_em     timestamptz not null default now(),
  check (local_origem_id is not null or local_destino_id is not null),
  check (local_origem_id is distinct from local_destino_id),
  check ((tipo = 'estorno') = (estorno_de is not null))
);
create index movimentacoes_variante on public.movimentacoes_estoque (variante_id);
create index movimentacoes_origem   on public.movimentacoes_estoque (local_origem_id);
create index movimentacoes_destino  on public.movimentacoes_estoque (local_destino_id);
create index movimentacoes_data     on public.movimentacoes_estoque (ocorrido_em desc);
create index movimentacoes_pessoa   on public.movimentacoes_estoque (pessoa_id);
create index movimentacoes_parceiro on public.movimentacoes_estoque (parceiro_id);
create index movimentacoes_registrado_por on public.movimentacoes_estoque (registrado_por);

-- O livro não aceita alteração nem exclusão: erros se corrigem com estorno.
create or replace function public.bloquear_alteracao_livro()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'O livro de estoque não pode ser alterado nem apagado. Registre um estorno.';
end $$;
create trigger movimentacoes_imutaveis before update or delete on public.movimentacoes_estoque
  for each row execute function public.bloquear_alteracao_livro();

-- Saldo atual por variante e local.
create view public.saldos_estoque with (security_invoker = true) as
with lados as (
  select variante_id, local_destino_id as local_id, quantidade as qtd
    from public.movimentacoes_estoque where local_destino_id is not null
  union all
  select variante_id, local_origem_id, -quantidade
    from public.movimentacoes_estoque where local_origem_id is not null
)
select l.variante_id, l.local_id, sum(l.qtd)::int as saldo
from lados l
group by l.variante_id, l.local_id
having sum(l.qtd) <> 0;

-- Estorno: cria o movimento inverso de um lançamento.
create or replace function public.estornar_movimentacao(p_id bigint, p_motivo text)
returns bigint language plpgsql security invoker set search_path = public as $$
declare
  m public.movimentacoes_estoque;
  novo bigint;
begin
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Informe o motivo do estorno.';
  end if;
  select * into m from public.movimentacoes_estoque where id = p_id;
  if not found then raise exception 'Movimentação % não encontrada.', p_id; end if;
  if m.tipo = 'estorno' then raise exception 'Um estorno não pode ser estornado.'; end if;
  insert into public.movimentacoes_estoque
    (tipo, variante_id, quantidade, local_origem_id, local_destino_id, pessoa_id, parceiro_id,
     documento_tipo, documento_id, estorno_de, observacao, registrado_por)
  values
    ('estorno', m.variante_id, m.quantidade, m.local_destino_id, m.local_origem_id, m.pessoa_id, m.parceiro_id,
     m.documento_tipo, m.documento_id, m.id, p_motivo, public.pessoa_atual_id())
  returning id into novo;
  return novo;
end $$;

-- ---------------------------------------------------------------------
-- Histórico de alterações (auditoria)
-- ---------------------------------------------------------------------
create table public.auditoria (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  registro_id   text not null,
  acao          text not null check (acao in ('criou', 'alterou', 'apagou')),
  antes         jsonb,
  depois        jsonb,
  usuario_id    uuid,
  ocorrido_em   timestamptz not null default now()
);
create index auditoria_registro on public.auditoria (tabela, registro_id);
create index auditoria_data on public.auditoria (ocorrido_em desc);

-- Quem está agindo: usuário autenticado do Supabase (nulo em scripts internos).
create or replace function public.usuario_atual()
returns uuid language sql stable set search_path = public as $$
  select auth.uid()
$$;

create or replace function public.pessoa_atual_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.pessoas where usuario_id = public.usuario_atual() and arquivado_em is null
$$;

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  chave text;
begin
  chave := coalesce(
    to_jsonb(coalesce(new, old)) ->> 'id',
    to_jsonb(coalesce(new, old)) ->> 'produto_id',
    to_jsonb(coalesce(new, old)) ->> 'perfil_id',
    to_jsonb(coalesce(new, old)) ->> 'grade_id');
  insert into public.auditoria (tabela, registro_id, acao, antes, depois, usuario_id)
  values (
    tg_table_name, coalesce(chave, '?'),
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'apagou' end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    public.usuario_atual());
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['pessoas', 'perfil_permissoes', 'cores', 'grades', 'colecoes', 'categorias',
                           'produtos', 'produto_cores', 'variantes', 'parceiros', 'locais_estoque',
                           'movimentacoes_estoque']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t || '_auditoria', t);
  end loop;
end $$;

-- índices das chaves estrangeiras usadas em junções
create index pessoas_perfil on public.pessoas (perfil_id);
create index produtos_categoria on public.produtos (categoria_id);
create index produtos_colecao on public.produtos (colecao_id);
create index produtos_grade on public.produtos (grade_id);
create index produto_cores_cor on public.produto_cores (cor_id);
create index variantes_cor on public.variantes (cor_id);
create index perfil_permissoes_modulo on public.perfil_permissoes (modulo_id);
