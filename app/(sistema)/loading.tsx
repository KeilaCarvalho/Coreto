/** Aparece na hora em que se toca numa tela, enquanto ela carrega (o app não fica "parado"). */
export default function Carregando() {
  return (
    <div className="carregando" aria-busy="true" aria-label="Carregando">
      <div className="esq esq-titulo" />
      <div className="esq esq-linha" />
      <div className="esq-grade">
        <div className="esq esq-cartao" /><div className="esq esq-cartao" />
        <div className="esq esq-cartao" /><div className="esq esq-cartao" />
      </div>
      <div className="esq esq-painel" />
    </div>
  );
}
