// Armazenamento de métricas e cadastros (Redis).
// Aceita as duas formas que a Vercel cria ao conectar um banco:
//  - REST (Upstash): KV_REST_API_URL/KV_REST_API_TOKEN ou UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN
//    (ou qualquer PREFIXO_REST_API_URL/PREFIXO_REST_API_TOKEN);
//  - conexão direta (Redis): REDIS_URL, STORAGE_URL, KV_URL ou qualquer PREFIXO_URL com redis:// ou rediss://.
// Sem nenhuma delas, nada é gravado e o painel avisa que não há armazenamento (sem números inventados).
import type { RedisClientType } from "redis";

function findRest(): { url: string; token: string } | null {
  const e = process.env;
  const pairs: [string | undefined, string | undefined][] = [
    [e.KV_REST_API_URL, e.KV_REST_API_TOKEN],
    [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN],
  ];
  for (const k of Object.keys(e)) {
    if (k.endsWith("_REST_API_URL")) pairs.push([e[k], e[k.replace(/_URL$/, "_TOKEN")]]);
  }
  for (const [url, token] of pairs) if (url && token && /^https:\/\//.test(url)) return { url, token };
  return null;
}

function findTcpUrl(): string | null {
  const e = process.env;
  for (const k of ["REDIS_URL", "STORAGE_URL", "KV_URL"]) if (e[k] && /^rediss?:\/\//.test(e[k]!)) return e[k]!;
  for (const k of Object.keys(e)) if (k.endsWith("_URL") && /^rediss?:\/\//.test(e[k] ?? "")) return e[k]!;
  return null;
}

export const hasStore = () => !!(findRest() || findTcpUrl());

let tcpClient: Promise<RedisClientType | null> | null = null;
function getTcp(): Promise<RedisClientType | null> {
  const url = findTcpUrl();
  if (!url) return Promise.resolve(null);
  if (!tcpClient) {
    tcpClient = (async () => {
      try {
        const { createClient } = await import("redis");
        const c = createClient({ url, socket: { connectTimeout: 1500, reconnectStrategy: (n) => (n > 3 ? false : 300) } }) as RedisClientType;
        c.on("error", (err) => console.error("redis:", (err as Error).message));
        await c.connect();
        return c;
      } catch (err) {
        console.error("redis conexão:", (err as Error).message);
        tcpClient = null;
        return null;
      }
    })();
  }
  return tcpClient;
}

// Nunca deixa o banco travar o site: se não responder em 1,5 s, segue sem ele.
export async function redis(commands: (string | number)[][]): Promise<unknown[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), 1500)));
  try {
    return await Promise.race([redisRaw(commands), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function redisRaw(commands: (string | number)[][]): Promise<unknown[] | null> {
  const rest = findRest();
  if (rest) {
    try {
      const res = await fetch(`${rest.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${rest.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(commands.map((c) => c.map(String))),
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { result?: unknown; error?: string }[];
      return json.map((r) => (r.error ? null : r.result));
    } catch {
      return null;
    }
  }
  const c = await getTcp();
  if (!c) return null;
  try {
    return await Promise.all(commands.map((cmd) => c.sendCommand(cmd.map(String)).catch(() => null)));
  } catch {
    return null;
  }
}

export function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); // AAAA-MM-DD
}

const RETENTION_S = 90 * 24 * 3600; // métricas diárias guardadas por 90 dias

// IP mascarado para exibição (LGPD: minimização) e hash diário com sal para contar visitantes únicos.
export function maskIp(ip: string): string {
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".x.x";
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":…";
  return "desconhecido";
}

async function visitorHash(ip: string, day: string): Promise<string> {
  const salt = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "invest-moment";
  const data = new TextEncoder().encode(`${salt}|${day}|${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function trackPageView(ip: string, path: string) {
  const day = dayKey();
  const h = await visitorHash(ip, day);
  await redis([
    ["HINCRBY", `im:d:${day}`, "views", 1],
    ["HINCRBY", `im:d:${day}`, `page:${path}`, 1],
    ["PFADD", `im:u:${day}`, h],
    ["EXPIRE", `im:d:${day}`, RETENTION_S],
    ["EXPIRE", `im:u:${day}`, RETENTION_S],
  ]);
}

export async function trackCounter(field: string) {
  const day = dayKey();
  await redis([
    ["HINCRBY", `im:d:${day}`, field, 1],
    ["EXPIRE", `im:d:${day}`, RETENTION_S],
  ]);
}

export async function trackSecurity(reason: string, ip: string, path: string) {
  const day = dayKey();
  const ev = JSON.stringify({ reason, ip: maskIp(ip), path: path.slice(0, 80), at: new Date().toISOString() });
  await redis([
    ["HINCRBY", `im:d:${day}`, `sec:${reason}`, 1],
    ["HINCRBY", `im:d:${day}`, "blocked", 1],
    ["EXPIRE", `im:d:${day}`, RETENTION_S],
    ["LPUSH", "im:sec:events", ev],
    ["LTRIM", "im:sec:events", 0, 199],
  ]);
}

// Cadastro opcional com consentimento (LGPD). Guarda só nome, e-mail, data e versão do aviso.
export type Subscriber = { name: string; email: string; consentAt: string; policy: string };

export async function addSubscriber(s: Subscriber) {
  await redis([
    ["HSET", "im:subs", s.email, JSON.stringify(s)],
    ["HINCRBY", `im:d:${dayKey()}`, "signups", 1],
  ]);
}

export async function removeSubscriber(email: string) {
  await redis([["HDEL", "im:subs", email]]);
}

export async function listSubscribers(): Promise<Subscriber[] | null> {
  const r = await redis([["HVALS", "im:subs"]]);
  if (!r) return null;
  const vals = (r[0] as string[] | null) ?? [];
  return vals
    .map((v) => {
      try {
        return JSON.parse(v) as Subscriber;
      } catch {
        return null;
      }
    })
    .filter((x): x is Subscriber => !!x)
    .sort((a, b) => b.consentAt.localeCompare(a.consentAt));
}

export type DayStats = { day: string; views: number; visitors: number; chats: number; radar: number; blocked: number; signups: number; fields: Record<string, number> };

export async function lastDays(n: number): Promise<DayStats[] | null> {
  if (!hasStore()) return null;
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86400000)));
  const cmds: (string | number)[][] = [];
  for (const d of days) {
    cmds.push(["HGETALL", `im:d:${d}`]);
    cmds.push(["PFCOUNT", `im:u:${d}`]);
  }
  const r = await redis(cmds);
  if (!r) return null;
  return days.map((day, i) => {
    const raw = (r[i * 2] as string[] | null) ?? [];
    const fields: Record<string, number> = {};
    for (let j = 0; j < raw.length; j += 2) fields[raw[j]] = Number(raw[j + 1]) || 0;
    return {
      day,
      views: fields.views ?? 0,
      visitors: Number(r[i * 2 + 1]) || 0,
      chats: fields.chats ?? 0,
      radar: fields.radar ?? 0,
      blocked: fields.blocked ?? 0,
      signups: fields.signups ?? 0,
      fields,
    };
  });
}

export type SecEvent = { reason: string; ip: string; path: string; at: string };

export async function recentSecurity(n = 50): Promise<SecEvent[] | null> {
  const r = await redis([["LRANGE", "im:sec:events", 0, n - 1]]);
  if (!r) return null;
  return ((r[0] as string[] | null) ?? []).flatMap((v) => {
    try {
      return [JSON.parse(v) as SecEvent];
    } catch {
      return [];
    }
  });
}
