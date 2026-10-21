-- =====================================================================
-- Testes do banco: permissões, livro de estoque, grade e auditoria.
-- Cada bloco simula um usuário logado (papel "authenticated" + id do login).
-- =====================================================================
\set ON_ERROR_STOP 1

create schema teste;
grant usage on schema teste to authenticated, anon;

create function teste.ok(condicao boolean, descricao text) returns void language plpgsql as $$
begin
  if condicao is not true then raise exception 'FALHOU: %', descricao; end if;
  raise notice 'ok: %', descricao;
end $$;

-- Executa um comando que DEVE falhar com uma mensagem contendo "trecho".
create function teste.erro(comando text, trecho text, descricao text) returns void language plpgsql as $$
begin
  begin
    execute comando;
  exception when others then
    if sqlerrm ilike '%' || trecho || '%' then
      raise notice 'ok: % (bloqueado: %)', descricao, sqlerrm;
      return;
    end if;
    raise exception 'FALHOU: % (erro inesperado: %)', descricao, sqlerrm;
  end;
  raise exception 'FALHOU: % (deveria ter sido bloqueado)', descricao;
end $$;
grant execute on all functions in schema teste to authenticated, anon;

create table teste.ids (nome text primary key, id uuid);
grant select on teste.ids to authenticated;

-- ---------------------------------------------------------------------
-- 1. Primeiro login vira administrador; os seguintes entram sem acesso.
-- ---------------------------------------------------------------------
insert into auth.users (email, raw_user_meta_data) values ('ana@coreto.com.br', '{"full_name":"Ana Coreto"}');
insert into auth.users (email) values ('bia@gmail.com');
insert into teste.ids select 'ana', id from auth.users where email = 'ana@coreto.com.br';
insert into teste.ids select 'bia', id from auth.users where email = 'bia@gmail.com';

select teste.ok((select perfil_id = 'admin' and acesso_ativo and nome = 'Ana Coreto' from public.pessoas where email = 'ana@coreto.com.br'),
                'primeiro login vira administrador ativo');
select teste.ok((select perfil_id is null and not acesso_ativo from public.pessoas where email = 'bia@gmail.com'),
                'segundo login entra sem acesso');

-- ---------------------------------------------------------------------
-- 2. Administração cadastra produto, cores e gera a grade.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);

insert into public.pessoas (nome, email, perfil_id, acesso_ativo, e_vendedora)
values ('Carla Vendas', 'carla@coreto.com.br', 'vendedora', true, true);

insert into public.cores (nome, codigo, hex) values ('Verde Água', 'VAG', '#46D7AC'), ('Preto', 'PRT', '#111111');
insert into public.produtos (referencia, nome, grade_id, preco_venda)
values ('VL001', 'Vestido Lírio', (select id from public.grades where nome = 'PP ao GG'), 289.90);
insert into public.produto_cores (produto_id, cor_id)
select p.id, c.id from public.produtos p, public.cores c where p.referencia = 'VL001';

select teste.ok(public.gerar_variantes((select id from public.produtos where referencia = 'VL001')) = 10,
                'grade 2 cores × 5 tamanhos gera 10 variantes');
select teste.ok(public.gerar_variantes((select id from public.produtos where referencia = 'VL001')) = 0,
                'gerar de novo não duplica variantes');
select teste.ok(exists (select 1 from public.variantes where sku = 'VL001-VAG-M'), 'SKU no formato REFERÊNCIA-COR-TAMANHO');
select teste.ok((select bool_and(codigo_barras ~ '^2[0-9]{12}$') from public.variantes), 'código de barras EAN-13 interno');
select teste.erro($$insert into public.produtos (referencia, nome, grade_id) values ('vl001', 'Outro', (select id from public.grades limit 1))$$,
                  'produtos_referencia_unica', 'referência repetida (maiúscula/minúscula) é recusada');

-- Entrada de produção na loja: 10 peças do verde M.
insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_destino_id, registrado_por)
values ('entrada_producao', (select id from public.variantes where sku = 'VL001-VAG-M'), 10,
        (select id from public.locais_estoque where nome = 'Loja'),
        (select id from public.pessoas where email = 'bia@gmail.com'));  -- tenta assinar por outra pessoa
select teste.ok((select saldo from public.saldos_estoque s join public.variantes v on v.id = s.variante_id
                 join public.locais_estoque l on l.id = s.local_id where v.sku = 'VL001-VAG-M' and l.nome = 'Loja') = 10,
                'entrada de 10 peças aparece no saldo da loja');
select teste.ok((select registrado_por = (select id from public.pessoas where email = 'ana@coreto.com.br')
                 from public.movimentacoes_estoque order by id desc limit 1),
                'movimentação fica assinada por quem está logado, não por quem foi informado');

-- Facção: cadastrar o parceiro cria o local de estoque dela.
insert into public.parceiros (tipo, nome) values ('faccao', 'Oficina Teste');
select teste.ok(exists (select 1 from public.locais_estoque where nome = 'Facção · Oficina Teste'),
                'cadastrar facção cria o local de estoque dela');
commit;

-- ---------------------------------------------------------------------
-- 3. Vendedora: vê produtos, vende, mas não mexe no que não é dela.
-- ---------------------------------------------------------------------
insert into auth.users (email) values ('carla@coreto.com.br');
insert into teste.ids select 'carla', id from auth.users where email = 'carla@coreto.com.br';
select teste.ok((select usuario_id is not null and perfil_id = 'vendedora' from public.pessoas where email = 'carla@coreto.com.br'),
                'login de pessoa já cadastrada é vinculado pelo e-mail');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'carla'), true);

select teste.ok((select count(*) from public.produtos) = 1, 'vendedora consulta produtos');
insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_origem_id)
values ('venda', (select id from public.variantes where sku = 'VL001-VAG-M'), 2,
        (select id from public.locais_estoque where nome = 'Loja'));
select teste.ok((select saldo from public.saldos_estoque s join public.variantes v on v.id = s.variante_id
                 where v.sku = 'VL001-VAG-M') = 8, 'venda de 2 peças baixa o saldo para 8');
select teste.erro($$insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_destino_id)
                    values ('entrada_producao', (select id from public.variantes where sku = 'VL001-VAG-M'), 5,
                            (select id from public.locais_estoque where nome = 'Loja'))$$,
                  'row-level security', 'vendedora não lança entrada de produção');
select teste.erro($$insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_origem_id)
                    values ('venda', (select id from public.variantes where sku = 'VL001-VAG-M'), 100,
                            (select id from public.locais_estoque where nome = 'Loja'))$$,
                  'Saldo insuficiente', 'venda acima do saldo é recusada');
select teste.ok((select count(*) from public.pessoas) = 1, 'vendedora só enxerga o próprio cadastro (e outras vendedoras)');
select teste.ok((select count(*) from public.auditoria) = 0, 'vendedora não lê o histórico de alterações');
update public.pessoas set perfil_id = 'admin' where usuario_id = auth.uid();
select teste.ok((select perfil_id from public.pessoas where usuario_id = auth.uid()) = 'vendedora',
                'vendedora não se promove a administradora');
select teste.erro($$insert into public.produtos (referencia, nome, grade_id) values ('X1', 'X', (select id from public.grades limit 1))$$,
                  'row-level security', 'vendedora não cadastra produto');
select teste.erro($$select public.estornar_movimentacao((select max(id) from public.movimentacoes_estoque), 'teste')$$,
                  'row-level security', 'vendedora não estorna movimentação');
commit;

-- ---------------------------------------------------------------------
-- 4. Login sem acesso liberado não enxerga nada.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'bia'), true);
select teste.ok((select count(*) from public.produtos) = 0, 'usuário sem acesso não vê produtos');
select teste.ok((select count(*) from public.movimentacoes_estoque) = 0, 'usuário sem acesso não vê estoque');
select teste.ok((select count(*) from public.minhas_permissoes()) = 0, 'usuário sem acesso não tem permissões');
commit;

begin;
set local role anon;
select teste.erro('select count(*) from public.produtos', 'permission denied', 'visitante sem login não lê nada');
commit;

-- ---------------------------------------------------------------------
-- 5. Livro imutável, estorno e facção.
-- ---------------------------------------------------------------------
select teste.erro('update public.movimentacoes_estoque set quantidade = 1', 'não pode ser alterado', 'livro não aceita alteração nem do dono do banco');
select teste.erro('delete from public.movimentacoes_estoque', 'não pode ser alterado', 'livro não aceita exclusão');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);
select public.estornar_movimentacao((select id from public.movimentacoes_estoque where tipo = 'venda'), 'Venda lançada por engano');
select teste.ok((select saldo from public.saldos_estoque s join public.variantes v on v.id = s.variante_id
                 where v.sku = 'VL001-VAG-M') = 10, 'estorno da venda devolve o saldo para 10');
select teste.erro($$select public.estornar_movimentacao((select id from public.movimentacoes_estoque where tipo = 'venda'), 'de novo')$$,
                  'movimentacoes_estoque_estorno_de_key', 'a mesma movimentação não é estornada duas vezes');

insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_origem_id, local_destino_id)
values ('remessa_faccao', (select id from public.variantes where sku = 'VL001-VAG-M'), 3,
        (select id from public.locais_estoque where nome = 'Loja'),
        (select id from public.locais_estoque where nome = 'Facção · Oficina Teste'));
select teste.ok((select saldo from public.saldos_estoque s join public.locais_estoque l on l.id = s.local_id
                 where l.nome = 'Facção · Oficina Teste') = 3, 'saldo em poder da facção = 3');
select teste.erro($$insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_origem_id, local_destino_id)
                    values ('retorno_faccao', (select id from public.variantes where sku = 'VL001-VAG-M'), 4,
                            (select id from public.locais_estoque where nome = 'Facção · Oficina Teste'),
                            (select id from public.locais_estoque where nome = 'Loja'))$$,
                  'Saldo insuficiente', 'facção não devolve mais do que recebeu');

select teste.erro($$update public.pessoas set perfil_id = 'gestao' where email = 'ana@coreto.com.br'$$,
                  'pelo menos um administrador', 'o último administrador não pode perder o acesso');
select teste.ok((select count(*) from public.auditoria where tabela = 'produtos' and acao = 'criou') = 1,
                'histórico registra a criação do produto');
select teste.ok((select count(*) from public.auditoria where tabela = 'movimentacoes_estoque') >= 4,
                'histórico registra as movimentações');
commit;

-- ---------------------------------------------------------------------
-- 6. Chegada da facção, precificação e liberação.
-- ---------------------------------------------------------------------
insert into auth.users (email) values ('dani@coreto.com.br');
insert into teste.ids select 'dani', id from auth.users where email = 'dani@coreto.com.br';
update public.pessoas set perfil_id = 'conferencia', acesso_ativo = true where email = 'dani@coreto.com.br';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);
insert into public.produtos (referencia, nome, grade_id) values ('BL002', 'Blusa Íris', (select id from public.grades where nome = 'PP ao GG'));
insert into public.produto_cores (produto_id, cor_id) select p.id, c.id from public.produtos p, public.cores c where p.referencia = 'BL002' and c.codigo = 'PRT';
select public.gerar_variantes((select id from public.produtos where referencia = 'BL002'));
commit;

-- A conferência conta as peças, mas não libera.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'dani'), true);
select public.registrar_recebimento(null, (select id from public.produtos where referencia = 'BL002'),
  (select id from public.parceiros where nome = 'Oficina Teste'), public.hoje_sp(), 'primeira entrega',
  jsonb_build_array(
    jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-P'), 'quantidade', 6),
    jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-M'), 'quantidade', 4),
    jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-G'), 'quantidade', 0)));
select teste.ok((select recebido = 10 and aguardando = 10 and situacao = 'sem_preco' from public.recebimentos_resumo), 'lote de 10 peças fica aguardando preço');
select teste.ok(not exists (select 1 from public.saldos_estoque s join public.locais_estoque l on l.id = s.local_id
                            join public.variantes v on v.id = s.variante_id where v.sku like 'BL002%' and l.tipo = 'loja'),
                'peças do lote não aparecem na loja antes da liberação');
select teste.erro($$select public.liberar_recebimento((select id from public.recebimentos), (select id from public.locais_estoque where nome = 'Loja'),
                    jsonb_build_array(jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-P'), 'quantidade', 1)))$$,
                  'preço', 'sem preço o lote não é liberado');
select teste.ok((select count(*) from public.fichas_custo) = 0, 'conferência não vê fichas de custo');
update public.recebimentos set pendente = true, pendencia = 'Faltaram 2 G pretas';
select teste.ok((select situacao from public.recebimentos_resumo) = 'pendente', 'lote marcado como pendente');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);
select teste.ok((public.salvar_ficha_custo((select id from public.produtos where referencia = 'BL002'),
  '{"simples": 6, "cartao": 4, "comissao": 5, "despesas_fixas": 15, "lucro_desejado": 20}',
  '[{"tipo":"material","descricao":"Viscose","quantidade":1.5,"unidade":"m","valor_unitario":20},
    {"tipo":"mao_de_obra","descricao":"Facção","quantidade":1,"valor_unitario":15}]', null, 99.90) ->> 'sugerido')::numeric = 90,
  'custo 45 com 50% de taxas e lucro sugere R$ 90,00');
select teste.ok((select preco_venda = 99.90 and custo_previsto = 45 from public.produtos where referencia = 'BL002'), 'preço e custo gravados no produto');
select teste.ok((select margem = 24.95 from public.historico_precos), 'histórico guarda a margem real (24,95%)');

select teste.erro($$select public.liberar_recebimento((select id from public.recebimentos), (select id from public.locais_estoque where nome = 'Loja'),
                    jsonb_build_array(jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-P'), 'quantidade', 7)))$$,
                  'Só há 6', 'não libera mais do que chegou');
select public.liberar_recebimento((select id from public.recebimentos), (select id from public.locais_estoque where nome = 'Loja'),
  jsonb_build_array(jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-P'), 'quantidade', 6)));
select teste.ok((select liberado = 6 and aguardando = 4 from public.recebimentos_resumo), 'liberação parcial: 6 na loja, 4 aguardando');
select teste.ok((select saldo from public.saldos_estoque s join public.variantes v on v.id = s.variante_id
                 join public.locais_estoque l on l.id = s.local_id where v.sku = 'BL002-PRT-P' and l.nome = 'Loja') = 6,
                'peças liberadas aparecem no saldo da loja');
select teste.erro($$insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_origem_id, local_destino_id)
                    values ('transferencia', (select id from public.variantes where sku = 'BL002-PRT-M'), 1,
                            public.local_recebimento_id(), (select id from public.locais_estoque where nome = 'Loja'))$$,
                  'só saem pela tela', 'transferência manual não tira peça do lote');

select public.registrar_recebimento((select id from public.recebimentos), null, null, public.hoje_sp(), null,
  jsonb_build_array(jsonb_build_object('variante_id', (select id from public.variantes where sku = 'BL002-PRT-G'), 'quantidade', 2)));
update public.recebimentos set pendente = false;
select teste.ok((select recebido = 12 and aguardando = 6 and situacao = 'pronto' from public.recebimentos_resumo), 'complemento entra no mesmo lote');
select public.liberar_recebimento((select id from public.recebimentos), (select id from public.locais_estoque where nome = 'Loja'),
  (select jsonb_agg(jsonb_build_object('variante_id', variante_id, 'quantidade', aguardando)) from public.recebimento_itens where aguardando > 0));
select teste.ok((select situacao from public.recebimentos_resumo) = 'concluido', 'lote todo liberado fica concluído');
select public.estornar_movimentacao((select max(id) from public.movimentacoes_estoque where tipo = 'liberacao'), 'liberada por engano');
select teste.ok((select situacao from public.recebimentos_resumo) = 'pronto', 'estorno da liberação volta peças para o lote');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'dani'), true);
select teste.erro($$insert into public.movimentacoes_estoque (tipo, variante_id, quantidade, local_origem_id, local_destino_id, documento_tipo, documento_id)
                    values ('liberacao', (select variante_id from public.recebimento_itens where aguardando > 0 limit 1), 1,
                            public.local_recebimento_id(), (select id from public.locais_estoque where nome = 'Loja'),
                            'recebimento', (select id::text from public.recebimentos))$$,
                  'Somente quem aprova', 'conferência não libera peças');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'carla'), true);
select teste.ok((select count(*) from public.recebimentos) = 0 and (select count(*) from public.historico_precos) = 0,
                'vendedora não vê recebimentos nem custos');
commit;

-- ---------------------------------------------------------------------
-- 7. Fluxo financeiro: só o financeiro vê e lança.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);
insert into public.fluxo_dias (data, vendas, saldos, a_receber)
values ('2026-10-16', '[{"nome":"Pix","valor":1200.5}]', '[{"nome":"Itaú","valor":8000}]', '[{"nome":"Pagarme","valor":500}]');
insert into public.fluxo_meses (mes, vendas, vendedoras, contas_a_pagar, contas_pagas)
values ('2026-10-01', '[{"nome":"Pix","valor":30000}]', '[{"nome":"Carla","valor":12000}]', 15000, 9000);
select teste.ok((select atualizado_por is not null from public.fluxo_dias), 'fluxo do dia registra quem lançou');
select teste.erro($$insert into public.fluxo_meses (mes) values ('2026-10-15')$$, 'check', 'mês do fluxo é sempre o dia 1');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'carla'), true);
select teste.ok((select count(*) from public.fluxo_dias) = 0 and (select count(*) from public.fluxo_meses) = 0, 'vendedora não vê o fluxo financeiro');
select teste.erro($$insert into public.fluxo_dias (data) values ('2026-10-17')$$, 'row-level security', 'vendedora não lança no fluxo');
commit;

-- ---------------------------------------------------------------------
-- 8. Clientes: importação, carteira de cada vendedora e contatos.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);
update public.pessoas set nome_vendas = 'CARLA V' where email = 'carla@coreto.com.br';
select teste.ok((public.importar_clientes('primeira_compra', '[
  {"codigo":"101","nome":"Maria Souza","telefone":"62999990000","cidade":"Goiânia","uf":"GO","vendedora":"Carla V","primeira_compra":"2026-09-02","qtd_pecas":3,"total_gasto":450},
  {"codigo":"102","nome":"Joana Lima","telefone":"62988880000","vendedora":"BRUNA","primeira_compra":"2026-09-05","qtd_pecas":1,"total_gasto":120},
  {"codigo":"103","nome":""}]', 'primeira.pdf', '2026-09') ->> 'importados')::int = 2, 'importa 2 clientes e ignora a linha sem nome');
select teste.ok((select vendedora_id = (select id from public.pessoas where email = 'carla@coreto.com.br') from public.clientes where codigo_externo = '101'),
                'cliente fica na carteira da vendedora pelo nome do relatório');
select public.importar_clientes('aniversariantes', '[{"codigo":"101","nome":"Maria Souza","nascimento":"1990-10-20","cpf":"123.456.789-00"}]', 'aniv.pdf');
select teste.ok((select nascimento = '1990-10-20' and telefone = '62999990000' from public.clientes where codigo_externo = '101'),
                'aniversariantes completam o cadastro sem apagar o telefone');
select public.importar_clientes('vendas_vendedora', '[
  {"codigo_venda":"900001","data":"2026-10-03","nome":"MARIA SOUZA","vendedora":"CARLA V","valor":300},
  {"codigo_venda":"900002","data":"2026-10-10","nome":"Maria  Souza","vendedora":"CARLA V","valor":200}]', 'vendas.pdf', '2026-10');
select teste.ok((select qtd_compras = 2 and total_gasto = 500 and ultima_compra = '2026-10-10' from public.clientes where codigo_externo = '101'),
                'vendas importadas atualizam compras, total e última compra');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'carla'), true);
select teste.ok((select count(*) from public.clientes) = 1, 'vendedora vê só a própria carteira');
insert into public.cliente_contatos (cliente_id, etapa, nota, proximo_contato)
values ((select id from public.clientes where codigo_externo = '101'), 'aguardando_retorno', 'Mandei a coleção nova', '2026-10-20');
select teste.ok((select etapa = 'aguardando_retorno' and proximo_contato = '2026-10-20' from public.clientes where codigo_externo = '101'),
                'contato atualiza a etapa e o próximo retorno');
insert into public.clientes (nome, telefone, vendedora_id) values ('Paula Nova', '62977770000', null);
select teste.ok((select vendedora_id = (select id from public.pessoas where email = 'carla@coreto.com.br') from public.clientes where nome = 'Paula Nova'),
                'cliente cadastrada pela vendedora entra na carteira dela');
select teste.erro($$select public.importar_clientes('carteira', '[{"nome":"X"}]', 'x.csv')$$, 'gestão comercial', 'vendedora não importa relatórios');
select teste.ok((select count(*) from public.importacoes_clientes) = 0, 'vendedora não vê o histórico de importações');
commit;

-- ---------------------------------------------------------------------
-- 9. Nenhuma função do sistema pode ser chamada sem login.
-- ---------------------------------------------------------------------
select teste.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                            and has_function_privilege('anon', p.oid, 'execute')),
                'visitante sem login não executa nenhuma função');

-- ---------------------------------------------------------------------
-- 10. Notas de compra: o insumo fica com o preço da nota mais recente.
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'ana'), true);
select public.registrar_nota_compra('123', 'Tecidos Goiás', '2026-10-01', null,
  '[{"nome":"Tule preto","tipo":"tecido","unidade":"m","quantidade":10,"valor_unitario":18.5},
    {"nome":"Zíper invisível","tipo":"aviamento","unidade":"un","quantidade":50,"valor_unitario":1.2}]');
select teste.ok((select ultimo_preco = 18.5 and unidade = 'm' and ultimo_fornecedor = 'Tecidos Goiás' from public.insumos where nome = 'Tule preto'),
                'nota cria o insumo com o preço pago');
select teste.ok((select valor_total = 245 from public.notas_compra where numero = '123'), 'nota guarda o valor total');
select public.registrar_nota_compra('130', 'Armarinho Central', '2026-10-15', null, '[{"nome":"tule PRETO","quantidade":5,"valor_unitario":21}]');
select teste.ok((select count(*) = 1 and max(ultimo_preco) = 21 from public.insumos where lower(nome) = 'tule preto'),
                'mesmo insumo com outra escrita é reaproveitado e fica com o preço novo');
select public.registrar_nota_compra('110', 'Tecidos Goiás', '2026-09-20', null, '[{"nome":"Tule preto","quantidade":5,"valor_unitario":15}]');
select teste.ok((select ultimo_preco = 21 from public.insumos where nome = 'Tule preto'), 'nota mais antiga não troca o último preço');
select public.excluir_nota_compra((select id from public.notas_compra where numero = '130'));
select teste.ok((select ultimo_preco = 18.5 and ultimo_preco_em = '2026-10-01' from public.insumos where nome = 'Tule preto'),
                'apagar a nota volta o preço da nota anterior');
select teste.erro($$select public.registrar_nota_compra('1', 'X', '2999-01-01', null, '[{"nome":"a","quantidade":1,"valor_unitario":1}]')$$, 'futuro', 'nota com data futura é recusada');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teste.ids where nome = 'carla'), true);
select teste.ok((select count(*) from public.insumos) = 0, 'vendedora não vê preços de insumos');
select teste.erro($$select public.registrar_nota_compra('9', 'X', null, null, '[{"nome":"a","quantidade":1,"valor_unitario":1}]')$$, 'row-level security', 'vendedora não lança nota');
commit;
