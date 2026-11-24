"use client";
import { useEffect } from "react";

// Registra o service worker para o navegador oferecer "Instalar app".
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
