"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Upload } from "lucide-react";

const NfseImportarManualModal = dynamic(
  () =>
    import("@/components/integracoes/NfseImportarManualModal").then((m) => ({
      default: m.NfseImportarManualModal,
    })),
  { ssr: false }
);

export function ImportarNfseManualButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-verde-primary text-white rounded-lg text-xs font-medium hover:bg-verde-accent"
        title="Importar XMLs de NFSe emitidos em portais municipais (Nota Carioca, NFSe SP, etc)"
      >
        <Upload size={14} /> Importar XML manual
      </button>
      {open && (
        <NfseImportarManualModal
          open={open}
          onClose={() => setOpen(false)}
          onImported={() => router.refresh()}
        />
      )}
    </>
  );
}
