# Proteção Cybertruck: plano de segurança do Invest Moment

Defesa em camadas, ativa automaticamente em todo deploy. Nenhuma proteção é absoluta: ela reduz muito o risco e avisa quando algo estranho acontece, mas não substitui senhas fortes, verificação em duas etapas e troca de chaves em caso de suspeita.

## Camadas que já funcionam sozinhas

| Camada | Onde | O que faz |
|---|---|---|
| 1. Segredos só no servidor | Vercel | `GEMINI_API_KEY`, `BRAPI_TOKEN` e `FIRECRAWL_API_KEY` ficam nas variáveis da Vercel. Nunca vão para o navegador nem para o GitHub. |
| 2. Cabeçalhos de segurança | `next.config.mjs` | CSP (só scripts do site e do TradingView), HTTPS obrigatório (HSTS), proíbe o site dentro de iframe de terceiros, bloqueia câmera, microfone e localização, esconde a tecnologia do servidor. |
| 3. Bloqueio de robôs de invasão | `middleware.ts` | Quem procura `/.env`, `/wp-admin`, `/phpmyadmin`, `/.git` e afins recebe 404 e leva uma advertência. |
| 4. Bloqueio de outros sites | `middleware.ts` | Pedidos à API vindos de outro domínio, com método estranho ou formato errado são recusados. |
| 5. Limites de uso | `middleware.ts` | Por visitante: 8 perguntas por minuto e 150 por dia no chat, 30 pedidos por minuto nas outras APIs. Global: 60 perguntas por minuto no chat, para proteger a cota grátis da IA. |
| 6. Banimento automático | `middleware.ts` | 3 advertências em 10 minutos (robô de invasão, origem falsa, excesso de pedidos, pedido gigante) bloqueiam o IP por 15 minutos. |
| 7. Validação rígida | `app/api/chat/route.ts`, `lib/tools.ts` | Pedido de até 64 KB, mensagem de até 8.000 caracteres, histórico de até 40 mensagens. Cada ferramenta valida o que a IA pede (tickers, URLs só https, sem endereços internos). |
| 8. Anti prompt injection | `lib/guard.ts`, `lib/prompt.ts` | Pedidos para revelar o prompt, chaves ou "ignorar as regras" são recusados antes de chegar à IA. Notícias e páginas lidas chegam à IA marcadas como "conteúdo externo não confiável" e a IA é instruída a nunca seguir ordens escritas nelas. |
| 9. Filtro de saída | `lib/guard.ts` | Qualquer texto com formato de chave (Google, Anthropic, Firecrawl, tokens) ou igual a uma chave do servidor é trocado por `[removido]` antes de chegar ao visitante. |
| 10. Erros sem vazar dados | rotas da API | O visitante vê só mensagens genéricas. O detalhe técnico fica no log da Vercel. |
| 11. Registro de eventos | log da Vercel | Cada bloqueio gera uma linha `{"security":"..."}` com IP, caminho e horário: `scanner_probe`, `bad_origin`, `rate_limit`, `daily_limit`, `global_limit`, `ip_banned_15min`, `prompt_injection`, `lockdown`. |

**Limite honesto:** os contadores das camadas 5 e 6 ficam na memória de cada servidor da Vercel e zeram quando ele reinicia. Eles seguram abuso comum, não um ataque grande e distribuído. Para isso existe o firewall da Vercel (veja abaixo). O filtro anti prompt injection pega os ataques conhecidos, mas um texto bem disfarçado pode passar. Por isso a IA também não tem acesso a nenhuma chave nem a ações perigosas: ela só lê cotações e notícias.

## Painel administrativo (/admin)

- Login com `ADMIN_PASSWORD` (12+ caracteres). Sem ela, o painel fica desligado.
- Sessão em cookie HttpOnly, Secure e SameSite=Strict, assinado com `ADMIN_SECRET`, válido por 8 horas.
- Login limitado a 5 tentativas por minuto por IP; falhas são registradas e entram no banimento automático.
- APIs do painel recusam qualquer pedido sem sessão (checado no middleware antes de chegar ao código).
- O painel não aparece no Google (noindex) e não tem link no site público.
- LGPD: estatísticas anônimas (visitante único por código diário embaralhado), IP mascarado nos eventos, retenção de 90 dias, cadastro só com consentimento, exclusão pelo botão "Excluir" e Política em `/privacidade`.

Se suspeitar que a senha do painel vazou: troque `ADMIN_PASSWORD` e `ADMIN_SECRET` na Vercel e faça Redeploy. Todas as sessões abertas caem na hora.

## Ajustes sem mexer no código (variáveis na Vercel)

`RATE_LIMIT_CHAT_PER_MIN`, `RATE_LIMIT_CHAT_PER_DAY`, `RATE_LIMIT_API_PER_MIN`, `GLOBAL_CHAT_PER_MIN`. Depois de mudar, faça **Redeploy**.

## Interruptor de emergência

Na Vercel: **Settings > Environment Variables**, adicione a variável e clique em **Redeploy**.

- `AI_DISABLED=1`: desliga só o chat com IA. O resto do site continua no ar.
- `SITE_LOCKDOWN=1`: desliga todas as APIs (chat e Radar). As páginas continuam abrindo, sem dados.

Para religar, apague a variável e faça **Redeploy** de novo.

## Em caso de invasão ou uso estranho (passo a passo)

1. **Desligue:** ative `SITE_LOCKDOWN=1` e faça Redeploy (2 minutos). Se o ataque for grande, ative também o **Attack Challenge Mode** no Firewall da Vercel.
2. **Troque as chaves.** Apague a chave antiga e crie uma nova:
   - Gemini: https://aistudio.google.com/apikey
   - brapi: https://brapi.dev/dashboard
   - Firecrawl: https://www.firecrawl.dev/app/api-keys
   - Anthropic (se usar): https://console.anthropic.com/settings/keys
   - Painel: troque `ADMIN_PASSWORD` e `ADMIN_SECRET`.
   - Redis: em Vercel > Storage > Upstash, gere novo token.
3. **Atualize na Vercel:** cole as chaves novas em Settings > Environment Variables.
4. **Verifique o código:** no GitHub, confira em "Commits" se há alterações que você não reconhece. Se houver, volte para o último commit bom.
5. **Proteja as contas:** troque a senha e ative a verificação em duas etapas no GitHub, na Vercel e no Google.
6. **Religue:** apague `SITE_LOCKDOWN` e faça Redeploy.
7. **Confira o uso:** veja os painéis de uso de cada serviço (abaixo) nos dias seguintes.

## Como checar o uso

- Vercel: projeto > **Logs** (procure `"security"`; muitos `ip_banned_15min` ou `prompt_injection` seguidos indicam ataque) e **Usage**.
- Gemini: https://aistudio.google.com/usage
- brapi: painel em https://brapi.dev/dashboard
- Firecrawl: https://www.firecrawl.dev/app/usage

## O que só você pode ativar (precisa da sua conta)

- **Verificação em duas etapas** no GitHub, na Vercel e no Google.
- **Firewall da Vercel:** em Firewall, ative "Attack Challenge Mode" em caso de ataque e crie uma regra de limite para `/api/chat`.
- **Alertas de gasto:** na Vercel (Settings > Billing > Spend Management) e no Google Cloud (Billing > Budgets & alerts), caso você ative cobrança no Gemini.
- **Alertas do GitHub:** em Settings > Code security, ative Dependabot e Secret scanning.
