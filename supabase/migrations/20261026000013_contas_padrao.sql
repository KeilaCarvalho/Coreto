-- Contas de banco do fluxo financeiro guardadas como padrão:
-- vêm preenchidas em todo lançamento novo, mesmo que num dia o saldo fique zerado.
create table public.fluxo_config (
  unico          boolean primary key default true check (unico),
  contas_padrao  jsonb not null default '[]' check (jsonb_typeof(contas_padrao) = 'array'),  -- ["Itaú", "Nubank", ...]
  atualizado_por uuid references public.pessoas(id),
  atualizado_em  timestamptz not null default now()
);
create trigger fluxo_config_carimbo before insert or update on public.fluxo_config
  for each row execute function public.carimbar_fluxo();

-- Começa com as contas do último dia lançado.
insert into public.fluxo_config default values;
update public.fluxo_config set contas_padrao = coalesce((
  select jsonb_agg(l ->> 'nome') from jsonb_array_elements(
    (select saldos from public.fluxo_dias order by data desc limit 1)) l
  where coalesce(l ->> 'nome', '') <> ''), '[]');

alter table public.fluxo_config enable row level security;
revoke all on public.fluxo_config from anon, authenticated;
grant select, update on public.fluxo_config to authenticated;
create policy ver on public.fluxo_config for select to authenticated using (public.tem_permissao('financeiro', 'ver'));
create policy editar on public.fluxo_config for update to authenticated
  using (public.tem_permissao('financeiro', 'criar') or public.tem_permissao('financeiro', 'editar'));
