-- Diretoria só visualiza o Financeiro (Fluxo, Contas a pagar): sem lançar, editar ou importar.
delete from public.perfil_permissoes where perfil_id = 'diretoria' and modulo_id = 'financeiro' and acao <> 'ver';
