// Ferramentas do bot, compartilhadas pelos provedores de IA (Gemini e Anthropic).
import { z } from "zod";
import { analyzeTickers, forModel, scanB3 } from "@/lib/market";
import { readPage, searchWeb } from "@/lib/firecrawl";
import { untrusted } from "@/lib/guard";

export type ToolDef = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_quotes",
    description:
      "Cotação, histórico diário (até 3 meses), indicadores (variações, MM20, MM50, volume vs mediana de 20, volatilidade) e score -100..+100 já calculados em código para tickers da B3. Fonte brapi.dev; dados podem ter atraso. Use para análise, previsão ou comparação de ativos.",
    parameters: {
      type: "object",
      properties: { tickers: { type: "array", items: { type: "string" }, description: "Tickers da B3, ex.: PETR4, VALE3" } },
      required: ["tickers"],
    },
  },
  {
    name: "scan_b3",
    description:
      "Ranking por score de cerca de 20 ações líquidas da B3, com viés, regime e cobertura. Use quando perguntarem qual ação está melhor, onde investir ou para o Radar do dia.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_web",
    description:
      "Busca na web e em notícias (Firecrawl) por fatos relevantes, resultados, notícias, juros, câmbio. Prefira termos que levem a B3, CVM, RI das empresas, BCB e IBGE.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 8 } },
      required: ["query"],
    },
  },
  {
    name: "read_page",
    description: "Lê o conteúdo principal de uma página https (Firecrawl) já encontrada na busca, para confirmar números e datas.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
];

const GetQuotes = z.object({ tickers: z.array(z.string().min(3).max(10)).min(1).max(10) });
const Search = z.object({ query: z.string().min(2).max(300), limit: z.number().int().min(1).max(8).optional() });
const Read = z.object({ url: z.string().url().max(500) });

export async function runTool(name: string, input: unknown): Promise<{ content: string; isError?: boolean }> {
  try {
    if (name === "get_quotes") {
      const p = GetQuotes.parse(input);
      const data = await analyzeTickers(p.tickers);
      return { content: JSON.stringify(data.map(forModel)) };
    }
    if (name === "scan_b3") {
      const s = await scanB3();
      return { content: JSON.stringify({ ...s, ranking: s.ranking.slice(0, 8).map(forModel) }) };
    }
    if (name === "search_web") {
      const p = Search.parse(input);
      return { content: untrusted("search_web", await searchWeb(p.query, p.limit ?? 5)) };
    }
    if (name === "read_page") {
      const p = Read.parse(input);
      return { content: untrusted("read_page", await readPage(p.url)) };
    }
    return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  } catch (e) {
    return { content: `Erro na ferramenta ${name}: ${(e as Error).message.slice(0, 200)}`, isError: true };
  }
}
