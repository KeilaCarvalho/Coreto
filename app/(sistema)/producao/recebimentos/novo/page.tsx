import { redirect } from "next/navigation";

/** Endereço antigo: o registro de chegada agora abre numa janela na lista de lotes. */
export default async function NovoRecebimento({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  redirect(`/producao/recebimentos?registrar=1${produto && /^[0-9a-f-]{36}$/i.test(produto) ? `&produto=${produto}` : ""}`);
}
