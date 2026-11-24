-- Registro de acessos: quando cada pessoa usou o sistema (para a administração ver).
alter table public.pessoas add column if not exists ultimo_acesso timestamptz;

create table if not exists public.acessos_dia (
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  dia date not null,
  primeiro timestamptz not null default now(),
  ultimo timestamptz not null default now(),
  vezes int not null default 1,
  primary key (pessoa_id, dia)
);
alter table public.acessos_dia enable row level security;
create policy ver on public.acessos_dia for select to authenticated using (public.tem_permissao('configuracoes', 'editar'));

-- Chamado a cada tela aberta; grava no máximo a cada 2 minutos por pessoa.
create or replace function public.registrar_acesso()
returns void language plpgsql security definer set search_path = public as $$
declare
  eu uuid := public.pessoa_atual_id();
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if eu is null then return; end if;
  update public.pessoas set ultimo_acesso = now()
   where id = eu and (ultimo_acesso is null or ultimo_acesso < now() - interval '2 minutes');
  if not found then return; end if;
  insert into public.acessos_dia (pessoa_id, dia) values (eu, hoje)
  on conflict (pessoa_id, dia) do update set ultimo = now(), vezes = public.acessos_dia.vezes + 1;
end $$;
revoke all on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;
