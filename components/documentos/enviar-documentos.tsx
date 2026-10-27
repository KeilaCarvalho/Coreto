"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icone } from "@/components/icone";
import { useFecharJanela } from "@/components/janela-lateral";
import { supabaseNavegador } from "@/lib/supabase/navegador";
import { ORIGENS_DOCUMENTO, TIPOS_ARQUIVO_ACEITOS, TIPOS_DOCUMENTO, extensao, tipoDoArquivo } from "@/lib/documentos";
import type { EstadoAcao } from "@/components/form-acao";

type Registrar = (arquivos: { caminho: string; nome: string }[], tipo: string, origem: string) => Promise<EstadoAcao>;

const LIMITE = 15 * 1024 * 1024;
const tamanho = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * "Jogar documentos": escolhe uma ou várias fotos/PDFs, manda cada arquivo direto
 * para o Storage (sem passar pelo limite de tamanho do servidor) e depois registra
 * todos na caixa de entrada.
 */
export function EnviarDocumentos({ registrar }: { registrar: Registrar }) {
  const fechar = useFecharJanela();
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [tipo, setTipo] = useState("nota_fiscal");
  const [origem, setOrigem] = useState("whatsapp");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const escolher = (lista: FileList | null) => {
    if (!lista) return;
    setErro(null);
    setArquivos((atuais) => [...atuais, ...Array.from(lista)].slice(0, 30));
    if (entrada.current) entrada.current.value = "";
  };

  async function enviar() {
    setErro(null);
    if (!arquivos.length) { setErro("Escolha pelo menos uma foto ou PDF."); return; }
    for (const a of arquivos) {
      const t = tipoDoArquivo(a.name, a.type);
      if (!TIPOS_ARQUIVO_ACEITOS.test(t)) { setErro(`“${a.name}” não é foto, PDF nem XML.`); return; }
      if (a.size > LIMITE) { setErro(`“${a.name}” passa de 15 MB. Tire a foto com menos zoom.`); return; }
    }
    const supabase = supabaseNavegador();
    const mes = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
    const enviados: { caminho: string; nome: string }[] = [];
    try {
      for (const [i, a] of arquivos.entries()) {
        setEnviando(`Enviando ${i + 1} de ${arquivos.length}…`);
        const t = tipoDoArquivo(a.name, a.type);
        const caminho = `${mes}/${crypto.randomUUID()}.${extensao(t)}`;
        const { error } = await supabase.storage.from("documentos").upload(caminho, a, { contentType: t });
        if (error) throw new Error(`Não consegui enviar “${a.name}”: ${error.message}`);
        enviados.push({ caminho, nome: a.name.slice(0, 200) });
      }
      setEnviando("Registrando…");
      const r = await registrar(enviados, tipo, origem);
      if (r?.erro) throw new Error(r.erro);
      if (fechar) fechar(r?.ok); else router.refresh();
    } catch (e) {
      if (enviados.length) await supabase.storage.from("documentos").remove(enviados.map((x) => x.caminho));
      setErro(e instanceof Error ? e.message : "Não consegui enviar os arquivos.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div>
      {erro && <p className="aviso erro" role="alert"><Icone nome="alerta" />{erro}</p>}

      <label className="cx-soltar">
        <input ref={entrada} type="file" multiple accept="application/pdf,image/*,.heic,.xml" onChange={(e) => escolher(e.target.files)} disabled={!!enviando} />
        <Icone nome="enviar" />
        <b>Escolher fotos ou PDFs</b>
        <small>No celular dá para tirar a foto na hora ou pegar da galeria. Pode mandar vários de uma vez.</small>
      </label>

      {arquivos.length > 0 && (
        <ul className="cx-arquivos">
          {arquivos.map((a, i) => (
            <li key={`${a.name}-${i}`}>
              <Icone nome="arquivo" />
              <span><b>{a.name}</b><small>{tamanho(a.size)}</small></span>
              <button type="button" className="icone-botao" aria-label={`Tirar ${a.name}`} disabled={!!enviando}
                onClick={() => setArquivos((l) => l.filter((_, k) => k !== i))}><Icone nome="fechar" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="campos duas" style={{ marginTop: 18 }}>
        <div className="campo">
          <label htmlFor="cx-tipo">O que é</label>
          <select id="cx-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPOS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="cx-origem">Chegou por</label>
          <select id="cx-origem" value={origem} onChange={(e) => setOrigem(e.target.value)}>
            {Object.entries(ORIGENS_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        <p className="ajuda campo inteiro" style={{ gridColumn: "1 / -1" }}>
          Não precisa preencher mais nada agora. Fornecedor, valor e vencimento você completa depois, na conferência.
        </p>
      </div>

      <div className="formulario-rodape">
        {fechar && <button type="button" className="botao leve" onClick={() => fechar()} disabled={!!enviando}>Cancelar</button>}
        <button type="button" className="botao" onClick={enviar} disabled={!!enviando || !arquivos.length}>
          {enviando ?? (arquivos.length > 1 ? `Jogar ${arquivos.length} documentos` : "Jogar na caixa de entrada")}
        </button>
      </div>
    </div>
  );
}
