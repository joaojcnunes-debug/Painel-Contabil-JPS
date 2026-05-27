"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Eye,
  Pencil,
  Play,
  Plus,
  Users as UsersIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useFuncionarios } from "@/lib/hooks/useFuncionarios";
import { useFolhas } from "@/lib/hooks/useFolhas";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { calcularFolha, STATUS_FUNC_LABEL, TIPO_FUNC_LABEL } from "@/lib/folha-pagamento";
import { formatBRL, gerarId } from "@/lib/utils";
import type { Funcionario } from "@/lib/supabase/types";

const FuncionarioFormModal = dynamic(
  () =>
    import("@/components/folha/FuncionarioFormModal").then((m) => ({
      default: m.FuncionarioFormModal,
    })),
  { ssr: false }
);

type Aba = "funcionarios" | "processar" | "historico";

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FolhaPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>("funcionarios");
  const [idCliente, setIdCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("ATIVO");

  const { data: funcionarios = [], isLoading: funcLoading } = useFuncionarios({
    idCliente: idCliente || undefined,
    status: statusFiltro || undefined,
    busca: busca || undefined,
  });

  const { data: folhas = [], isLoading: folhasLoading } = useFolhas(
    idCliente ? { idCliente } : undefined
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [funcEdit, setFuncEdit] = useState<Funcionario | null>(null);

  // ─── Processar folha ──────────────────────────────────────
  const [competencia, setCompetencia] = useState(competenciaAtual());
  // valores avulsos por funcionário pra ajuste pontual
  type Ajuste = {
    horasExtras: string;
    adicionalNoturno: string;
    outrosProventos: string;
    descFaltas: string;
    descAdiantamento: string;
    descOutros: string;
  };
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});

  function getAjuste(idFunc: string): Ajuste {
    return (
      ajustes[idFunc] ?? {
        horasExtras: "",
        adicionalNoturno: "",
        outrosProventos: "",
        descFaltas: "",
        descAdiantamento: "",
        descOutros: "",
      }
    );
  }

  function setAjusteCampo(idFunc: string, campo: keyof Ajuste, valor: string) {
    setAjustes((prev) => ({
      ...prev,
      [idFunc]: { ...getAjuste(idFunc), [campo]: valor },
    }));
  }

  // Funcionários ativos da empresa selecionada (pra processar)
  const ativos = useMemo(
    () =>
      funcionarios.filter(
        (f) => f.id_cliente === idCliente && f.status === "ATIVO"
      ),
    [funcionarios, idCliente]
  );

  // Prévia do total da folha
  const previa = useMemo(() => {
    let proventos = 0;
    let descontos = 0;
    let liquido = 0;
    let inssPatronal = 0;
    let fgts = 0;
    for (const f of ativos) {
      const a = getAjuste(f.id_funcionario);
      const r = calcularFolha({
        salarioBase: Number(f.salario_base),
        horasExtras: Number(a.horasExtras) || 0,
        adicionalNoturno: Number(a.adicionalNoturno) || 0,
        outrosProventos: Number(a.outrosProventos) || 0,
        descFaltas: Number(a.descFaltas) || 0,
        descAdiantamento: Number(a.descAdiantamento) || 0,
        descOutros: Number(a.descOutros) || 0,
        dependentes: f.dependentes,
        valorVt: f.vale_transporte ? Number(f.valor_vt) || 0 : null,
        planoSaude: Number(f.plano_saude_desc) || 0,
      });
      proventos += r.totalProventos;
      descontos += r.totalDescontos;
      liquido += r.liquido;
      inssPatronal += r.inssPatronal;
      fgts += r.fgts;
    }
    return { proventos, descontos, liquido, inssPatronal, fgts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, ajustes]);

  const processar = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione a empresa");
      if (ativos.length === 0)
        throw new Error("Nenhum funcionário ativo nesta empresa");
      const supabase = createSupabaseBrowserClient();

      // Remove folha existente da mesma competência (recalcula)
      const { data: existente } = await supabase
        .from("folhas_pagamento")
        .select("id_folha")
        .eq("id_cliente", idCliente)
        .eq("competencia", competencia)
        .maybeSingle();
      if (existente) {
        await supabase
          .from("folha_itens")
          .delete()
          .eq("id_folha", (existente as { id_folha: string }).id_folha);
        await supabase
          .from("folhas_pagamento")
          .delete()
          .eq("id_folha", (existente as { id_folha: string }).id_folha);
      }

      // Cria cabeçalho
      const idFolha = gerarId("FOL");
      let totalProv = 0;
      let totalDesc = 0;
      let totalLiq = 0;
      let totalInssP = 0;
      let totalFgts = 0;

      const itens: Record<string, number | string | null>[] = [];
      for (const f of ativos) {
        const a = getAjuste(f.id_funcionario);
        const r = calcularFolha({
          salarioBase: Number(f.salario_base),
          horasExtras: Number(a.horasExtras) || 0,
          adicionalNoturno: Number(a.adicionalNoturno) || 0,
          outrosProventos: Number(a.outrosProventos) || 0,
          descFaltas: Number(a.descFaltas) || 0,
          descAdiantamento: Number(a.descAdiantamento) || 0,
          descOutros: Number(a.descOutros) || 0,
          dependentes: f.dependentes,
          valorVt: f.vale_transporte ? Number(f.valor_vt) || 0 : null,
          planoSaude: Number(f.plano_saude_desc) || 0,
        });
        totalProv += r.totalProventos;
        totalDesc += r.totalDescontos;
        totalLiq += r.liquido;
        totalInssP += r.inssPatronal;
        totalFgts += r.fgts;
        itens.push({
          id_item: gerarId("FIT"),
          id_folha: idFolha,
          id_funcionario: f.id_funcionario,
          nome_func: f.nome,
          cargo_func: f.cargo,
          salario_base: Number(f.salario_base),
          horas_extras: Number(a.horasExtras) || 0,
          adicional_noturno: Number(a.adicionalNoturno) || 0,
          outros_proventos: Number(a.outrosProventos) || 0,
          desc_faltas: Number(a.descFaltas) || 0,
          desc_adiantamento: Number(a.descAdiantamento) || 0,
          desc_outros: Number(a.descOutros) || 0,
          base_inss: r.baseInss,
          inss: r.inss,
          base_irrf: r.baseIrrf,
          irrf: r.irrf,
          vale_transporte: r.vt,
          plano_saude: r.planoSaude,
          total_proventos: r.totalProventos,
          total_descontos: r.totalDescontos,
          liquido: r.liquido,
          inss_patronal: r.inssPatronal,
          fgts: r.fgts,
          observacoes: null,
        });
      }

      const { error: errFolha } = await supabase
        .from("folhas_pagamento")
        .insert({
          id_folha: idFolha,
          id_cliente: idCliente,
          competencia,
          total_proventos: round2(totalProv),
          total_descontos: round2(totalDesc),
          total_liquido: round2(totalLiq),
          total_inss_patronal: round2(totalInssP),
          total_fgts: round2(totalFgts),
          status: "ABERTA",
        } as never);
      if (errFolha) throw errFolha;

      const { error: errItens } = await supabase
        .from("folha_itens")
        .insert(itens as never);
      if (errItens) throw errItens;

      return idFolha;
    },
    onSuccess: (idFolha) => {
      qc.invalidateQueries({ queryKey: ["folhas-pagamento"] });
      toast.success("Folha processada com sucesso");
      setAjustes({});
      setAba("historico");
      // Notifica o link
      void idFolha;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Folha de pagamento" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode processar folhas.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Folha de pagamento"
        subtitle="Cadastro de funcionários, cálculo INSS/IRRF/FGTS e holerites"
        actions={
          aba === "funcionarios" && (
            <Button
              onClick={() => {
                setFuncEdit(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus size={16} /> Novo funcionário
            </Button>
          )
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Valor indicativo.</strong> Tabelas INSS/IRRF vigentes em 2025.
          A folha oficial deve ser fechada com base na portaria do
          Ministério da Previdência e Receita Federal do ano corrente.
        </div>
      </div>

      {/* Filtros gerais */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[260px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Empresa (cliente)
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

      {/* Tabs */}
      <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 w-fit">
        <TabBtn ativo={aba === "funcionarios"} onClick={() => setAba("funcionarios")}>
          Funcionários
        </TabBtn>
        <TabBtn
          ativo={aba === "processar"}
          onClick={() => setAba("processar")}
          disabled={!idCliente}
        >
          Processar folha
        </TabBtn>
        <TabBtn ativo={aba === "historico"} onClick={() => setAba("historico")}>
          Histórico
        </TabBtn>
      </div>

      {/* ─── Aba Funcionários ─── */}
      {aba === "funcionarios" && (
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
              <option value="">Todos os status</option>
              <option value="ATIVO">Ativos</option>
              <option value="AFASTADO">Afastados</option>
              <option value="DEMITIDO">Demitidos</option>
            </select>
          </div>

          <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Funcionário</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Cargo</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Salário</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {funcLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!funcLoading && funcionarios.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      <UsersIcon size={32} className="mx-auto text-gray-300 mb-2" />
                      Nenhum funcionário cadastrado.
                    </td>
                  </tr>
                )}
                {funcionarios.map((f) => {
                  const st = STATUS_FUNC_LABEL[f.status] ?? {
                    label: f.status,
                    cls: "bg-gray-100 text-gray-700",
                  };
                  return (
                    <tr key={f.id_funcionario} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {f.nome}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {f.clientes?.razao_social ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{f.cargo ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {TIPO_FUNC_LABEL[f.tipo] ?? f.tipo}
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {formatBRL(Number(f.salario_base))}
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
                            setFuncEdit(f);
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
              Selecione uma empresa acima pra processar a folha.
            </div>
          ) : ativos.length === 0 ? (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Nenhum funcionário ativo nesta empresa.
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
                    {processar.isPending ? "Processando…" : "Processar folha"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <Stat label="Funcionários" value={String(ativos.length)} raw />
                <Stat label="Proventos" value={formatBRL(previa.proventos)} />
                <Stat label="Descontos" value={formatBRL(previa.descontos)} />
                <Stat
                  label="Líquido"
                  value={formatBRL(previa.liquido)}
                  highlight
                />
                <Stat
                  label="Encargos (INSS+FGTS)"
                  value={formatBRL(previa.inssPatronal + previa.fgts)}
                />
              </div>

              <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3">Funcionário</th>
                      <th className="px-3 py-3 text-right w-24">Salário</th>
                      <th className="px-3 py-3 text-right w-20">H.Extras</th>
                      <th className="px-3 py-3 text-right w-20">Ad.Not.</th>
                      <th className="px-3 py-3 text-right w-24">Outros prov.</th>
                      <th className="px-3 py-3 text-right w-20">Faltas</th>
                      <th className="px-3 py-3 text-right w-24">Adiantam.</th>
                      <th className="px-3 py-3 text-right w-24">Outros desc.</th>
                      <th className="px-3 py-3 text-right w-28 bg-gold/10">Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {ativos.map((f) => {
                      const a = getAjuste(f.id_funcionario);
                      const r = calcularFolha({
                        salarioBase: Number(f.salario_base),
                        horasExtras: Number(a.horasExtras) || 0,
                        adicionalNoturno: Number(a.adicionalNoturno) || 0,
                        outrosProventos: Number(a.outrosProventos) || 0,
                        descFaltas: Number(a.descFaltas) || 0,
                        descAdiantamento: Number(a.descAdiantamento) || 0,
                        descOutros: Number(a.descOutros) || 0,
                        dependentes: f.dependentes,
                        valorVt: f.vale_transporte ? Number(f.valor_vt) || 0 : null,
                        planoSaude: Number(f.plano_saude_desc) || 0,
                      });
                      return (
                        <tr key={f.id_funcionario} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800">{f.nome}</div>
                            <div className="text-[11px] text-gray-500">
                              {f.cargo ?? TIPO_FUNC_LABEL[f.tipo]}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                            {formatBRL(Number(f.salario_base))}
                          </td>
                          <InputCelula
                            value={a.horasExtras}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "horasExtras", v)
                            }
                          />
                          <InputCelula
                            value={a.adicionalNoturno}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "adicionalNoturno", v)
                            }
                          />
                          <InputCelula
                            value={a.outrosProventos}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "outrosProventos", v)
                            }
                          />
                          <InputCelula
                            value={a.descFaltas}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "descFaltas", v)
                            }
                          />
                          <InputCelula
                            value={a.descAdiantamento}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "descAdiantamento", v)
                            }
                          />
                          <InputCelula
                            value={a.descOutros}
                            onChange={(v) =>
                              setAjusteCampo(f.id_funcionario, "descOutros", v)
                            }
                          />
                          <td className="px-3 py-2 text-right font-semibold text-verde-dark whitespace-nowrap bg-gold/5">
                            {formatBRL(r.liquido)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td colSpan={8} className="px-3 py-3 text-right text-gray-700">
                        Total líquido a pagar:
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
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3 text-right">Proventos</th>
                <th className="px-4 py-3 text-right">Descontos</th>
                <th className="px-4 py-3 text-right">Líquido</th>
                <th className="px-4 py-3 text-right">Encargos</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {folhasLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}
              {!folhasLoading && folhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                    Nenhuma folha processada ainda.
                  </td>
                </tr>
              )}
              {folhas.map((f) => (
                <tr key={f.id_folha} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {f.competencia}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {f.clientes?.razao_social ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(f.total_proventos))}
                  </td>
                  <td className="px-4 py-3 text-right text-red-alert whitespace-nowrap">
                    {formatBRL(Number(f.total_descontos))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                    {formatBRL(Number(f.total_liquido))}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                    {formatBRL(
                      Number(f.total_inss_patronal) + Number(f.total_fgts)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/folha/${f.id_folha}`}
                      className="inline-flex items-center gap-1 text-verde-primary hover:text-verde-dark text-xs font-medium"
                    >
                      <Eye size={12} /> Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FuncionarioFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        funcionario={funcEdit}
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
