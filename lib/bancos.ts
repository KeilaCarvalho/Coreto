/** Cores oficiais dos bancos e maquininhas (para os marcadores dos saldos). */
const CORES: { teste: RegExp; fundo: string; texto: string }[] = [
  { teste: /santander/i, fundo: "#EA1D25", texto: "#fff" },
  { teste: /inter\b/i, fundo: "#FF7A00", texto: "#fff" },
  { teste: /caixa|cef\b/i, fundo: "#0066B3", texto: "#F7941E" },
  { teste: /pagar\.?-?me/i, fundo: "#65A300", texto: "#fff" },
  { teste: /pagseguro|pagbank/i, fundo: "#1BB99A", texto: "#fff" },
  { teste: /getnet/i, fundo: "#E30613", texto: "#fff" },
  { teste: /nubank|\bnu\b/i, fundo: "#820AD1", texto: "#fff" },
  { teste: /ita[uú]/i, fundo: "#EC7000", texto: "#003399" },
  { teste: /bradesco/i, fundo: "#CC092F", texto: "#fff" },
  { teste: /banco do brasil|\bbb\b/i, fundo: "#FCFC30", texto: "#0038A8" },
  { teste: /sicoob/i, fundo: "#003641", texto: "#00AE9D" },
  { teste: /valori/i, fundo: "#1D2939", texto: "#fff" },
  { teste: /tesouraria|caixa da loja|dinheiro/i, fundo: "#1D7A4E", texto: "#fff" },
];

export function corBanco(nome: string) {
  return CORES.find((c) => c.teste.test(nome)) ?? { fundo: "var(--superficie-2)", texto: "var(--tinta)" };
}
