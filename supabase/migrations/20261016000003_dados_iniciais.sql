-- =====================================================================
-- Coreto · Dados iniciais: módulos, perfis, permissões, locais e grades
-- =====================================================================

insert into public.modulos (id, nome, ordem) values
  ('produto',       'Produto',        10),
  ('producao',      'Produção',       20),
  ('estoque',       'Estoque',        30),
  ('comercial',     'Comercial',      40),
  ('marketing',     'Marketing',      50),
  ('financeiro',    'Financeiro',     60),
  ('pessoas',       'Pessoas',        70),
  ('configuracoes', 'Configurações',  80);

insert into public.perfis (id, nome, descricao) values
  ('admin',       'Administração', 'Acesso total, inclusive usuários e permissões.'),
  ('gestao',      'Gestão',        'Acompanha todos os números; opera Financeiro e Comercial.'),
  ('producao',    'Produção',      'Produtos, ordens de produção e facções.'),
  ('conferencia', 'Conferência',   'Recebimento e conferência de peças no estoque.'),
  ('vendedora',   'Vendedora',     'Caixa, vendas e clientes.'),
  ('marketing',   'Marketing',     'Peças para fotos, sessões e conteúdo.');

-- Matriz de permissões: perfil × módulo × ações.
insert into public.perfil_permissoes (perfil_id, modulo_id, acao)
select perfil, modulo, acao
from (values
  ('admin', 'produto',       '{ver,criar,editar,aprovar}'),
  ('admin', 'producao',      '{ver,criar,editar,aprovar}'),
  ('admin', 'estoque',       '{ver,criar,editar,aprovar}'),
  ('admin', 'comercial',     '{ver,criar,editar,aprovar}'),
  ('admin', 'marketing',     '{ver,criar,editar,aprovar}'),
  ('admin', 'financeiro',    '{ver,criar,editar,aprovar}'),
  ('admin', 'pessoas',       '{ver,criar,editar,aprovar}'),
  ('admin', 'configuracoes', '{ver,criar,editar,aprovar}'),

  ('gestao', 'produto',      '{ver}'),
  ('gestao', 'producao',     '{ver}'),
  ('gestao', 'estoque',      '{ver}'),
  ('gestao', 'comercial',    '{ver,criar,editar,aprovar}'),
  ('gestao', 'marketing',    '{ver}'),
  ('gestao', 'financeiro',   '{ver,criar,editar}'),
  ('gestao', 'pessoas',      '{ver}'),

  ('producao', 'produto',    '{ver,criar,editar}'),
  ('producao', 'producao',   '{ver,criar,editar,aprovar}'),
  ('producao', 'estoque',    '{ver}'),

  ('conferencia', 'produto', '{ver}'),
  ('conferencia', 'producao','{ver}'),
  ('conferencia', 'estoque', '{ver,criar}'),

  ('vendedora', 'produto',   '{ver}'),
  ('vendedora', 'estoque',   '{ver}'),
  ('vendedora', 'comercial', '{ver,criar}'),

  ('marketing', 'produto',   '{ver}'),
  ('marketing', 'estoque',   '{ver}'),
  ('marketing', 'marketing', '{ver,criar,editar}')
) as m(perfil, modulo, acoes)
cross join lateral unnest(acoes::text[]) as acao;

insert into public.locais_estoque (nome, tipo) values
  ('Loja', 'loja'),
  ('Depósito', 'deposito'),
  ('Marketing', 'marketing');

with g as (
  insert into public.grades (nome) values ('PP ao GG'), ('Numérica 34 ao 46'), ('Tamanho único')
  returning id, nome
)
insert into public.grade_tamanhos (grade_id, tamanho, ordem)
select g.id, t.tamanho, t.ordem
from g
join (values
  ('PP ao GG', 'PP', 1), ('PP ao GG', 'P', 2), ('PP ao GG', 'M', 3), ('PP ao GG', 'G', 4), ('PP ao GG', 'GG', 5),
  ('Numérica 34 ao 46', '34', 1), ('Numérica 34 ao 46', '36', 2), ('Numérica 34 ao 46', '38', 3),
  ('Numérica 34 ao 46', '40', 4), ('Numérica 34 ao 46', '42', 5), ('Numérica 34 ao 46', '44', 6),
  ('Numérica 34 ao 46', '46', 7),
  ('Tamanho único', 'U', 1)
) as t(grade, tamanho, ordem) on t.grade = g.nome;
