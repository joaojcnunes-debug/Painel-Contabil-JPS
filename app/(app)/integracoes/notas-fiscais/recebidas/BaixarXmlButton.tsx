"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Download, Loader2 } from "lucide-react";

// Botão "Baixar XML": pede signed URL ao backend e dispara download.
// Mantém arquivo nomeado pela chave da NF.
export function BaixarXmlButton({
  chave,
  numero,
}: {
  chave: string;
  numero: string;
}) {
  const [loading, setLoading] = useState(false);

  async function baixar() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integracoes/nfe-xml-url?chave=${encodeURIComponent(chave)}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.erro ?? "Falha ao gerar URL");
        return;
      }
      // Dispara download com nome amigável
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `NFe-${numero}-${chave}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={baixar}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      title="Baixar XML"
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Download size={12} />
      )}
      XML
    </button>
  );
}
