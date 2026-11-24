// IA reserva gratuita, com API compatível com OpenAI e chamada de ferramentas.
// Mistral (MISTRAL_API_KEY, plano grátis), OpenRouter (OPENROUTER_API_KEY) e/ou Groq (GROQ_API_KEY), só no servidor.
// Usada quando o Gemini falha ou fica sobrecarregado, ou como principal se for a única chave.
import { TOOL_DEFS, runTool } from "@/lib/tools";

type Backend = { name: string; url: string; key: string; models: string[] };

const MISTRAL_MODELS = ["mistral-small-latest", "mistral-medium-latest", "ministral-14b-latest"];
const OPENROUTER_FREE = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-26b-a4b-it:free",
];
const GROQ_MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"];

const list = (env: string | undefined, defaults: string[]) => [
  ...new Set([...(env ?? "").split(",").map((m) => m.trim()).filter(Boolean), ...defaults]),
];

function backends(): Backend[] {
  const e = process.env;
  const out: Backend[] = [];
  if (e.MISTRAL_API_KEY)
    out.push({
      name: "mistral",
      url: e.MISTRAL_API_BASE || "https://api.mistral.ai/v1/chat/completions",
      key: e.MISTRAL_API_KEY,
      models: list(e.MISTRAL_MODEL, MISTRAL_MODELS),
    });
  if (e.OPENROUTER_API_KEY)
    out.push({
      name: "openrouter",
      url: e.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1/chat/completions",
      key: e.OPENROUTER_API_KEY,
      models: list(e.OPENROUTER_MODEL, OPENROUTER_FREE),
    });
  if (e.GROQ_API_KEY)
    out.push({
      name: "groq",
      url: e.GROQ_API_BASE || "https://api.groq.com/openai/v1/chat/completions",
      key: e.GROQ_API_KEY,
      models: list(e.GROQ_MODEL, GROQ_MODELS),
    });
  return out;
}

export const hasBackup = () => backends().length > 0;
export const backupName = () => backends().map((b) => ({ mistral: "Mistral", openrouter: "OpenRouter", groq: "Groq" })[b.name] ?? b.name).join(" + ");

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };
type ChatResp = {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
  error?: { message?: string; code?: string | number };
};

const tools = TOOL_DEFS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

const coolDown = new Map<string, number>();
const clean = (m: string) => m.replace(/(sk-or-[\w-]+|gsk_\w+|[A-Za-z0-9]{32})/g, "[chave]").replace(/\s+/g, " ").slice(0, 180);

async function backupCall(body: Record<string, unknown>, signal: AbortSignal, perCallMs: number): Promise<ChatResp> {
  const now = Date.now();
  const all = backends().flatMap((b) => b.models.map((model) => ({ b, model, id: `${b.name}:${model}` })));
  if (!all.length) throw new Error("sem chave de IA reserva");
  const ordered = [...all.filter((x) => (coolDown.get(x.id) ?? 0) < now), ...all.filter((x) => (coolDown.get(x.id) ?? 0) >= now)];
  const deadBackends = new Set<string>();
  let lastErr = "nenhum modelo disponível";
  for (const { b, model, id } of ordered) {
    if (signal.aborted) break;
    if (deadBackends.has(b.name)) continue;
    let res: Response;
    try {
      res = await fetch(b.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${b.key}` },
        body: JSON.stringify({ model, ...body }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(perCallMs)]),
        cache: "no-store",
      });
    } catch (e) {
      if (signal.aborted) throw e;
      console.error(`${id}: sem resposta em ${perCallMs} ms`);
      coolDown.set(id, Date.now() + 120_000);
      lastErr = "tempo esgotado";
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as ChatResp;
    if (res.ok && json.choices?.length) return json;
    const status = res.ok ? Number(json.error?.code) || 502 : res.status;
    console.error(`${id} ${status}: ${clean(json.error?.message ?? res.statusText)}`);
    lastErr = `${status}`;
    if (status === 401 || status === 403) {
      deadBackends.add(b.name); // chave recusada: pula os outros modelos deste provedor
      lastErr = `chave recusada (${b.name})`;
      continue;
    }
    // sobrecarga, cota, modelo removido ou chamada de ferramenta malformada: tenta o próximo modelo
    coolDown.set(id, Date.now() + (status === 400 ? 0 : 120_000));
  }
  throw new Error(lastErr);
}

export async function runBackup(opts: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  write: (s: string) => void;
  signal: AbortSignal;
  maxRounds: number;
  deadline: number;
}): Promise<boolean> {
  const messages: Msg[] = [{ role: "system", content: opts.system }, ...opts.messages.map((m) => ({ role: m.role, content: m.content }) as Msg)];
  let wrote = false;
  const out = (s: string) => {
    if (s) wrote = true;
    opts.write(s);
  };
  for (let round = 0; round <= opts.maxRounds; round++) {
    const left = opts.deadline - Date.now();
    if (left < 4000) {
      if (wrote) out("\n\n(Tempo esgotado ao consultar mais dados.)");
      return wrote;
    }
    const lastRound = round === opts.maxRounds || left < 12000;
    let json: ChatResp;
    try {
      json = await backupCall(
        { messages, tools, tool_choice: lastRound ? "none" : "auto", temperature: 0.3, max_tokens: 2048 },
        AbortSignal.any([opts.signal, AbortSignal.timeout(Math.max(4000, left - 1500))]),
        Math.min(20000, Math.max(4000, left - 2000)),
      );
    } catch (e) {
      if (opts.signal.aborted) throw e;
      console.error("ia reserva:", (e as Error).message);
      if (wrote) out("\n\n(A IA reserva falhou ao concluir. Tente de novo.)");
      return wrote;
    }
    const msg = json.choices?.[0]?.message;
    const text = (msg?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (text) out(text);
    const calls = msg?.tool_calls ?? [];
    if (calls.length === 0 || lastRound) return wrote;
    messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: calls });
    if (text) out("\n");
    const results = await Promise.all(
      calls.map(async (c) => {
        let args: unknown = {};
        try {
          args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          return { role: "tool" as const, tool_call_id: c.id, name: c.function.name, content: "Erro: argumentos inválidos." };
        }
        const r = await runTool(c.function.name, args);
        return { role: "tool" as const, tool_call_id: c.id, name: c.function.name, content: r.isError ? `Erro: ${r.content}` : r.content };
      }),
    );
    messages.push(...results);
  }
  return wrote;
}

// Teste rápido usado por /api/health.
export async function backupPing(): Promise<string> {
  const t0 = Date.now();
  try {
    await backupCall({ messages: [{ role: "user", content: "Responda só: ok" }], max_tokens: 20 }, AbortSignal.timeout(20000), 10000);
    return `ok em ${Date.now() - t0} ms`;
  } catch (e) {
    return `erro: ${(e as Error).message}`;
  }
}
