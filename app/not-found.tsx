import Link from "next/link";
import { Vazio } from "@/components/cabecalho";

export default function NaoEncontrado() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
      <Vazio titulo="Página não encontrada" texto="O endereço pode ter mudado ou o registro foi arquivado.">
        <Link className="botao" href="/">Voltar ao início</Link>
      </Vazio>
    </main>
  );
}
