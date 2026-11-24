import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT, contextBlock } from "@/lib/prompt";
import { TOOL_DEFS, runTool } from "@/lib/tools";
import { runGemini } from "@/lib/gemini";
import { looksLikeInjection, scrubSecrets, securityLog } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 4;
const DEADLINE_MS = 55_000; // termina antes do limite de 60 s da função na Vercel

const Body = z.object({
  name: z.string().max(80).optional().default(""),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

// Provedor: AI_PROVIDER ("gemini" ou "anthropic") se definido; senão Gemini quando houver GEMINI_API_KEY,
// e Anthropic como alternativa quando só houver ANTHROPIC_API_KEY.
function provider(): "gemini" | "anthropic" | null {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

const anthropicTools: Anthropic.Beta.BetaTool[] = TOOL_DEFS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

async function runAnthropic(opts: {
  name: string;
  messages: { role: "user" | "assistant"; content: string }[];
  write: (s: string) => void;
  signal: AbortSignal;
}) {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextBlock(opts.name, new Date()) },
  ];
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          model: ANTHROPIC_MODEL,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          max_tokens: 16000,
          output_config: { effort: "medium" },
          system,
          tools: anthropicTools,
          messages,
        },
        { signal: opts.signal },
      );
      stream.on("text", (delta) => opts.write(delta));
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        opts.write("\n\nNão consegui responder a este pedido.");
        return;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) return;
      if (round === MAX_TOOL_ROUNDS) {
        opts.write("\n\n(Limite de consultas atingido nesta resposta.)");
        return;
      }
      messages.push({ role: "assistant", content: message.content });
      opts.write("\n");
      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await runTool(t.name, t.input);
          return { type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError };
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) opts.write("\n\nMuitos pedidos agora. Tente de novo em instantes.");
    else if (e instanceof Anthropic.AuthenticationError) opts.write("\n\nChave da IA inválida no servidor.");
    else if (e instanceof Anthropic.APIError) opts.write(`\n\nErro da IA (${e.status}). Tente de novo.`);
    else throw e;
  }
}

export async function POST(req: Request) {
  const p = provider();
  if (!p) {
    return new Response("O servidor ainda não tem a chave da IA configurada (GEMINI_API_KEY).", { status: 500 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Pedido inválido.", { status: 400 });

  const messages = parsed.data.messages.slice(-20);
  if (messages[0]?.role !== "user") messages.shift();

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return new Response("Pedido inválido.", { status: 400 });
  if (looksLikeInjection(last.content)) {
    securityLog("prompt_injection", {
      ip: req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido",
      sample: last.content.slice(0, 120),
    });
    return new Response(
      "Não posso compartilhar instruções internas, chaves ou configuração. Posso analisar uma ação, o Ibovespa ou o Radar do dia.\n\n⚠️ Análise informativa, pode conter erros. Não é garantia de resultado.",
      { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  const encoder = new TextEncoder();
  const started = Date.now();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(scrubSecrets(s)));
      try {
        if (p === "gemini") {
          await runGemini({
            system: `${SYSTEM_PROMPT}\n\n${contextBlock(parsed.data.name, new Date())}`,
            messages,
            write,
            signal: req.signal,
            maxRounds: MAX_TOOL_ROUNDS,
            deadline: started + DEADLINE_MS,
          });
        } else {
          await runAnthropic({ name: parsed.data.name, messages, write, signal: req.signal });
        }
      } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          console.error("chat:", (e as Error)?.message);
          write("\n\nFalha ao gerar a resposta. Tente de novo.");
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
