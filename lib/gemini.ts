// Chat com Google Gemini (API REST generateContent), com chamada de ferramentas.
// Chave em GEMINI_API_KEY (servidor apenas). Modelo em GEMINI_MODEL (padrão gemini-3.8-flash, com plano grátis).
import { TOOL_DEFS, runTool } from "@/lib/tools";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = Record<string, unknown> & {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: unknown; id?: string };
};
type Content = { role: "user" | "model"; parts: Part[] };

export async function runGemini(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  write: (s: string) => void;
  signal: AbortSignal;
  maxRounds: number;
}) {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
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

  for (let round = 0; round <= opts.maxRounds; round++) {
    const res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents,
        tools,
        generationConfig: { maxOutputTokens: 8192 },
      }),
      signal: opts.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      opts.write("\n\nLimite gratuito da IA atingido agora. Tente de novo em instantes.");
      return;
    }
    if (res.status === 400 || res.status === 403) {
      const t = (await res.text()).slice(0, 300);
      opts.write(/API key|API_KEY|PERMISSION/i.test(t) ? "\n\nChave da IA (Gemini) inválida no servidor." : `\n\nErro da IA (${res.status}).`);
      return;
    }
    if (!res.ok) {
      opts.write(`\n\nErro da IA (${res.status}). Tente de novo.`);
      return;
    }
    const json = (await res.json()) as {
      candidates?: { content?: Content; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const cand = json.candidates?.[0];
    if (!cand?.content) {
      opts.write("\n\nNão consegui responder a este pedido.");
      return;
    }
    const parts = cand.content.parts ?? [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
    if (text) opts.write(text);
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) return;
    if (round === opts.maxRounds) {
      opts.write("\n\n(Limite de consultas atingido nesta resposta.)");
      return;
    }
    // Devolve o conteúdo do modelo como veio (inclui assinaturas de raciocínio exigidas pelo Gemini 3).
    contents.push({ role: "model", parts });
    if (text) opts.write("\n");
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
