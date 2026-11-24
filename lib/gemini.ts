// Chat com Google Gemini (API REST generateContent), com chamada de ferramentas.
// Chave em GEMINI_API_KEY (servidor apenas). Modelo em GEMINI_MODEL; se o modelo não existir
// para a chave, tenta os próximos da lista (todos com plano grátis).
import { TOOL_DEFS, runTool } from "@/lib/tools";

const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

type Part = Record<string, unknown> & {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: unknown; id?: string };
};
type Content = { role: "user" | "model"; parts: Part[] };
type GenResponse = {
  candidates?: { content?: Content; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

export function geminiModels(): string[] {
  const first = process.env.GEMINI_MODEL?.trim();
  return [...new Set([...(first ? [first] : []), ...FALLBACK_MODELS])];
}

let workingModel: string | null = null; // memoriza o modelo que funcionou nesta instância

export class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function cleanMsg(m: string | undefined): string {
  return (m ?? "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[chave]").replace(/\s+/g, " ").slice(0, 180);
}

// Uma chamada generateContent, com troca automática de modelo se o atual não existir.
async function geminiCallOnce(body: unknown, signal: AbortSignal): Promise<GenResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(500, "GEMINI_API_KEY não configurada");
  const models = workingModel ? [workingModel, ...geminiModels().filter((m) => m !== workingModel)] : geminiModels();
  let last: GeminiError | null = null;
  for (const model of models) {
    const res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as GenResponse;
    if (res.ok) {
      workingModel = model;
      return json;
    }
    const msg = cleanMsg(json.error?.message);
    console.error(`gemini ${model} ${res.status}: ${msg}`);
    last = new GeminiError(res.status, msg || res.statusText);
    // Modelo inexistente, sobrecarregado (503/500) ou sem cota (429): tenta o próximo modelo grátis.
    if (
      res.status === 404 ||
      res.status === 429 ||
      res.status >= 500 ||
      (res.status === 400 && /model/i.test(msg) && /not found|not supported|unknown/i.test(msg))
    ) {
      if (workingModel === model) workingModel = null;
      continue;
    }
    throw last;
  }
  throw last ?? new GeminiError(500, "nenhum modelo disponível");
}

// Se todos os modelos estiverem sobrecarregados, espera um pouco e tenta mais uma vez.
export async function geminiCall(body: unknown, signal: AbortSignal): Promise<GenResponse> {
  try {
    return await geminiCallOnce(body, signal);
  } catch (e) {
    if (e instanceof GeminiError && (e.status >= 500 || e.status === 429) && !signal.aborted) {
      await new Promise((r) => setTimeout(r, 2500));
      return geminiCallOnce(body, signal);
    }
    throw e;
  }
}

export function friendlyGeminiError(e: GeminiError): string {
  if (e.status === 429) return "O limite gratuito da IA foi atingido agora. Tente de novo em 1 minuto.";
  if (e.status === 401 || e.status === 403 || /API key|API_KEY/i.test(e.message))
    return "A chave da IA (GEMINI_API_KEY) foi recusada pelo Google. Confira a chave na Vercel.";
  if (e.status === 404) return "Nenhum modelo Gemini disponível para esta chave.";
  if (e.status >= 500) return "A IA do Google está sobrecarregada neste momento. Tente de novo em 1 minuto.";
  return `A IA recusou o pedido (${e.status}). Tente reformular a pergunta.`;
}

export async function runGemini(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  write: (s: string) => void;
  signal: AbortSignal;
  maxRounds: number;
  deadline: number; // horário limite (ms) para terminar antes do tempo máximo da função
}) {
  const contents: Content[] = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const tools = [
    {
      functionDeclarations: TOOL_DEFS.map((t) =>
        Object.keys(t.parameters.properties).length
          ? { name: t.name, description: t.description, parameters: t.parameters }
          : { name: t.name, description: t.description },
      ),
    },
  ];

  let wrote = false;
  const out = (s: string) => {
    if (s) wrote = true;
    opts.write(s);
  };

  for (let round = 0; round <= opts.maxRounds; round++) {
    const left = opts.deadline - Date.now();
    if (left < 5000) {
      out(wrote ? "\n\n(Tempo esgotado ao consultar mais dados.)" : "Demorei demais para consultar os dados. Tente de novo ou faça uma pergunta mais específica.");
      return;
    }
    // Na última rodada, pede a resposta final sem novas consultas.
    const lastRound = round === opts.maxRounds || left < 20000;
    let json: GenResponse;
    try {
      json = await geminiCall(
        {
          systemInstruction: { parts: [{ text: opts.system }] },
          contents,
          tools,
          ...(lastRound ? { toolConfig: { functionCallingConfig: { mode: "NONE" } } } : {}),
        },
        AbortSignal.any([opts.signal, AbortSignal.timeout(Math.max(5000, left - 3000))]),
      );
    } catch (e) {
      if (e instanceof GeminiError) {
        out((wrote ? "\n\n" : "") + friendlyGeminiError(e));
        return;
      }
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") && !opts.signal.aborted) {
        out((wrote ? "\n\n" : "") + "A IA demorou demais para responder. Tente de novo.");
        return;
      }
      throw e;
    }

    const cand = json.candidates?.[0];
    if (!cand?.content?.parts?.length) {
      const why = json.promptFeedback?.blockReason || cand?.finishReason || "sem conteúdo";
      console.error("gemini resposta vazia:", why);
      out((wrote ? "\n\n" : "") + (/SAFETY|BLOCK|PROHIBITED/i.test(why) ? "Não consigo responder a este pedido." : "A IA não gerou resposta desta vez. Tente de novo."));
      return;
    }
    const parts = cand.content.parts;
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
    if (text) out(text);
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0 || lastRound) {
      if (!text && !wrote) out("A IA não gerou resposta desta vez. Tente de novo.");
      return;
    }
    // Devolve o conteúdo do modelo como veio (inclui assinaturas de raciocínio exigidas pelo Gemini 3).
    contents.push({ role: "model", parts });
    if (text) out("\n");
    const results = await Promise.all(
      calls.map(async (p) => {
        const fc = p.functionCall!;
        const r = await runTool(fc.name, fc.args ?? {});
        return {
          functionResponse: {
            name: fc.name,
            ...(fc.id ? { id: fc.id } : {}),
            response: r.isError ? { error: r.content } : { result: r.content },
          },
        };
      }),
    );
    contents.push({ role: "user", parts: results });
  }
}
