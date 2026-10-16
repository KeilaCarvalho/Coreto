import Link from "next/link";
import { exigir } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/cabecalho";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { CamposCliente } from "@/components/campos-cliente";
import { criarCliente } from "../../acoes";

export const metadata = { title: "Nova cliente" };

export default async function NovaCliente() {
  const sessao = await exigir("comercial", "criar");
  const gestao = sessao.pode("comercial", "aprovar");
  let vendedoras: { id: string; nome: string }[] | undefined;
  if (gestao) {
    const supabase = await supabaseServidor();
    const { data } = await supabase.from("pessoas").select("id, nome, apelido").eq("e_vendedora", true).is("arquivado_em", null).order("nome");
    vendedoras = (data ?? []).map((v) => ({ id: v.id, nome: v.apelido || v.nome }));
  }
  return (
    <>
      <Cabecalho trilha={[{ rotulo: "Clientes", href: "/comercial/clientes" }]} titulo="Nova cliente"
        descricao={gestao ? "Para quem ainda não aparece nos relatórios do sistema de vendas." : "A cliente entra direto na sua carteira."} />
      <section className="painel" style={{ maxWidth: 820 }}>
        <div className="painel-corpo" style={{ paddingTop: 22 }}>
          <FormAcao acao={criarCliente}>
            <CamposCliente vendedoras={vendedoras} valores={{ uf: "GO", cidade: "Goiânia" }} />
            <div className="formulario-rodape">
              <Link className="botao secundario" href="/comercial/clientes">Cancelar</Link>
              <BotaoEnviar>Cadastrar cliente</BotaoEnviar>
            </div>
          </FormAcao>
        </div>
      </section>
    </>
  );
}
