import { redirect } from "next/navigation";

/** O cadastro agora abre em janela lateral na lista de clientes. */
export default function NovaCliente() {
  redirect("/comercial/clientes?nova=1");
}
