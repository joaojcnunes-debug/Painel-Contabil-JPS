"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Gift,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useFuncionarios } from "@/lib/hooks/useFuncionarios";
import { useDecimosTerceiros } from "@/lib/hooks/useDecimosTerceiros";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  calcularDecimoTerceiro,
  mesesTrabalhadosNoAno,
  STATUS_DECIMO_LABEL,
} from "@/lib/decimo-terceiro";
import { formatBRL, formatDate, gerarId } from "@/lib/utils";
import type { DecimoTerceiro, Funcionario } from "@/lib/supabase/types";

type Aba = "processar" | "historico";

export default function DecimoTerceiroPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const anoAtual = new Date().getFullYear();
  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>("processar");
  const [idCliente, setIdCliente] = useState("");
  const [ano, setAno] = useState(anoAtual);

  const { data: funcionarios = [] } = useFuncionarios({
    idCliente: idCliente || undefined,
  });

  const { data: historicos = [] } = useDecimosTerceiros({
    idCliente: idCliente || undefined,
    ano,
  });

  // Considera funcionários que trabalharam em algum mês do ano
  const elegiveis = useMemo(() => {
    if (!idCliente) return [];
    return funcionarios
      .filter((f) => f.id_cliente === idCliente)
      .filter((f) => mesesTrabalhadosNoAno(ano, f.data_admissao, f.data_demissao) > 0);
  }, [funcionarios, idCliente, ano]);

  // Ajustes por funcionário (média variáveis, outros desc, primeira já paga)
  type Ajuste = {
    media: string;
    outros: string;
    primeiraPaga: string; // se preenchido, usa esse valor da 1ª
  };
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});

  function getAjuste(f: Funcionario): Ajuste {
    // Procura registro existente no histórico
    const existe = historicos.find((h) => h.id_funcionario === f.id_funcionario);
    return (
      ajustes[f.id_funcionario] ?? {
        media: "",
        outros: "",
        primeiraPaga: existe ? String(existe.valor_primeira) : "",
      }
    );
  }

  function setAjusteCampo(idFunc: string, campo: keyof Ajuste, valor: string) {
    setAjustes((prev) => ({
      ...prev,
      [idFunc]: {
        ...(prev[idFunc] ?? { media: "", outros: "", primeiraPaga: "" }),
        [campo]: valor,
      },
    }));
  }

  // Prévia total
  const previa = useMemo(() => {
    let integral = 0;
    let primeira = 0;
    let inss = 0;
    let irrf = 0;
    let segunda = 0;
    let fgts = 0;
    for (const f of elegiveis) {
      const a = getAjuste(f);
      const meses = mesesTrabalhadosNoAno(ano, f.data_admissao, f.data_demissao);
      const r = calcularDecimoTerceiro({
        salarioBase: Number(f.salario_base),
        mediaVariaveis: Number(a.media) || 0,
        meses,
        dependentes: f.dependentes,
        outrosDescontos: Number(a.outros) || 0,
        primeiraJaPaga: a.primeiraPaga ? Number(a.primeiraPaga) : undefined,
      });
      integral += r.valorIntegral;
      primeira += r.valorPrimeira;
      inss += r.inss;
      irrf += r.irrf;
      segunda += r.valorSegunda;
      fgts += r.fgts;
    }
    return { integral, primeira, inss, irrf, segunda, fgts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegiveis, ajustes, ano, historicos]);

  // ─── Processar parcela ──────────────────────────────────
  const processar = useMutation({
    mutationFn: async (parcela: 1 | 2) => {
      if (!idCliente) throw new Error("Selecione a empresa");
      if (elegiveis.length === 0)
        throw new Error("Nenhum funcionário elegível");
      const supabase = createSupabaseBrowserClient();
      const hoje = new Date().toISOString().slice(0, 10);

      for (const f of elegiveis) {
        const a = getAjuste(f);
        const meses = mesesTrabalhadosNoAno(
          ano,
          f.data_admissao,
          f.data_demissao
        );
        const r = calcularDecimoTerceiro({
          salarioBase: Number(f.salario_base),
          mediaVariaveis: Number(a.media) || 0,
          meses,
          dependentes: f.dependentes,
          outrosDescontos: Number(a.outros) || 0,
          primeiraJaPaga: a.primeiraPaga ? Number(a.primeiraPaga) : undefined,
        });

        const existente = historicos.find(
          (h) => h.id_funcionario === f.id_funcionario
        );

        // Define novo status
        let novoStatus = existente?.status ?? "PENDENTE";
        let dataPrimeira = existente?.data_primeira ?? null;
        let dataSegunda = existente?.data_segunda ?? null;

        if (parcela === 1) {
          dataPrimeira = hoje;
          novoStatus = "PRIMEIRA_PAGA";
        } else {
          dataSegunda = hoje;
          if (dataPrimeira) novoStatus = "QUITADO";
          else novoStatus = "SEGUNDA_PAGA";
        }

        const payload = {
          id_cliente: idCliente,
          id_funcionario: f.id_funcionario,
          ano,
          nome_func: f.nome,
          cargo_func: f.cargo,
          cpf_func: f.cpf,
          salario_base: Number(f.salario_base),
          media_variaveis: Number(a.media) || 0,
          meses_trabalhados: meses,
          valor_integral: r.valorIntegral,
          valor_primeira: r.valorPrimeira,
          data_primeira: dataPrimeira,
          base_inss: r.baseInss,
          inss: r.inss,
          base_irrf: r.baseIrrf,
          irrf: r.irrf,
          outros_descontos: r.outrosDescontos,
          valor_segunda: r.valorSegunda,
          data_segunda: dataSegunda,
          liquido_total: r.liquidoTotal,
          fgts: r.fgts,
          status: novoStatus,
          updated_at: new Date().toISOString(),
        };

        if (existente) {
          const { error } = await supabase
            .from("decimos_terceiros")
            .update(payload as never)
            .eq("id_decimo", existente.id_decimo);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("decimos_terceiros")
            .insert({ id_decimo: gerarId("DEC"), ...payload } as never);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_, parcela) => {
      qc.invalidateQueries({ queryKey: ["decimos-terceiros"] });
      toast.success(
        parcela === 1
          ? "1ª parcela processada"
          : "2ª parcela processada (com INSS e IRRF)"
      );
      setAba("historico");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (idDec: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("decimos_terceiros")
        .delete()
        .eq("id_decimo", idDec);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decimos-terceiros"] });
      toast.success("Registro removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="13º salário" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode processar 13º salário.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="13º salário"
        subtitle="1ª parcela até 30/nov (sem descontos) — 2ª parcela até 20/dez (com INSS+IRRF)"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Valor indicativo.</strong> Cálculo proporcional: 1/12 por
          mês trabalhado (fração ≥ 15 dias = mês cheio). INSS e IRRF
          incidem sobre o <strong>valor integral</strong>, retidos na 2ª
          parcela. FGTS 8% é encargo patronal.
        </div>
      </div>

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
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Ano-base
          </label>
          <input
            type="number"
            className={`${inputClass} w-32`}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            min={2020}
            max={2099}
          />
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 w-fit">
        <TabBtn
          ativo={aba === "processar"}
          onClick={() => setAba("processar")}
          disabled={!idCliente}
        >
          Processar
        </TabBtn>
        <TabBtn ativo={aba === "historico"} onClick={() => setAba("historico")}>
          Histórico
        </TabBtn>
      </div>

      {/* ─── Aba Processar ─── */}
      {aba === "processar" && (
        <>
          {!idCliente ? (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Selecione uma empresa pra processar o 13º.
            </div>
          ) : elegiveis.length === 0 ? (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              <Gift size={32} className="mx-auto text-gray-300 mb-2" />
              Nenhum funcionário elegível ao 13º {ano} nesta empresa.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <Stat label="Funcionários" value={String(elegiveis.length)} raw />
                <Stat label="Integral" value={formatBRL(previa.integral)} />
                <Stat label="1ª parcela" value={formatBRL(previa.primeira)} />
                <Stat
                  label="Total INSS+IRRF"
                  value={formatBRL(previa.inss + previa.irrf)}
                />
              </div>

              <div className="flex gap-2 mb-4 print:hidden">
                <Button
                  onClick={() => processar.mutate(1)}
                  disabled={processar.isPending}
                  variant="secondary"
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 size={14} />
                  Processar 1ª parcela (50%)
                </Button>
                <Button
                  onClick={() => processar.mutate(2)}
                  disabled={processar.isPending}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 size={14} />
                  Processar 2ª parcela (com descontos)
                </Button>
              </div>

              <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3">Funcionário</th>
                      <th className="px-3 py-3 text-center w-16">Meses</th>
                      <th className="px-3 py-3 text-right w-24">Salário</th>
                      <th className="px-3 py-3 text-right w-24">Média var.</th>
                      <th className="px-3 py-3 text-right w-24">Outros desc.</th>
                      <th className="px-3 py-3 text-right w-24">Integral</th>
                      <th className="px-3 py-3 text-right w-24">1ª (50%)</th>
                      <th className="px-3 py-3 text-right w-20">INSS</th>
                      <th className="px-3 py-3 text-right w-20">IRRF</th>
                      <th className="px-3 py-3 text-right w-28 bg-gold/10">2ª líquida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {elegiveis.map((f) => {
                      const a = getAjuste(f);
                      const meses = mesesTrabalhadosNoAno(
                        ano,
                        f.data_admissao,
                        f.data_demissao
                      );
                      const r = calcularDecimoTerceiro({
                        salarioBase: Number(f.salario_base),
                        mediaVariaveis: Number(a.media) || 0,
                        meses,
                        dependentes: f.dependentes,
                        outrosDescontos: Number(a.outros) || 0,
                        primeiraJaPaga: a.primeiraPaga
                          ? Number(a.primeiraPaga)
                          : undefined,
                      });
                      return (
                        <tr key={f.id_funcionario} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800">
                              {f.nome}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {f.cargo ?? "—"}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-700">
                            {meses}/12
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                            {formatBRL(Number(f.salario_base))}
                          </td>
                          <InputCelula
                            value={a.media}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "media", v)
                            }
                          />
                          <InputCelula
                            value={a.outros}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "outros", v)
                            }
                          />
                          <td className="px-3 py-2 text-right font-medium text-gray-700 whitespace-nowrap">
                            {formatBRL(r.valorIntegral)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                            {formatBRL(r.valorPrimeira)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                            {formatBRL(r.inss)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">
                            {formatBRL(r.irrf)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-verde-dark whitespace-nowrap bg-gold/5">
                            {formatBRL(r.valorSegunda)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td colSpan={5} className="px-3 py-3 text-right text-gray-700">
                        Totais:
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {formatBRL(previa.integral)}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {formatBRL(previa.primeira)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">
                        {formatBRL(previa.inss)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 whitespace-nowrap">
                        {formatBRL(previa.irrf)}
                      </td>
                      <td className="px-3 py-3 text-right text-verde-dark whitespace-nowrap">
                        {formatBRL(previa.segunda)}
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
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Ano</th>
                <th className="px-4 py-3">Funcionário</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3 text-center">Meses</th>
                <th className="px-4 py-3 text-right">Integral</th>
                <th className="px-4 py-3 text-right">1ª</th>
                <th className="px-4 py-3 text-right">2ª líq.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {historicos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                    Nenhum 13º processado nesse filtro.
                  </td>
                </tr>
              ) : (
                historicos.map((d) => {
                  const st = STATUS_DECIMO_LABEL[d.status] ?? {
                    label: d.status,
                    cls: "bg-gray-100 text-gray-700",
                  };
                  return (
                    <tr key={d.id_decimo} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {d.ano}
                      </td>
                      <td className="px-4 py-3 text-gray-800">{d.nome_func}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {d.clientes?.razao_social ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {d.meses_trabalhados}/12
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                        {formatBRL(Number(d.valor_integral))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                        {formatBRL(Number(d.valor_primeira))}
                        {d.data_primeira && (
                          <div className="text-[10px] text-gray-400">
                            {formatDate(d.data_primeira)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                        {formatBRL(Number(d.valor_segunda))}
                        {d.data_segunda && (
                          <div className="text-[10px] text-gray-400 font-normal">
                            {formatDate(d.data_segunda)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/decimo-terceiro/recibo/${d.id_decimo}`}
                            className="inline-flex items-center gap-1 text-verde-primary hover:text-verde-dark text-xs font-medium"
                          >
                            <FileText size={12} /> Recibo
                          </Link>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Remover 13º ${d.ano} de ${d.nome_func}?`
                                )
                              )
                                excluir.mutate(d.id_decimo);
                            }}
                            className="p-1 text-gray-400 hover:text-red-alert"
                            title="Excluir"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
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
