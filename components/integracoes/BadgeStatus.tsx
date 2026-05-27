import type {
  ModoIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";

export function BadgeStatus({
  status,
}: {
  status: StatusIntegracao | null | undefined;
}) {
  if (!status) {
    return (
      <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100 text-gray-600">
        Não configurado
      </span>
    );
  }
  const map: Record<StatusIntegracao, { label: string; cls: string }> = {
    OK: { label: "OK", cls: "bg-green-100 text-green-700" },
    ERRO: { label: "Erro", cls: "bg-red-100 text-red-alert" },
    PENDENTE: { label: "Pendência", cls: "bg-amber-100 text-amber-800" },
  };
  const s = map[status];
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export function BadgeModo({
  modo,
}: {
  modo: ModoIntegracao | null | undefined;
}) {
  const real = modo === "REAL";
  return (
    <span
      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
        real
          ? "bg-verde-dark text-white"
          : "bg-gold/20 text-amber-900 border border-gold/40"
      }`}
      title={real ? "Modo real — chamadas verdadeiras" : "Modo simulado"}
    >
      {real ? "Real" : "Simulado"}
    </span>
  );
}
