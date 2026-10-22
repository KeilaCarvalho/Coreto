-- Permite trocar a grade de tamanhos de um modelo já criado:
-- tamanhos novos ganham variantes; tamanhos que saíram da grade ficam desativados
-- (não são apagados, para não perder estoque nem histórico).
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

  update public.variantes v set ativa = (
           exists (select 1 from public.produto_cores pc where pc.produto_id = v.produto_id and pc.cor_id = v.cor_id)
           and exists (select 1 from public.produtos p join public.grade_tamanhos gt on gt.grade_id = p.grade_id
                       where p.id = v.produto_id and gt.tamanho = v.tamanho))
  where v.produto_id = p_produto_id;

  return criadas;
end $$;
