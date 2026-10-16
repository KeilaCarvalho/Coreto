import Link from "next/link";
import { Icone } from "@/components/icone";

export function Kpi({ titulo, valor, nota, destaque, href, chip }: {
  titulo: string; valor: string; nota?: string; destaque?: boolean; href?: string; chip?: string;
}) {
  const corpo = (
    <>
      <div className="kpi-topo"><span>{titulo}</span>{href && <span className="seta"><Icone nome="diagonal" /></span>}</div>
      <p className="kpi-valor">{valor}</p>
      {(nota || chip) && <p className="kpi-nota">{chip && <b>{chip}</b>}{nota}</p>}
    </>
  );
  return href
    ? <Link className={`kpi${destaque ? " destaque" : ""}`} href={href}>{corpo}</Link>
    : <div className={`kpi${destaque ? " destaque" : ""}`}>{corpo}</div>;
}

/** Barras em pílula: o trilho listrado é o máximo da semana; a barra cheia, o valor do dia. */
export function BarrasSemana({ dias }: { dias: { rotulo: string; valor: number; hoje: boolean }[] }) {
  const maximo = Math.max(10, ...dias.map((d) => d.valor));
  const maior = Math.max(...dias.map((d) => d.valor));
  return (
    <>
      <div className="barras">
        {dias.map((d) => {
          const altura = Math.round((d.valor / maximo) * 100);
          const classe = d.hoje ? "clara" : d.valor === maior ? "" : "media";
          return (
            <div className="barra" key={d.rotulo} title={`${d.rotulo}: ${d.valor} peças`}>
              {(d.hoje || (d.valor === maior && d.valor > 0)) && <span className="balao" style={{ bottom: `${altura}%` }}>{d.valor} pç</span>}
              {d.valor > 0 && <i className={classe} style={{ height: `${altura}%` }} />}
            </div>
          );
        })}
      </div>
      <div className="dias">{dias.map((d) => <span key={d.rotulo}>{d.rotulo}</span>)}</div>
    </>
  );
}

/** Semicírculo dividido na proporção de cada parte. */
export function Medidor({ partes, destaque, legenda }: {
  partes: { nome: string; valor: number; cor: string }[]; destaque: string; legenda: string;
}) {
  const total = partes.reduce((t, p) => t + p.valor, 0) || 1;
  const cx = 130, cy = 130, r = 100, folga = 0.03;
  let inicio = Math.PI;
  const arcos = partes.filter((p) => p.valor > 0).map((p) => {
    const fim = inicio + (Math.PI * p.valor) / total;
    const a0 = inicio + folga, a1 = Math.max(a0, fim - folga);
    const d = `M${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0)).toFixed(1)} A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}`;
    inicio = fim;
    return <path key={p.nome} d={d} stroke={p.cor} strokeWidth={34} fill="none" strokeLinecap="round" />;
  });
  return (
    <>
      <div className="medidor">
        <svg viewBox="0 0 260 160" role="img" aria-label={`${destaque} ${legenda}`}>
          <defs>
            <pattern id="listra" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="#e7eeeb" /><rect width="2.5" height="7" fill="#9fb3ad" />
            </pattern>
          </defs>
          {total === 1 && partes.every((p) => !p.valor)
            ? <path d="M33 133 A100 100 0 0 1 227 133" stroke="#e7eeeb" strokeWidth={34} fill="none" strokeLinecap="round" />
            : arcos}
          <text x="130" y="122" textAnchor="middle" className="valor">{destaque}</text>
          <text x="130" y="144" textAnchor="middle" className="rotulo-svg">{legenda}</text>
        </svg>
      </div>
      <div className="legenda" style={{ justifyContent: "center", padding: "0 22px 22px" }}>
        {partes.map((p) => (
          <span key={p.nome}><i style={{ background: p.cor.startsWith("url") ? "repeating-linear-gradient(135deg,#9fb3ad 0 2px,#e7eeeb 2px 5px)" : p.cor }} />{p.nome} {p.valor}</span>
        ))}
      </div>
    </>
  );
}
