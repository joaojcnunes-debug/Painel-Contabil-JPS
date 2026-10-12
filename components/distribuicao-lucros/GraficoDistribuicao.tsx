"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Ponto = { periodo: string; valor: number };

function compacto(n: number): string {
  if (n < 1000) return `${n.toFixed(0)}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function GraficoDistribuicao({ data }: { data: Ponto[] }) {
  if (data.every((d) => d.valor === 0)) {
    return (
      <div className="h-60 flex items-center justify-center text-xs text-gray-500">
        Sem distribuições no período
      </div>
    );
  }
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#E5E1D5" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="periodo"
            tick={{ fontSize: 11, fill: "#6B6558" }}
            axisLine={{ stroke: "#E5E1D5" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6B6558" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={compacto}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            contentStyle={{
              background: "#fff",
              border: "1px solid #D9CFB8",
              borderRadius: 6,
              fontSize: 12,
              padding: "6px 10px",
            }}
            formatter={(v: number) => [
              Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
              "Distribuído",
            ]}
          />
          <Bar
            dataKey="valor"
            fill="var(--color-verde-primary, #2A6B4E)"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
