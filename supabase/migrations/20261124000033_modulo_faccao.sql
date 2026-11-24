-- "Chegada da facção" vira um módulo próprio (faccao), separado do Quadro de produção.
-- Quem já via produção continua vendo a facção; o perfil Produção (Leide) fica só com o quadro.
insert into public.modulos (id, nome, ordem) values ('faccao', 'Chegada da facção', 25) on conflict (id) do nothing;

insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select perfil_id, 'faccao', acao from public.perfil_permissoes
 where modulo_id = 'producao' and perfil_id <> 'producao'
on conflict do nothing;

delete from public.perfil_permissoes where perfil_id = 'producao' and modulo_id in ('produto', 'estoque');

drop policy if exists ver on public.recebimentos;
drop policy if exists criar on public.recebimentos;
drop policy if exists editar on public.recebimentos;
create policy ver on public.recebimentos for select to authenticated using (public.tem_permissao('faccao', 'ver') or public.tem_permissao('estoque', 'criar'));
create policy criar on public.recebimentos for insert to authenticated with check (public.tem_permissao('faccao', 'criar') or public.tem_permissao('estoque', 'criar'));
create policy editar on public.recebimentos for update to authenticated using (public.tem_permissao('faccao', 'editar') or public.tem_permissao('estoque', 'criar'));

drop policy if exists criar on public.movimentacoes_estoque;
create policy criar on public.movimentacoes_estoque for insert to authenticated with check (
  public.tem_permissao('estoque', 'criar')
  or (tipo = any (array['remessa_faccao', 'retorno_faccao', 'entrada_producao']) and public.tem_permissao('faccao', 'criar'))
  or (tipo = 'liberacao' and public.tem_permissao('faccao', 'aprovar'))
  or (tipo = any (array['emprestimo_marketing', 'devolucao_marketing', 'brinde']) and public.tem_permissao('marketing', 'criar'))
  or (tipo = 'retirada' and public.tem_permissao('pessoas', 'criar'))
  or (tipo = any (array['venda', 'troca']) and public.tem_permissao('comercial', 'criar'))
  or (tipo = 'estorno' and public.tem_permissao('estoque', 'aprovar'))
);

create or replace function public.exigir_aprovacao_liberacao()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.tipo = 'liberacao' and not public.e_processo_interno()
     and not public.tem_permissao('faccao', 'aprovar') then
    raise exception 'Somente quem aprova a chegada da facção pode liberar peças para a loja.';
  end if;
  return new;
end $function$;
