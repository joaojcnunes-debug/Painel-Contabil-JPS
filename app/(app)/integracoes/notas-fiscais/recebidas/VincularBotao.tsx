"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Link2, CheckCircle2 } from "lucide-react";

const VincularLancamentoModal = dynamic(
  () =>
    import("@/components/nfe/VincularLancamentoModal").then((m) => ({
      default: m.VincularLancamentoModal,
    })),
  { ssr: false }
);

type Props = {
  chave: string;
  idCliente: string;
  valorNfe: number | null;
  dhEmissao: string | null;
  idLancamentoAtual: string | null;
};

export function VincularBotao(p: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const jaTem = !!p.idLancamentoAtual;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          jaTem
            ? "inline-flex items-center gap-1 px-2 py-1 rounded border border-verde-primary/40 bg-verde-light text-verde-dark text-[11px] hover:border-verde-primary"
            : "inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] hover:border-amber-500"
        }
        title={jaTem ? "Vinculada — clique para trocar/desvincular" : "Vincular a lançamento contábil"}
      >
        {jaTem ? <CheckCircle2 size={11} /> : <Link2 size={11} />}
        {jaTem ? "Vinculada" : "Vincular"}
      </button>
      {open && (
        <VincularLancamentoModal
          open={open}
          onClose={() => setOpen(false)}
          onVinculado={() => router.refresh()}
          chave={p.chave}
          idCliente={p.idCliente}
          valorNfe={p.valorNfe}
          dhEmissao={p.dhEmissao}
          idLancamentoAtual={p.idLancamentoAtual}
        />
      )}
    </>
  );
}
