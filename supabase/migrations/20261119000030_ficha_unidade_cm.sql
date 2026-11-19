-- Ficha de custo: quantidade em cm/mm/g com preço por metro/kg.
create or replace function public.fator_unidade(u text) returns numeric
language sql immutable set search_path = public as $$
  select case
    when lower(trim(coalesce(u, ''))) in ('cm','cms','centimetro','centímetro','centimetros','centímetros') then 0.01
    when lower(trim(coalesce(u, ''))) in ('mm','milimetro','milímetro','milimetros','milímetros') then 0.001
    when lower(trim(coalesce(u, ''))) in ('g','gr','grs','grama','gramas') then 0.001
    else 1 end::numeric
$$;

create or replace function public.salvar_ficha_custo(p_produto uuid, p_taxas jsonb, p_itens jsonb, p_observacao text, p_preco numeric)
 returns jsonb language plpgsql set search_path to 'public' as $function$
declare
  t_simples numeric := coalesce((p_taxas ->> 'simples')::numeric, 0);
  t_cartao numeric := coalesce((p_taxas ->> 'cartao')::numeric, 0);
  t_comissao numeric := coalesce((p_taxas ->> 'comissao')::numeric, 0);
  t_fixas numeric := coalesce((p_taxas ->> 'despesas_fixas')::numeric, 0);
  t_lucro numeric := coalesce((p_taxas ->> 'lucro_desejado')::numeric, 0);
  custo numeric; sugerido numeric; preco_atual numeric; taxas numeric;
begin
  if t_simples + t_cartao + t_comissao + t_fixas + t_lucro >= 100 then
    raise exception 'A soma dos percentuais precisa ficar abaixo de 100%%.';
  end if;
  insert into public.fichas_custo (produto_id, simples, cartao, comissao, despesas_fixas, lucro_desejado, observacao)
  values (p_produto, t_simples, t_cartao, t_comissao, t_fixas, t_lucro, nullif(trim(p_observacao), ''))
  on conflict (produto_id) do update set
    simples = excluded.simples, cartao = excluded.cartao, comissao = excluded.comissao,
    despesas_fixas = excluded.despesas_fixas, lucro_desejado = excluded.lucro_desejado,
    observacao = excluded.observacao, atualizado_por = public.pessoa_atual_id();
  delete from public.ficha_custo_itens where produto_id = p_produto;
  insert into public.ficha_custo_itens (produto_id, ordem, tipo, descricao, quantidade, unidade, valor_unitario)
  select p_produto, ord::int, coalesce(e ->> 'tipo', 'outro'), trim(e ->> 'descricao'),
         coalesce((e ->> 'quantidade')::numeric, 1), nullif(trim(e ->> 'unidade'), ''), (e ->> 'valor_unitario')::numeric
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) with ordinality as x(e, ord);
  select round(coalesce(sum(quantidade * public.fator_unidade(unidade) * valor_unitario), 0), 2) into custo
    from public.ficha_custo_itens where produto_id = p_produto;
  sugerido := case when custo > 0 then round(custo / (1 - (t_simples + t_cartao + t_comissao + t_fixas + t_lucro) / 100), 2) end;
  update public.fichas_custo set custo_total = custo, preco_sugerido = sugerido where produto_id = p_produto;
  select preco_venda into preco_atual from public.produtos where id = p_produto;
  update public.produtos set custo_previsto = nullif(custo, 0), preco_venda = coalesce(p_preco, preco_venda) where id = p_produto;
  if p_preco is not null and p_preco is distinct from preco_atual then
    if p_preco <= 0 then raise exception 'O preço de venda precisa ser maior que zero.'; end if;
    taxas := t_simples + t_cartao + t_comissao + t_fixas;
    insert into public.historico_precos (produto_id, preco, custo, margem)
    values (p_produto, p_preco, nullif(custo, 0), case when custo > 0 then round((p_preco * (1 - taxas / 100) - custo) / p_preco * 100, 2) end);
  end if;
  return jsonb_build_object('custo', custo, 'sugerido', sugerido);
end $function$;

-- Linho da Blusa Monalisa foi digitado como 0,9 "cm", mas é 0,9 metro.
update public.ficha_custo_itens set unidade = 'm'
 where produto_id = '4daaa896-225b-4667-a91e-a4f4c82ffa91' and unidade = 'cm' and quantidade = 0.9;

-- Recalcula o custo das fichas já salvas com a nova conta.
with c as (
  select produto_id, round(sum(quantidade * public.fator_unidade(unidade) * valor_unitario), 2) custo
  from public.ficha_custo_itens group by produto_id
)
update public.fichas_custo f set custo_total = c.custo,
  preco_sugerido = case when c.custo > 0 then round(c.custo / (1 - (f.simples + f.cartao + f.comissao + f.despesas_fixas + f.lucro_desejado) / 100), 2) end
from c where c.produto_id = f.produto_id and f.custo_total is distinct from c.custo;
update public.produtos p set custo_previsto = nullif(f.custo_total, 0)
from public.fichas_custo f where f.produto_id = p.id and p.custo_previsto is distinct from nullif(f.custo_total, 0);
