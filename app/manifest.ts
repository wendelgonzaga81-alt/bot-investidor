import type { MetadataRoute } from "next";

// Permite instalar o site como aplicativo (Chrome/Edge: ícone "Instalar" na barra de endereço).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Invest Moment",
    short_name: "Invest Moment",
    description: "Analista da B3 com dados, notícias e Radar do dia.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    lang: "pt-BR",
    id: "/chat",
    scope: "/",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chat", url: "/chat", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Painel administrativo", url: "/admin", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
