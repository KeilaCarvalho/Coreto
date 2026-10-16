-- Funções de gatilho não devem ser chamadas pela API; os gatilhos continuam disparando normalmente.
revoke execute on function
  public.carimbar_movimentacao(), public.criar_local_da_faccao(), public.manter_um_admin(),
  public.proteger_acesso_pessoa(), public.registrar_auditoria(), public.validar_saldo_origem(),
  public.vincular_novo_usuario(), public.tocar_atualizado_em(), public.bloquear_alteracao_livro()
from authenticated, anon, public;
