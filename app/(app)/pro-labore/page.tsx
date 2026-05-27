"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  FileText,
  Pencil,
  Play,
  Plus,
  Trash2,
  UserCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useSocios, useProLabore } from "@/lib/hooks/useSocios";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { calcularProLabore, STATUS_SOCIO_LABEL } from "@/lib/pro-labore";
import { formatBRL, formatCPF, formatDate, gerarId } from "@/lib/utils";
import type { Socio } from "@/lib/supabase/types";

const SocioFormModal = dynamic(
  () =>
    import("@/components/pro-labore/SocioFormModal").then((m) => ({
      default: m.SocioFormModal,
    })),
  { ssr: false }
);

type Aba = "socios" | "processar" | "historico";

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ProLaborePage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>("socios");
  const [idCliente, setIdCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("ATIVO");

  const { data: socios = [], isLoading: sociosLoading } = useSocios({
    idCliente: idCliente || undefined,
    status: statusFiltro || undefined,
    busca: busca || undefined,
  });

  const { data: pagamentos = [], isLoading: pagsLoading } = useProLabore(
    idCliente ? { idCliente } : undefined
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [socioEdit, setSocioEdit] = useState<Socio | null>(null);

  // ─── Processar mês ──────────────────────────────────────
  const [competencia, setCompetencia] = useState(competenciaAtual());
  // ajustes por sócio: valor + outros descontos
  type Ajuste = { valor: string; outros: string };
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});

  function getAjuste(s: Socio): Ajuste {
    return (
      ajustes[s.id_socio] ?? {
        valor: String(s.pro_labore_mensal),
        outros: "",
      }
    );
  }

  function setAjusteCampo(idSocio: string, campo: keyof Ajuste, valor: string) {
    setAjustes((prev) => ({
      ...prev,
      [idSocio]: { ...(prev[idSocio] ?? { valor: "", outros: "" }), [campo]: valor },
    }));
  }

  const ativos = useMemo(
    () =>
      socios.filter((s) => s.id_cliente === idCliente && s.status === "ATIVO"),
    [socios, idCliente]
  );

  const previa = useMemo(() => {
    let bruto = 0;
    let descontos = 0;
    let liquido = 0;
    for (const s of ativos) {
      const a = getAjuste(s);
      const r = calcularProLabore({
        valorProLabore: Number(a.valor) || 0,
        dependentes: s.dependentes,
        outrosDescontos: Number(a.outros) || 0,
      });
      bruto += r.valorProLabore;
      descontos += r.totalDescontos;
      liquido += r.liquido;
    }
    return { bruto, descontos, liquido };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, ajustes]);

  const processar = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione a empresa");
      if (ativos.length === 0) throw new Error("Nenhum sócio ativo nesta empresa");
      const supabase = createSupabaseBrowserClient();

      // Remove pagamentos existentes da mesma competência (reprocessamento)
      const idsSocios = ativos.map((s) => s.id_socio);
      await supabase
        .from("pro_labore_pagamentos")
        .delete()
        .eq("competencia", competencia)
        .in("id_socio", idsSocios);

      const registros: Record<string, number | string | null>[] = [];
      for (const s of ativos) {
        const a = getAjuste(s);
        const valor = Number(a.valor) || 0;
        if (valor <= 0) continue;
        const r = calcularProLabore({
          valorProLabore: valor,
          dependentes: s.dependentes,
          outrosDescontos: Number(a.outros) || 0,
        });
        registros.push({
          id_pagamento: gerarId("PRL"),
          id_socio: s.id_socio,
          id_cliente: s.id_cliente,
          competencia,
          nome_socio: s.nome,
          cpf_socio: s.cpf,
          valor_pro_labore: r.valorProLabore,
          inss: r.inss,
          base_irrf: r.baseIrrf,
          irrf: r.irrf,
          outros_descontos: r.outrosDescontos,
          liquido: r.liquido,
          data_pagamento: null,
          observacoes: null,
        });
      }
      if (registros.length === 0)
        throw new Error("Nenhum sócio com valor maior que zero");

      const { error } = await supabase
        .from("pro_labore_pagamentos")
        .insert(registros as never);
      if (error) throw error;
      return registros.length;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries({ queryKey: ["pro-labore"] });
      toast.success(`${qtd} pagamento(s) processado(s)`);
      setAjustes({});
      setAba("historico");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (idPag: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("pro_labore_pagamentos")
        .delete()
        .eq("id_pagamento", idPag);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-labore"] });
      toast.success("Pagamento removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marcarPago = useMutation({
    mutationFn: async (idPag: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("pro_labore_pagamentos")
        .update({
          data_pagamento: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id_pagamento", idPag);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pro-labore"] });
      toast.success("Marcado como pago");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Pró-labore" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode gerenciar pró-labore.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pró-labore dos sócios"
        subtitle="Retiradas mensais — INSS 11% (contribuinte individual) + IRRF progressivo"
        actions={
          aba === "socios" && (
            <Button
              onClick={() => {
                setSocioEdit(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus size={16} /> Novo sócio
            </Button>
          )
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Valor indicativo.</strong> INSS contribuinte individual:
          11% sobre o valor (teto R$ 951,62). IRRF: tabela 2025. Confira
          alíquotas vigentes antes de fechar o mês.
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[260px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Empresa
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
          >
            <option value="">Todas as empresas</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 w-fit">
        <TabBtn ativo={aba === "socios"} onClick={() => setAba("socios")}>
          Sócios
        </TabBtn>
        <TabBtn
          ativo={aba === "processar"}
          onClick={() => setAba("processar")}
          disabled={!idCliente}
        >
          Processar mês
        </TabBtn>
        <TabBtn ativo={aba === "historico"} onClick={() => setAba("historico")}>
          Histórico
        </TabBtn>
      </div>

      {/* ─── Aba Sócios ─── */}
      {aba === "socios" && (
        <>
          <div className="bg-white border border-card-border rounded-xl p-3 mb-4 flex flex-wrap gap-3">
            <input
              className={`${inputClass} max-w-[280px]`}
              placeholder="Buscar por nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              className={`${inputClass} max-w-[180px]`}
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="ATIVO">Ativos</option>
              <option value="INATIVO">Inativos</option>
            </select>
          </div>

          <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Sócio</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3 text-right">Participação</th>
                  <th className="px-4 py-3 text-right">Pró-labore</th>
                  <th className="px-4 py-3">Entrada</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {sociosLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!sociosLoading && socios.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      <UserCircle size={32} className="mx-auto text-gray-300 mb-2" />
                      Nenhum sócio cadastrado.
                    </td>
                  </tr>
                )}
                {socios.map((s) => {
                  const st = STATUS_SOCIO_LABEL[s.status] ?? {
                    label: s.status,
                    cls: "bg-gray-100 text-gray-700",
                  };
                  return (
                    <tr key={s.id_socio} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{s.nome}</div>
                        {s.cpf && (
                          <div className="text-[11px] text-gray-500 font-mono">
                            {formatCPF(s.cpf)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {s.clientes?.razao_social ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                        {s.participacao_pct != null
                          ? `${Number(s.participacao_pct).toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {formatBRL(Number(s.pro_labore_mensal))}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(s.data_entrada)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSocioEdit(s);
                            setModalOpen(true);
                          }}
                          className="p-1 text-gray-400 hover:text-verde-dark"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Aba Processar ─── */}
      {aba === "processar" && (
        <>
          {!idCliente ? (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Selecione uma empresa pra processar o mês.
            </div>
          ) : ativos.length === 0 ? (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Nenhum sócio ativo nesta empresa.
            </div>
          ) : (
            <>
              <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs uppercase text-gray-500 mb-1">
                    Competência
                  </label>
                  <input
                    type="month"
                    className={inputClass}
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
                  />
                </div>
                <div className="ml-auto flex items-end">
                  <Button
                    onClick={() => processar.mutate()}
                    disabled={processar.isPending}
                    className="flex items-center gap-2"
                  >
                    <Play size={14} />
                    {processar.isPending ? "Processando…" : "Processar mês"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="Sócios ativos" value={String(ativos.length)} raw />
                <Stat label="Bruto" value={formatBRL(previa.bruto)} />
                <Stat label="Líquido" value={formatBRL(previa.liquido)} highlight />
              </div>

              <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3">Sócio</th>
                      <th className="px-3 py-3 text-right w-32">Pró-labore</th>
                      <th className="px-3 py-3 text-right w-28">Outros desc.</th>
                      <th className="px-3 py-3 text-right w-24">INSS</th>
                      <th className="px-3 py-3 text-right w-24">IRRF</th>
                      <th className="px-3 py-3 text-right w-28 bg-gold/10">Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {ativos.map((s) => {
                      const a = getAjuste(s);
                      const r = calcularProLabore({
                        valorProLabore: Number(a.valor) || 0,
                        dependentes: s.dependentes,
                        outrosDescontos: Number(a.outros) || 0,
                      });
                      return (
                        <tr key={s.id_socio} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800">{s.nome}</div>
                            <div className="text-[11px] text-gray-500">
                              {s.dependentes > 0
                                ? `${s.dependentes} dependente(s)`
                                : "sem dependentes"}
                            </div>
                          </td>
                          <InputCelula
                            value={a.valor}
                            onChange={(v) => setAjusteCampo(s.id_socio, "valor", v)}
                          />
                          <InputCelula
                            value={a.outros}
                            onChange={(v) => setAjusteCampo(s.id_socio, "outros", v)}
                          />
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                            {formatBRL(r.inss)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                            {formatBRL(r.irrf)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-verde-dark whitespace-nowrap bg-gold/5">
                            {formatBRL(r.liquido)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td colSpan={5} className="px-3 py-3 text-right text-gray-700">
                        Total líquido:
                      </td>
                      <td className="px-3 py-3 text-right text-verde-dark whitespace-nowrap">
                        {formatBRL(previa.liquido)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── Aba Histórico ─── */}
      {aba === "historico" && (
        <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Sócio</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3 text-right">Bruto</th>
                <th className="px-4 py-3 text-right">INSS</th>
                <th className="px-4 py-3 text-right">IRRF</th>
                <th className="px-4 py-3 text-right">Líquido</th>
                <th className="px-4 py-3">Pago em</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pagsLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}
              {!pagsLoading && pagamentos.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                    Nenhum pagamento processado ainda.
                  </td>
                </tr>
              )}
              {pagamentos.map((p) => (
                <tr key={p.id_pagamento} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {p.competencia}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{p.nome_socio}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {p.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(p.valor_pro_labore))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(p.inss))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(p.irrf))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                    {formatBRL(Number(p.liquido))}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {p.data_pagamento ? (
                      formatDate(p.data_pagamento)
                    ) : (
                      <button
                        onClick={() => marcarPago.mutate(p.id_pagamento)}
                        disabled={marcarPago.isPending}
                        className="text-verde-primary hover:text-verde-dark text-xs underline"
                      >
                        Marcar pago
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/pro-labore/recibo/${p.id_pagamento}`}
                        className="inline-flex items-center gap-1 text-verde-primary hover:text-verde-dark text-xs font-medium"
                      >
                        <FileText size={12} /> Recibo
                      </Link>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Remover pagamento de ${p.nome_socio} em ${p.competencia}?`
                            )
                          )
                            excluir.mutate(p.id_pagamento);
                        }}
                        className="p-1 text-gray-400 hover:text-red-alert"
                        title="Excluir"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SocioFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        socio={socioEdit}
        clientes={clientes}
        idClienteDefault={idCliente || undefined}
      />
    </div>
  );
}

function InputCelula({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <td className="px-2 py-1">
      <input
        className="w-full text-right text-sm px-2 py-1 border border-gray-200 rounded focus:border-verde-primary focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        inputMode="decimal"
      />
    </td>
  );
}

function Stat({
  label,
  value,
  highlight,
  raw,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  raw?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "border border-gold/40 rounded-lg p-3 bg-gold/5"
          : "border border-card-border rounded-lg p-3 bg-white"
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={
          highlight
            ? "text-lg font-bold text-verde-dark mt-1"
            : raw
            ? "text-xl font-semibold text-gray-800 mt-1"
            : "text-base font-semibold text-gray-800 mt-1"
        }
      >
        {value}
      </div>
    </div>
  );
}

function TabBtn({
  ativo,
  onClick,
  disabled,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        ativo
          ? "px-4 py-1.5 rounded-md bg-verde-primary text-white text-sm font-medium"
          : disabled
          ? "px-4 py-1.5 rounded-md text-gray-300 text-sm cursor-not-allowed"
          : "px-4 py-1.5 rounded-md text-gray-600 hover:bg-gray-50 text-sm"
      }
    >
      {children}
    </button>
  );
}
