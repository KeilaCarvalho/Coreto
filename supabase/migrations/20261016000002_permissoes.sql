-- =====================================================================
-- Coreto · Permissões e segurança no banco (Row Level Security)
-- Toda leitura e gravação é checada aqui, no servidor do banco.
-- Esconder um botão na tela não é segurança: esta camada é.
-- =====================================================================

alter table public.pessoas
  add constraint pessoas_usuario_fk foreign key (usuario_id) references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- Funções de permissão
-- ---------------------------------------------------------------------
create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pessoas
    where usuario_id = auth.uid() and acesso_ativo and arquivado_em is null and perfil_id is not null)
$$;

create or replace function public.tem_permissao(p_modulo text, p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.pessoas p
    join public.perfil_permissoes pp on pp.perfil_id = p.perfil_id
    where p.usuario_id = auth.uid() and p.acesso_ativo and p.arquivado_em is null
      and pp.modulo_id = p_modulo and pp.acao = p_acao)
$$;

-- Permissões do usuário logado, para o app montar o menu.
create or replace function public.minhas_permissoes()
returns table (modulo_id text, acao text) language sql stable security definer set search_path = public as $$
  select pp.modulo_id, pp.acao
  from public.pessoas p
  join public.perfil_permissoes pp on pp.perfil_id = p.perfil_id
  where p.usuario_id = auth.uid() and p.acesso_ativo and p.arquivado_em is null
$$;

-- Scripts internos (migração, painel do Supabase) rodam sem usuário logado.
create or replace function public.e_processo_interno()
returns boolean language sql stable set search_path = public as $$
  select auth.uid() is null and current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
$$;

-- ---------------------------------------------------------------------
-- Proteções de regra de negócio
-- ---------------------------------------------------------------------

-- Só quem administra acessos pode mudar perfil, liberar acesso ou vincular login.
create or replace function public.proteger_acesso_pessoa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.e_processo_interno() or public.tem_permissao('configuracoes', 'editar') then
    return new;
  end if;
  if tg_op = 'INSERT' and (new.perfil_id is not null or new.acesso_ativo or new.usuario_id is not null) then
    raise exception 'Somente a administração pode definir perfil e acesso.';
  end if;
  if tg_op = 'UPDATE' and (new.perfil_id is distinct from old.perfil_id
                        or new.acesso_ativo is distinct from old.acesso_ativo
                        or new.usuario_id is distinct from old.usuario_id) then
    raise exception 'Somente a administração pode alterar perfil e acesso.';
  end if;
  return new;
end $$;
create trigger pessoas_protecao_acesso before insert or update on public.pessoas
  for each row execute function public.proteger_acesso_pessoa();

-- Ninguém tira o último administrador ativo.
create or replace function public.manter_um_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.perfil_id = 'admin' and old.acesso_ativo
     and (new.perfil_id is distinct from 'admin' or not new.acesso_ativo or new.arquivado_em is not null)
     and not exists (select 1 from public.pessoas
                     where id <> old.id and perfil_id = 'admin' and acesso_ativo and arquivado_em is null) then
    raise exception 'O sistema precisa de pelo menos um administrador ativo.';
  end if;
  return new;
end $$;
create trigger pessoas_manter_admin before update on public.pessoas
  for each row execute function public.manter_um_admin();

-- Quem registra uma movimentação é sempre o usuário logado (não dá para assinar por outra pessoa).
create or replace function public.carimbar_movimentacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.e_processo_interno() then
    new.registrado_por := public.pessoa_atual_id();
    new.registrado_em := now();
  end if;
  return new;
end $$;
create trigger movimentacoes_carimbo before insert on public.movimentacoes_estoque
  for each row execute function public.carimbar_movimentacao();

-- Saída não pode deixar saldo negativo no local de origem.
create or replace function public.validar_saldo_origem()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  disponivel int;
  nome_local text;
begin
  if new.local_origem_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.variante_id::text || new.local_origem_id::text, 0));
  select coalesce(sum(case when local_destino_id = new.local_origem_id then quantidade else -quantidade end), 0)
    into disponivel
  from public.movimentacoes_estoque
  where variante_id = new.variante_id
    and (local_destino_id = new.local_origem_id or local_origem_id = new.local_origem_id);
  if disponivel < new.quantidade then
    select nome into nome_local from public.locais_estoque where id = new.local_origem_id;
    raise exception 'Saldo insuficiente em %: disponível %, pedido %.', nome_local, disponivel, new.quantidade;
  end if;
  return new;
end $$;
create trigger movimentacoes_saldo before insert on public.movimentacoes_estoque
  for each row execute function public.validar_saldo_origem();

-- ---------------------------------------------------------------------
-- Novo login: vincula a uma pessoa já cadastrada pelo e-mail.
-- O primeiro login do sistema vira administrador.
-- Os demais entram sem acesso até a administração liberar.
-- ---------------------------------------------------------------------
create or replace function public.vincular_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existente uuid;
  tem_admin boolean;
begin
  select id into existente from public.pessoas
   where email = lower(new.email) and usuario_id is null and arquivado_em is null
   limit 1;
  if existente is not null then
    update public.pessoas set usuario_id = new.id where id = existente;
    return new;
  end if;

  select exists (select 1 from public.pessoas where perfil_id = 'admin' and acesso_ativo and arquivado_em is null)
    into tem_admin;

  insert into public.pessoas (nome, email, usuario_id, perfil_id, acesso_ativo, e_funcionaria)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    lower(new.email), new.id,
    case when tem_admin then null else 'admin' end,
    not tem_admin,
    true);
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.vincular_novo_usuario();

-- ---------------------------------------------------------------------
-- Acesso às tabelas
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke all on all tables in schema public from authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
revoke insert, update on public.movimentacoes_estoque from authenticated;
grant insert on public.movimentacoes_estoque to authenticated;
revoke insert, update on public.auditoria from authenticated;
revoke insert, update on public.saldos_estoque from authenticated;
grant delete on public.produto_cores, public.grade_tamanhos to authenticated;

do $$
declare t text;
begin
  foreach t in array array['perfis', 'modulos', 'perfil_permissoes', 'pessoas', 'cores', 'grades', 'grade_tamanhos',
                           'colecoes', 'categorias', 'produtos', 'produto_cores', 'variantes', 'parceiros',
                           'locais_estoque', 'movimentacoes_estoque', 'auditoria']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Perfis e permissões: todos os usuários ativos leem; só a administração altera.
create policy ver on public.perfis for select to authenticated using (public.usuario_ativo());
create policy ver on public.modulos for select to authenticated using (public.usuario_ativo());
create policy ver on public.perfil_permissoes for select to authenticated using (public.usuario_ativo());
create policy criar on public.perfil_permissoes for insert to authenticated with check (public.tem_permissao('configuracoes', 'editar'));
create policy editar on public.perfil_permissoes for update to authenticated using (public.tem_permissao('configuracoes', 'editar'));
create policy criar on public.perfis for insert to authenticated with check (public.tem_permissao('configuracoes', 'editar'));
create policy editar on public.perfis for update to authenticated using (public.tem_permissao('configuracoes', 'editar'));

-- Pessoas: cada um vê o próprio cadastro; Pessoas/Configurações veem todos;
-- Comercial vê só quem é vendedora (para o caixa e as comissões).
create policy ver on public.pessoas for select to authenticated using (
  usuario_id = (select auth.uid())
  or public.tem_permissao('pessoas', 'ver')
  or public.tem_permissao('configuracoes', 'ver')
  or (e_vendedora and public.tem_permissao('comercial', 'ver')));
create policy criar on public.pessoas for insert to authenticated with check (
  public.tem_permissao('pessoas', 'criar') or public.tem_permissao('configuracoes', 'editar'));
create policy editar on public.pessoas for update to authenticated using (
  public.tem_permissao('pessoas', 'editar') or public.tem_permissao('configuracoes', 'editar'));

-- Cadastros auxiliares e produto: qualquer usuário ativo consulta (o caixa precisa);
-- criar/editar exige permissão no módulo Produto.
do $$
declare t text;
begin
  foreach t in array array['cores', 'grades', 'grade_tamanhos', 'colecoes', 'categorias', 'produtos', 'produto_cores', 'variantes']
  loop
    execute format('create policy ver on public.%I for select to authenticated using (public.usuario_ativo())', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (public.tem_permissao(''produto'', ''criar''))', t);
    execute format('create policy editar on public.%I for update to authenticated using (public.tem_permissao(''produto'', ''editar''))', t);
  end loop;
end $$;
create policy remover on public.produto_cores for delete to authenticated using (public.tem_permissao('produto', 'editar'));
create policy remover on public.grade_tamanhos for delete to authenticated using (public.tem_permissao('produto', 'editar'));

-- Parceiros: Produção, Marketing, Financeiro e Configurações.
create policy ver on public.parceiros for select to authenticated using (
  public.tem_permissao('producao', 'ver') or public.tem_permissao('marketing', 'ver')
  or public.tem_permissao('financeiro', 'ver') or public.tem_permissao('configuracoes', 'ver'));
create policy criar on public.parceiros for insert to authenticated with check (
  public.tem_permissao('producao', 'criar') or public.tem_permissao('marketing', 'criar')
  or public.tem_permissao('configuracoes', 'editar'));
create policy editar on public.parceiros for update to authenticated using (
  public.tem_permissao('producao', 'editar') or public.tem_permissao('marketing', 'editar')
  or public.tem_permissao('configuracoes', 'editar'));

-- Locais de estoque.
create policy ver on public.locais_estoque for select to authenticated using (public.usuario_ativo());
create policy criar on public.locais_estoque for insert to authenticated with check (public.tem_permissao('configuracoes', 'editar'));
create policy editar on public.locais_estoque for update to authenticated using (public.tem_permissao('configuracoes', 'editar'));

-- Livro de estoque: leitura para quem vê Estoque; cada módulo só lança os tipos que são dele.
create policy ver on public.movimentacoes_estoque for select to authenticated using (
  public.tem_permissao('estoque', 'ver')
  or (tipo in ('emprestimo_marketing', 'devolucao_marketing', 'brinde') and public.tem_permissao('marketing', 'ver'))
  or (tipo = 'retirada' and public.tem_permissao('pessoas', 'ver')));
create policy criar on public.movimentacoes_estoque for insert to authenticated with check (
  public.tem_permissao('estoque', 'criar')
  or (tipo in ('remessa_faccao', 'retorno_faccao', 'entrada_producao') and public.tem_permissao('producao', 'criar'))
  or (tipo in ('emprestimo_marketing', 'devolucao_marketing', 'brinde') and public.tem_permissao('marketing', 'criar'))
  or (tipo = 'retirada' and public.tem_permissao('pessoas', 'criar'))
  or (tipo in ('venda', 'troca') and public.tem_permissao('comercial', 'criar'))
  or (tipo = 'estorno' and public.tem_permissao('estoque', 'aprovar')));

-- Histórico: só quem administra o sistema.
create policy ver on public.auditoria for select to authenticated using (public.tem_permissao('configuracoes', 'ver'));

grant execute on function public.tem_permissao(text, text), public.minhas_permissoes(), public.usuario_ativo(),
  public.gerar_variantes(uuid), public.estornar_movimentacao(bigint, text), public.hoje_sp(),
  public.proximo_codigo_barras(), public.pessoa_atual_id(), public.usuario_atual(), public.e_processo_interno()
  to authenticated;
