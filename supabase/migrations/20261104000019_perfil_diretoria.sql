-- "Minhas tarefas" vira um módulo com permissão própria (só Administração tem),
-- e o perfil Diretoria tem tudo o que a Administração tem, menos as tarefas.

insert into public.modulos (id, nome, ordem) values ('tarefas', 'Minhas tarefas', 90)
on conflict (id) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select 'admin', 'tarefas', a from unnest(array['ver','criar','editar','aprovar']) a
on conflict do nothing;

insert into public.perfis (id, nome, descricao)
values ('diretoria', 'Diretoria', 'Vê e opera todo o sistema, menos Minhas tarefas.')
on conflict (id) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select 'diretoria', modulo_id, acao from public.perfil_permissoes
where perfil_id = 'admin' and modulo_id <> 'tarefas'
on conflict do nothing;
