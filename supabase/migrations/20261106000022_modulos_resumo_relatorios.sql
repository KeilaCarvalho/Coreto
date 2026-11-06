-- "Resumo do dia" e "Importar relatórios" viram módulos próprios: Administração tem, Diretoria não.
insert into public.modulos (id, nome, ordem) values ('resumo', 'Resumo do dia', 65), ('relatorios', 'Importar relatórios', 45)
on conflict (id) do nothing;
insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select 'admin', m, a from unnest(array['resumo','relatorios']) m, unnest(array['ver','criar','editar','aprovar']) a
on conflict do nothing;
insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select distinct 'gestao', 'resumo', 'ver' from public.perfil_permissoes where perfil_id = 'gestao' and modulo_id = 'financeiro' and acao = 'ver'
on conflict do nothing;
insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select distinct 'gestao', 'relatorios', 'ver' from public.perfil_permissoes where perfil_id = 'gestao' and ((modulo_id = 'comercial' and acao = 'aprovar') or (modulo_id = 'financeiro' and acao = 'editar'))
on conflict do nothing;
