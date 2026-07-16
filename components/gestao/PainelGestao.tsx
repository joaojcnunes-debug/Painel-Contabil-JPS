"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import type { GestaoStatus, GestaoTarefa, PrioridadeTarefa } from "@/lib/gestao/types";

type Props = {
  status: GestaoStatus[];
  tarefas: GestaoTarefa[];
};

const CORES_PRIORIDADE_HEX: Record<PrioridadeTarefa, string> = {
  Baixa: "#94a3b8",
  Media: "#3b82f6",
  Alta: "#f59e0b",
  Urgente: "#ef4444",
};

export function PainelGestao({ status, tarefas }: Props) {
  const hoje = new Date().toISOString().slice(0, 10);
  const semana = new Date();
  semana.setDate(semana.getDate() + 7);
  const semanaIso = semana.toISOString().slice(0, 10);

  const total = tarefas.length;
  const concluidas = useMemo(() => {
    const slugsConcluidos = new Set(
      status.filter((s) => s.tipo === "concluido").map((s) => s.slug)
    );
    return tarefas.filter((t) => slugsConcluidos.has(t.status)).length;
  }, [tarefas, status]);
  const atrasadas = tarefas.filter(
    (t) => t.prazo && t.prazo < hoje && !status.find((s) => s.slug === t.status && s.tipo === "concluido")
  ).length;
  const semanaConta = tarefas.filter(
    (t) => t.prazo && t.prazo >= hoje && t.prazo <= semanaIso
  ).length;

  // Por status
  const dadosStatus = useMemo(() => {
    return status.map((s) => ({
      nome: s.nome,
      qtd: tarefas.filter((t) => t.status === s.slug).length,
      cor: s.cor,
    }));
  }, [status, tarefas]);

  // Por prioridade
  const dadosPrio = useMemo(() => {
    const arr: PrioridadeTarefa[] = ["Baixa", "Media", "Alta", "Urgente"];
    return arr.map((p) => ({
      nome: p,
      qtd: tarefas.filter((t) => t.prioridade === p).length,
      cor: CORES_PRIORIDADE_HEX[p],
    }));
  }, [tarefas]);

  // Por responsável (top 8 com mais tarefas)
  const dadosResp = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tarefas) {
      const r = t.responsavel ?? "(sem)";
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, qtd]) => ({ nome, qtd }));
  }, [tarefas]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Tarefas" value={String(total)} tone="neutro" />
        <Kpi
          label="Concluídas"
          value={`${concluidas}${total > 0 ? ` (${Math.round((concluidas / total) * 100)}%)` : ""}`}
          tone="positivo"
        />
        <Kpi
          label="Atrasadas"
          value={String(atrasadas)}
          tone={atrasadas > 0 ? "critico" : "positivo"}
        />
        <Kpi label="Prazo esta semana" value={String(semanaConta)} tone="aviso" />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartBox titulo="Por status">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={dadosStatus}
                dataKey="qtd"
                nameKey="nome"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={(entry: { qtd: number }) =>
                  entry.qtd > 0 ? entry.qtd : ""
                }
              >
                {dadosStatus.map((d, i) => (
                  <Cell key={i} fill={d.cor} />
                ))}
              </Pie>
              <Tooltip />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox titulo="Por prioridade">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dadosPrio}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D5" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="qtd" radius={[4, 4, 0, 0]}>
                {dadosPrio.map((d, i) => (
                  <Cell key={i} fill={d.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox titulo="Top responsáveis">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dadosResp} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D5" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="nome"
                tick={{ fontSize: 10 }}
                width={110}
              />
              <Tooltip />
              <Bar dataKey="qtd" fill="#2A6B4E" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutro" | "positivo" | "aviso" | "critico";
}) {
  const cls =
    tone === "critico"
      ? "text-red-alert"
      : tone === "aviso"
        ? "text-amber-700"
        : tone === "positivo"
          ? "text-verde-dark"
          : "text-gray-800";
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function ChartBox({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-card-border rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
        {titulo}
      </div>
      {children}
    </div>
  );
}
