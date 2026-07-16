"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Ponto = { dia: string; qtd: number; valor: number };

export function GraficoNfePorDia({ data }: { data: Ponto[] }) {
  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-xs text-gray-500">
        Sem dados no período
      </div>
    );
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradVerde" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-verde-primary, #2A6B4E)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-verde-primary, #2A6B4E)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E5E1D5" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="dia"
            tick={{ fontSize: 10, fill: "#6B6558" }}
            tickFormatter={(iso: string) => {
              const [, m, d] = iso.split("-");
              return `${d}/${m}`;
            }}
            interval="preserveStartEnd"
            minTickGap={24}
            axisLine={{ stroke: "#E5E1D5" }}
            tickLine={{ stroke: "#E5E1D5" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6B6558" }}
            axisLine={{ stroke: "#E5E1D5" }}
            tickLine={{ stroke: "#E5E1D5" }}
            allowDecimals={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              background: "#fff",
              border: "1px solid #D9CFB8",
              borderRadius: 6,
              fontSize: 12,
              padding: "6px 10px",
            }}
            labelFormatter={(iso: string) => {
              const [y, m, d] = iso.split("-");
              return `${d}/${m}/${y}`;
            }}
            formatter={(v: number, key: string) => {
              if (key === "valor") {
                return [
                  Number(v).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }),
                  "Valor",
                ];
              }
              return [v, "NFe"];
            }}
          />
          <Area
            type="monotone"
            dataKey="qtd"
            stroke="#2A6B4E"
            strokeWidth={2}
            fill="url(#gradVerde)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
