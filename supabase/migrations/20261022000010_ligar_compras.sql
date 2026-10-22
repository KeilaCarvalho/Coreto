-- Vendas importadas antes das clientes ficavam soltas (sem cliente).
-- Agora, a cada importação, as compras soltas são ligadas à cliente de mesmo nome
-- (só quando existe uma única cliente com aquele nome) e os totais são recalculados.
create or replace function public.recalcular_clientes()
returns void language sql security definer set search_path = public as $$
  with unicas as (
    select public.normalizar_nome(nome) as chave, min(id::text)::uuid as id
      from public.clientes where arquivado_em is null
     group by 1 having count(*) = 1
  )
  update public.cliente_compras v set cliente_id = u.id
    from unicas u
   where v.cliente_id is null and u.chave = public.normalizar_nome(v.cliente_nome);

  update public.clientes c
     set ultima_compra = t.ultima, qtd_compras = t.qtd, total_gasto = t.total
    from (select cliente_id, max(data) as ultima, count(*)::int as qtd, sum(valor) as total
            from public.cliente_compras where cliente_id is not null group by cliente_id) t
   where t.cliente_id = c.id
     and (c.ultima_compra, c.qtd_compras, c.total_gasto) is distinct from (t.ultima, t.qtd, t.total);
$$;
