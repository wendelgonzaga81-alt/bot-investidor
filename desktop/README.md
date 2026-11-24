# Invest Moment para computador

App de computador (Windows, macOS e Linux) que abre o site publicado e o painel administrativo.
O painel continua exigindo a senha de administrador. Nenhuma chave fica no app.

O app depende do site estar publicado na Vercel.

## Gerar o instalador do Windows (grátis, pelo GitHub)

1. Em `desktop/config.json`, troque `https://SEU-SITE.vercel.app` pelo endereço do site.
2. No GitHub, abra a aba **Actions** > **App para computador** > **Run workflow**.
3. Quando terminar (uns 5 min), abra a execução e baixe **InvestMoment-Windows** em Artifacts.
   Dentro estão o instalador (`Invest Moment Setup 1.0.0.exe`) e a versão portátil.

O Windows pode mostrar "O Windows protegeu o computador" porque o app não tem assinatura paga.
Clique em **Mais informações > Executar assim mesmo**.

## Alternativa sem instalador

No Chrome ou Edge, abra o site e clique no ícone **Instalar** na barra de endereço.
O Invest Moment vira um app com ícone na área de trabalho, incluindo o atalho do Painel.
