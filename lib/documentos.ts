/** Caixa de entrada do financeiro: rótulos e endereços usados nas telas. */

export const TIPOS_DOCUMENTO = {
  nota_fiscal: "Nota fiscal",
  cupom: "Cupom",
  boleto: "Boleto",
  fatura: "Fatura",
  recibo: "Recibo",
  outro: "Outro",
} as const;
export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO;

export const ORIGENS_DOCUMENTO = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  papel: "Papel (foto/scan)",
  outro: "Outro",
} as const;
export type OrigemDocumento = keyof typeof ORIGENS_DOCUMENTO;

export const SITUACOES_DOCUMENTO = {
  entrada: "Para conferir",
  conferido: "Conferido",
  descartado: "Descartado",
} as const;
export type SituacaoDocumento = keyof typeof SITUACOES_DOCUMENTO;

/** Pastas do financeiro no Google Drive (EMPRESA CORETO - KEILA / 02. FINANCEIRO). */
export const PASTAS_DRIVE = {
  financeiro: "https://drive.google.com/drive/folders/1Fg2Gvy2GZWXA2pNZBk5uLXhrSW1xfAWB",
  entrada: "https://drive.google.com/drive/folders/1pHSNd1ci3GFtylADXMxWGqDqeJQH--5X",
  nfEntrada: "https://drive.google.com/drive/folders/1a-G1P6uqGWNvrwGwCCoQAX5s5Cp0yVN-",
  pendencias: "https://drive.google.com/drive/folders/1Ker_KT9zReXl_-jAUZGfCmL__m2DIfpk",
};

export const TIPOS_ARQUIVO_ACEITOS = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif)|text\/xml|application\/xml)$/;

/** Tipo do arquivo pelo nome, quando o celular não informa (fotos HEIC do iPhone, XML). */
export function tipoDoArquivo(nome: string, informado: string) {
  if (informado) return informado;
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", xml: "text/xml" } as Record<string, string>)[ext] ?? "";
}

export function extensao(tipo: string) {
  if (tipo === "application/pdf") return "pdf";
  if (tipo.endsWith("xml")) return "xml";
  return tipo.split("/")[1].replace("jpeg", "jpg");
}

export type DocumentoFinanceiro = {
  id: string;
  arquivo: string | null;
  nome_arquivo: string | null;
  tipo: TipoDocumento;
  origem: OrigemDocumento;
  situacao: SituacaoDocumento;
  fornecedor: string | null;
  numero: string | null;
  valor: number | null;
  emitido_em: string | null;
  vence_em: string | null;
  categoria: string | null;
  observacao: string | null;
  lancado_conta_azul: boolean;
  lancado_em: string | null;
  anexado_conta_azul: boolean;
  anexado_em: string | null;
  salvo_drive: boolean;
  link_drive: string | null;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

/** Nome que aparece nas listas: fornecedor ou, sem ele, o nome do arquivo. */
export function tituloDocumento(d: Pick<DocumentoFinanceiro, "fornecedor" | "nome_arquivo" | "tipo">) {
  return d.fornecedor || d.nome_arquivo || TIPOS_DOCUMENTO[d.tipo];
}
