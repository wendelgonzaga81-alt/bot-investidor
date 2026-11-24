# Invest Moment

Analista de pesquisa da B3 em forma de chat (Next.js). Responde curto, com fonte e horário, e termina toda análise com o aviso de que pode conter erros.

- **Chat** (`/chat`): Google Gemini (`gemini-3.8-flash`, plano grátis) com ferramentas; Claude (`claude-opus-5-5`) como alternativa se houver `ANTHROPIC_API_KEY`:
  - `get_quotes` e `scan_b3`: cotações e histórico da [brapi.dev](https://brapi.dev); indicadores e score de -100 a +100 calculados em código (`lib/market.ts`).
  - `search_web` e `read_page`: notícias e documentos (B3, CVM, RI, BCB) via [Firecrawl](https://firecrawl.dev) (`lib/firecrawl.ts`).
- **Radar do dia**: até 3 ativos com maior score e gráficos de preço e volume feitos só com a série real.
- **Gráfico e faixa de cotações**: widgets gratuitos do TradingView, com selo "Atraso de 15 min" (atraso confirmado pelo TradingView para dados da B3 nos widgets).
- Prompt do analista em `lib/prompt.ts` (Radar Bolsa + regras de resposta curta).

## Publicar na Vercel

[![Deploy na Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/wendelgonzaga81-alt/lovable&env=GEMINI_API_KEY,BRAPI_TOKEN,FIRECRAWL_API_KEY)

1. Clique no botão acima (ou importe o repositório em [vercel.com/new](https://vercel.com/new), framework Next.js).
2. Preencha as variáveis (ou depois em **Settings > Environment Variables**):
   - `GEMINI_API_KEY`: chave grátis do Google AI Studio, em https://aistudio.google.com/apikey (obrigatória para o chat).
   - `BRAPI_TOKEN`: token gratuito da brapi.dev (sem ele, só PETR4, VALE3, ITUB4 e MGLU3 funcionam).
   - `FIRECRAWL_API_KEY`: chave do Firecrawl (notícias e leitura de páginas).
   - Opcional: `ANTHROPIC_API_KEY` para usar o Claude no lugar do Gemini (pago).
3. Se mudar variáveis depois, clique em **Redeploy**.

As chaves ficam só no servidor. Nunca as coloque no código.

Segurança (proteção Cybertruck): veja [SEGURANCA.md](SEGURANCA.md), com as camadas automáticas, o interruptor de emergência e o passo a passo em caso de invasão.

## Estrutura: site público x painel

```
app/(site)/          site público: início (/), chat (/chat), privacidade (/privacidade)
app/(admin)/admin/   painel administrativo (/admin): login, métricas, segurança, cadastros, sistema
app/api/chat, radar, subscribe   APIs públicas
app/api/admin/*      APIs do painel (exigem sessão de administrador, checada no middleware)
lib/admin/           login do painel (só servidor)
lib/store.ts         métricas e cadastros (Upstash Redis)
middleware.ts        proteção Cybertruck + contagem de acessos
desktop/             app de computador (Electron) que abre o site e o painel
```

O código do painel nunca é enviado ao visitante do site: as páginas do painel são renderizadas no servidor e só depois do login.

## Painel administrativo

1. Na Vercel, em **Storage**, crie um banco **Upstash Redis** (grátis) e conecte ao projeto. As variáveis entram sozinhas.
2. Em **Settings > Environment Variables**, crie `ADMIN_PASSWORD` (12+ caracteres) e `ADMIN_SECRET` (texto aleatório longo). Opcional: `CONTACT_EMAIL`.
3. Faça **Redeploy** e acesse `https://SEU-SITE/admin`.

Dados mostrados: acessos e visitantes únicos (anônimos), perguntas ao bot, uso do Radar, bloqueios e eventos de segurança (IP mascarado) e cadastros com consentimento (nome e e-mail). O texto das conversas não é gravado.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```
