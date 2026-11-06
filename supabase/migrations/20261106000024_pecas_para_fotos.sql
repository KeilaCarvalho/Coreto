-- Peças para fotos: o perfil Marketing só lança saídas/devoluções de fotos (sem ver estoque nem catálogo no menu).
delete from public.perfil_permissoes where perfil_id = 'marketing' and modulo_id in ('produto', 'estoque');
update public.perfis set descricao = 'Só lança as peças que saem para fotos e as devoluções.' where id = 'marketing';

-- Saldo disponível para tirar peças (Loja, Depósito, Aguardando liberação) e o que está com o marketing.
create or replace function public.saldos_para_fotos()
returns table (variante_id uuid, local_id uuid, saldo integer)
language sql stable security definer set search_path = public as $$
  select s.variante_id, s.local_id, s.saldo
  from public.saldos_estoque s
  join public.locais_estoque l on l.id = s.local_id
  where (public.tem_permissao('marketing', 'ver') or public.tem_permissao('estoque', 'ver'))
    and l.tipo in ('loja', 'deposito', 'recebimento', 'marketing') and s.saldo > 0
$$;
revoke all on function public.saldos_para_fotos() from public, anon;
grant execute on function public.saldos_para_fotos() to authenticated;
