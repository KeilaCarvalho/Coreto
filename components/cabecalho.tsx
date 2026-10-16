import Link from "next/link";

export function Cabecalho({ titulo, descricao, trilha, acoes }: {
  titulo: string; descricao?: string; trilha?: { rotulo: string; href: string }[]; acoes?: React.ReactNode;
}) {
  return (
    <header className="cabecalho">
      <div>
        {trilha && trilha.length > 0 && (
          <nav className="trilha" aria-label="Você está em">
            {trilha.map((item, i) => (
              <span key={item.href}>{i > 0 && " / "}<Link href={item.href}>{item.rotulo}</Link></span>
            ))}
            <span>/</span><span>{titulo}</span>
          </nav>
        )}
        <h1>{titulo}</h1>
        {descricao && <p className="descricao">{descricao}</p>}
      </div>
      {acoes && <div className="acoes">{acoes}</div>}
    </header>
  );
}

export function Vazio({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="vazio">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/coreto-flor-turquesa.png" alt="" />
      <h3>{titulo}</h3>
      <p>{texto}</p>
      {children}
    </div>
  );
}
