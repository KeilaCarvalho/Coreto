import { redirect } from "next/navigation";

/** Endereço antigo: a importação agora é uma só, para todos os relatórios. */
export default function Importar() {
  redirect("/comercial/relatorios");
}
