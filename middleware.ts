// Proteção Cybertruck, camada de borda (ver SEGURANCA.md):
// 1. interruptor de emergência (SITE_LOCKDOWN / AI_DISABLED) sem mudar código;
// 2. bloqueio de robôs que procuram falhas (/.env, /wp-admin...) com banimento temporário;
// 3. bloqueio de pedidos de outros sites, de métodos estranhos e de corpos grandes;
// 4. limites por visitante (minuto e dia) e limite global do chat;
// 5. banimento temporário de quem insiste depois de bloqueado;
// tudo registrado no log da Vercel como {"security": ...}.
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { trackCounter, trackPageView, trackSecurity } from "@/lib/store";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin/auth";

let ev: NextFetchEvent | null = null;
const bg = (p: Promise<unknown>) => (ev ? ev.waitUntil(p.catch(() => {})) : p.catch(() => {}));

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const MAX_BODY = 64 * 1024;
const BAN_MS = 15 * MIN;
const STRIKES_TO_BAN = 3;

const env = (k: string, d: number) => Number(process.env[k]) || d;

const perMinute = new Map<string, number[]>();
const perDay = new Map<string, { start: number; n: number }>();
const strikes = new Map<string, number[]>();
const banned = new Map<string, number>();
let globalChat: number[] = [];

const SCANNER =
  /^\/(\.env|\.git|\.aws|\.ssh|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|adminer|cgi-bin|vendor\/phpunit|server-status|actuator|config\.(json|php|yml)|backup|\.DS_Store)/i;

function log(reason: string, ip: string, path: string) {
  console.warn(JSON.stringify({ security: reason, ip, path, at: new Date().toISOString() }));
  bg(trackSecurity(reason, ip, path));
}

function deny(status: number, msg: string, reason: string, ip: string, path: string) {
  log(reason, ip, path);
  return new NextResponse(msg, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

function strike(ip: string, now: number) {
  const list = (strikes.get(ip) ?? []).filter((t) => now - t < 10 * MIN);
  list.push(now);
  strikes.set(ip, list);
  if (list.length >= STRIKES_TO_BAN) {
    banned.set(ip, now + BAN_MS);
    strikes.delete(ip);
    log("ip_banned_15min", ip, "-");
  }
}

function cleanup(now: number) {
  if (perMinute.size > 5000) for (const [k, v] of perMinute) if (!v.some((t) => now - t < MIN)) perMinute.delete(k);
  if (perDay.size > 20000) for (const [k, v] of perDay) if (now - v.start > DAY) perDay.delete(k);
  for (const [k, until] of banned) if (until < now) banned.delete(k);
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  ev = event;
  const path = req.nextUrl.pathname;
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const now = Date.now();
  const isApi = path.startsWith("/api/");
  const isChat = path.startsWith("/api/chat");

  if ((banned.get(ip) ?? 0) > now) return deny(403, "Acesso bloqueado temporariamente.", "banned", ip, path);

  if (SCANNER.test(path)) {
    strike(ip, now);
    return deny(404, "Não encontrado.", "scanner_probe", ip, path);
  }
  if (!isApi) {
    const prefetch = req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch";
    if (req.method === "GET" && !prefetch && (path === "/" || path === "/chat")) bg(trackPageView(ip, path));
    return NextResponse.next();
  }

  // Área administrativa: APIs do painel exigem sessão válida (exceto o login).
  const isAdminApi = path.startsWith("/api/admin/");
  const isLogin = path === "/api/admin/login";
  if (isAdminApi && !isLogin && !(await verifySession(req.cookies.get(ADMIN_COOKIE)?.value))) {
    return deny(401, "Não autorizado.", "admin_unauthorized", ip, path);
  }

  if (process.env.SITE_LOCKDOWN === "1") {
    return deny(503, "Serviço temporariamente desativado por segurança. Volte mais tarde.", "lockdown", ip, path);
  }
  if (process.env.AI_DISABLED === "1" && isChat) {
    return deny(503, "O chat está temporariamente desativado por segurança.", "ai_disabled", ip, path);
  }

  if (!["GET", "POST", "HEAD", ...(isAdminApi ? ["DELETE"] : [])].includes(req.method)) return deny(405, "Método não permitido.", "bad_method", ip, path);
  if (isChat && req.method !== "POST") return deny(405, "Método não permitido.", "bad_method", ip, path);

  if (req.method === "POST" || req.method === "DELETE") {
    const origin = req.headers.get("origin");
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && new URL(origin).host === req.nextUrl.host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      strike(ip, now);
      return deny(403, "Origem não permitida.", "bad_origin", ip, path);
    }
    if (req.method === "POST" && !(req.headers.get("content-type") ?? "").includes("application/json")) {
      return deny(415, "Formato não aceito.", "bad_content_type", ip, path);
    }
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_BODY) {
      strike(ip, now);
      return deny(413, "Pedido grande demais.", "body_too_large", ip, path);
    }
  }

  // Limite global do chat (protege a cota grátis da IA contra ataque distribuído).
  if (isChat) {
    globalChat = globalChat.filter((t) => now - t < MIN);
    if (globalChat.length >= env("GLOBAL_CHAT_PER_MIN", 60)) {
      return deny(429, "Muita gente perguntando agora. Tente de novo em 1 minuto.", "global_limit", ip, path);
    }
  }

  // Limite por visitante, por minuto.
  const bucket = isLogin ? "login" : isChat ? "chat" : "api";
  const key = `${ip}:${bucket}`;
  const list = (perMinute.get(key) ?? []).filter((t) => now - t < MIN);
  const minuteLimit = isLogin ? 5 : isChat ? env("RATE_LIMIT_CHAT_PER_MIN", 8) : env("RATE_LIMIT_API_PER_MIN", 30);
  if (list.length >= minuteLimit) {
    perMinute.set(key, list);
    strike(ip, now);
    return deny(429, "Muitas perguntas em pouco tempo. Aguarde 1 minuto.", "rate_limit", ip, path);
  }

  // Limite por visitante, por dia (só chat).
  if (isChat) {
    const d = perDay.get(ip);
    const day = d && now - d.start < DAY ? d : { start: now, n: 0 };
    if (day.n >= env("RATE_LIMIT_CHAT_PER_DAY", 150)) {
      perDay.set(ip, day);
      return deny(429, "Limite diário de perguntas atingido. Volte amanhã.", "daily_limit", ip, path);
    }
    day.n++;
    perDay.set(ip, day);
    globalChat.push(now);
    bg(trackCounter("chats"));
  }
  if (path.startsWith("/api/radar")) bg(trackCounter("radar"));

  list.push(now);
  perMinute.set(key, list);
  cleanup(now);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.png|banner.png).*)"],
};
