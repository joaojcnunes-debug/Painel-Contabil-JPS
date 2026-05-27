import { formatBRL } from "@/lib/utils";

export type BarPoint = {
  label: string; // "Mai/26"
  receita: number;
  despesa: number;
};

// Bar chart de receita vs despesa por mês — puro CSS/Flex.
// Cada mês mostra 2 barras (verde receita, vermelha despesa) e o saldo abaixo.
export function BarChartMensal({ data }: { data: BarPoint[] }) {
  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.receita, d.despesa])
  );

  return (
    <div className="relative">
      {/* Grid de fundo (3 linhas) */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-12">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-t border-card-border/50" />
        ))}
      </div>

      <div className="relative flex items-end justify-around gap-2 h-48 pb-2">
        {data.map((d) => {
          const saldo = d.receita - d.despesa;
          const altR = Math.round((d.receita / max) * 100);
          const altD = Math.round((d.despesa / max) * 100);
          const semDados = d.receita === 0 && d.despesa === 0;
          return (
            <div
              key={d.label}
              className="flex-1 flex flex-col items-center gap-1 group min-w-0"
            >
              {/* Barras */}
              <div className="flex-1 w-full flex items-end justify-center gap-1">
                <div
                  className="bg-verde-primary rounded-t w-3 sm:w-4 transition group-hover:bg-verde-accent"
                  style={{ height: `${altR}%`, minHeight: d.receita > 0 ? "2px" : "0" }}
                  title={`Receita: ${formatBRL(d.receita)}`}
                />
                <div
                  className="bg-red-alert rounded-t w-3 sm:w-4 transition group-hover:bg-red-700"
                  style={{ height: `${altD}%`, minHeight: d.despesa > 0 ? "2px" : "0" }}
                  title={`Despesa: ${formatBRL(d.despesa)}`}
                />
              </div>
              {/* Label do mês */}
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                {d.label}
              </div>
              {/* Saldo */}
              <div
                className={
                  semDados
                    ? "text-[10px] text-gray-300"
                    : saldo >= 0
                    ? "text-[10px] font-medium text-verde-dark"
                    : "text-[10px] font-medium text-red-alert"
                }
              >
                {semDados
                  ? "—"
                  : saldo >= 0
                  ? "+" + formatBRLCompacto(saldo)
                  : "−" + formatBRLCompacto(Math.abs(saldo))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-500 mt-2 pt-2 border-t border-card-border">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-verde-primary" /> Receita
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-alert" /> Despesa
        </span>
      </div>
    </div>
  );
}

// Formato compacto: 1.5k, 12k, 3.2M
function formatBRLCompacto(n: number): string {
  if (n < 1000) return `R$ ${n.toFixed(0)}`;
  if (n < 1_000_000) return `R$ ${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `R$ ${(n / 1_000_000).toFixed(1)}M`;
}
