"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, Calculator, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useApuracoes } from "@/lib/hooks/useApuracoes";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate, gerarId } from "@/lib/utils";
import {
  ANEXO_LABEL,
  calcularDas,
  type AnexoSimples,
  type ResultadoApuracao,
} from "@/lib/simples-nacional";

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Soma de RECEITA dos últimos 12 meses até (e excluindo) a competência alvo.
async function calcularRbt12(
  idCliente: string,
  competencia: string
): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  // competencia = YYYY-MM. Calcula janela de 12 meses anteriores.
  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  // Início: 12 meses antes do mês alvo
  const ini = new Date(ano, mes - 1 - 12, 1);
  const fim = new Date(ano, mes - 1, 1); // primeiro dia do mês alvo (exclusivo)
  const iniStr = `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, "0")}-01`;
  const fimStr = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("lancamentos")
    .select("valor")
    .eq("id_cliente", idCliente)
    .eq("tipo", "RECEITA")
    .gte("data_lancamento", iniStr)
    .lt("data_lancamento", fimStr);
  if (error) throw error;
  return (data ?? []).reduce(
    (s: number, r: { valor: number }) => s + Number(r.valor),
    0
  );
}

// Soma de RECEITA do mês de competência
async function calcularReceitaMes(
  idCliente: string,
  competencia: string
): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proxMes = new Date(ano, mes, 1);
  const fim = `${proxMes.getFullYear()}-${String(proxMes.getMonth() + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("lancamentos")
    .select("valor")
    .eq("id_cliente", idCliente)
    .eq("tipo", "RECEITA")
    .gte("data_lancamento", ini)
    .lt("data_lancamento", fim);
  if (error) throw error;
  return (data ?? []).reduce(
    (s: number, r: { valor: number }) => s + Number(r.valor),
    0
  );
}

export default function ApuracaoPage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: clientes = [] } = useClientes();
  const qc = useQueryClient();

  const [idCliente, setIdCliente] = useState("");
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [anexoOverride, setAnexoOverride] = useState<AnexoSimples | "">("");
  const [rbt12Manual, setRbt12Manual] = useState("");
  const [receitaManual, setReceitaManual] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoApuracao | null>(null);

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id_cliente === idCliente) ?? null,
    [clientes, idCliente]
  );

  // Anexo efetivo: override > cliente.anexo_simples > 'III'
  const anexoEfetivo: AnexoSimples =
    (anexoOverride || (clienteSel?.anexo_simples as AnexoSimples | undefined) || "III");

  const { data: historico = [], isLoading: histLoading } = useApuracoes(
    idCliente ? { idCliente } : undefined
  );

  // Filtra clientes Simples Nacional pra UX (mas permite outros)
  const clientesSimples = clientes.filter(
    (c) => c.regime === "SIMPLES_NACIONAL"
  );
  const outrosClientes = clientes.filter(
    (c) => c.regime !== "SIMPLES_NACIONAL"
  );

  async function calcular() {
    if (!idCliente) {
      toast.error("Selecione um cliente");
      return;
    }
    setCalculando(true);
    setResultado(null);
    try {
      let rbt12: number;
      let receitaMes: number;
      // Se preencheu manual, usa; senão, busca dos lançamentos
      if (rbt12Manual.trim()) {
        rbt12 = Number(rbt12Manual.replace(",", "."));
        if (!isFinite(rbt12) || rbt12 < 0) throw new Error("RBT12 inválido");
      } else {
        rbt12 = await calcularRbt12(idCliente, competencia);
      }
      if (receitaManual.trim()) {
        receitaMes = Number(receitaManual.replace(",", "."));
        if (!isFinite(receitaMes) || receitaMes < 0)
          throw new Error("Receita do mês inválida");
      } else {
        receitaMes = await calcularReceitaMes(idCliente, competencia);
      }
      const r = calcularDas(anexoEfetivo, rbt12, receitaMes);
      setResultado(r);
      // Preenche os campos com os valores calculados pra ficar transparente
      setRbt12Manual(String(rbt12.toFixed(2)));
      setReceitaManual(String(receitaMes.toFixed(2)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCalculando(false);
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!resultado || !idCliente) throw new Error("Calcule antes de salvar");
      const supabase = createSupabaseBrowserClient();
      // Upsert por (cliente, competência) — substitui se já existir
      const payload = {
        id_apuracao: gerarId("APU"),
        id_cliente: idCliente,
        competencia,
        anexo: resultado.anexo,
        receita_mes: resultado.receitaMes,
        rbt12: resultado.rbt12,
        faixa: resultado.faixa,
        aliquota_nominal: resultado.aliquotaNominal,
        parcela_deduzir: resultado.parcelaDeduzir,
        aliquota_efetiva: resultado.aliquotaEfetiva,
        valor_das: resultado.valorDas,
        observacoes: resultado.observacoes.join(" | ") || null,
      };
      // Deleta existente da mesma competência (UNIQUE constraint), depois insere
      await supabase
        .from("apuracoes_simples")
        .delete()
        .eq("id_cliente", idCliente)
        .eq("competencia", competencia);
      const { error } = await supabase
        .from("apuracoes_simples")
        .insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apuracoes"] });
      toast.success("Apuração salva no histórico");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (idApur: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("apuracoes_simples")
        .delete()
        .eq("id_apuracao", idApur);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apuracoes"] });
      toast.success("Apuração removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Apuração do Simples" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode calcular apurações.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Apuração do Simples Nacional"
        subtitle="Cálculo do DAS — Anexos I a V (LC 123/06)"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Valor indicativo.</strong> A apuração oficial do DAS é gerada
          no PGDAS-D da Receita. Use esse cálculo como pré-conferência —
          confira sempre antes de transmitir.
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs uppercase text-gray-500 mb-1">
              Cliente
            </label>
            <select
              className={inputClass}
              value={idCliente}
              onChange={(e) => {
                setIdCliente(e.target.value);
                setResultado(null);
                setAnexoOverride("");
                setRbt12Manual("");
                setReceitaManual("");
              }}
            >
              <option value="">Selecione o cliente…</option>
              {clientesSimples.length > 0 && (
                <optgroup label="Simples Nacional">
                  {clientesSimples.map((c) => (
                    <option key={c.id_cliente} value={c.id_cliente}>
                      {c.razao_social}
                      {c.anexo_simples ? ` (Anexo ${c.anexo_simples})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {outrosClientes.length > 0 && (
                <optgroup label="Outros regimes">
                  {outrosClientes.map((c) => (
                    <option key={c.id_cliente} value={c.id_cliente}>
                      {c.razao_social}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">
              Competência
            </label>
            <input
              type="month"
              className={inputClass}
              value={competencia}
              onChange={(e) => {
                setCompetencia(e.target.value);
                setResultado(null);
              }}
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">
              Anexo
            </label>
            <select
              className={inputClass}
              value={anexoEfetivo}
              onChange={(e) => {
                setAnexoOverride(e.target.value as AnexoSimples);
                setResultado(null);
              }}
            >
              {(["I", "II", "III", "IV", "V"] as AnexoSimples[]).map((a) => (
                <option key={a} value={a}>
                  Anexo {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">
              RBT12 (R$) — opcional
            </label>
            <input
              className={inputClass}
              value={rbt12Manual}
              onChange={(e) => setRbt12Manual(e.target.value)}
              placeholder="Deixe em branco pra somar dos lançamentos"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">
              Receita do mês (R$) — opcional
            </label>
            <input
              className={inputClass}
              value={receitaManual}
              onChange={(e) => setReceitaManual(e.target.value)}
              placeholder="Deixe em branco pra somar do mês"
              inputMode="decimal"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={calcular}
              disabled={!idCliente || calculando}
              className="flex items-center gap-2 w-full justify-center"
            >
              <Calculator size={16} />
              {calculando ? "Calculando…" : "Calcular DAS"}
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 mt-3">
          Se RBT12 e receita ficarem em branco, somamos os lançamentos do tipo{" "}
          <strong>RECEITA</strong> dos últimos 12 meses e do mês de competência,
          respectivamente.
        </p>
      </div>

      {resultado && (
        <div className="bg-white border border-card-border rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg font-semibold text-verde-dark">
              Resultado — {competencia}
            </h3>
            <Button
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending}
              className="flex items-center gap-2"
            >
              <Save size={14} />
              {salvar.isPending ? "Salvando…" : "Salvar no histórico"}
            </Button>
          </div>

          <div className="text-xs text-gray-500 mb-3">
            {ANEXO_LABEL[resultado.anexo]}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="RBT12" value={formatBRL(resultado.rbt12)} />
            <Stat label="Receita do mês" value={formatBRL(resultado.receitaMes)} />
            <Stat label="Faixa" value={`${resultado.faixa}ª`} highlight />
            <Stat
              label="Alíquota efetiva"
              value={`${(resultado.aliquotaEfetiva * 100).toFixed(4)}%`}
              highlight
            />
          </div>

          <div className="border border-card-border rounded-lg p-4 bg-app-bg/40 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Alíquota nominal da faixa</span>
              <span className="font-medium">
                {(resultado.aliquotaNominal * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Parcela a deduzir</span>
              <span className="font-medium">
                {formatBRL(resultado.parcelaDeduzir)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-t border-card-border pt-2 mt-2">
              <span className="text-gray-600">
                Receita × alíquota efetiva
              </span>
              <span className="font-medium">
                {formatBRL(resultado.receitaMes)} ×{" "}
                {(resultado.aliquotaEfetiva * 100).toFixed(4)}%
              </span>
            </div>
            <div className="flex justify-between py-2 border-t border-card-border mt-2 text-base">
              <span className="font-semibold text-verde-dark">DAS a pagar</span>
              <span className="font-bold text-verde-dark">
                {formatBRL(resultado.valorDas)}
              </span>
            </div>
          </div>

          {resultado.observacoes.length > 0 && (
            <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
              {resultado.observacoes.map((o, i) => (
                <div key={i}>• {o}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Histórico */}
      <div className="bg-white border border-card-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border bg-gray-50">
          <h3 className="font-serif text-sm font-semibold text-verde-dark">
            Histórico de apurações
            {clienteSel && ` — ${clienteSel.razao_social}`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-white text-gray-600 text-left text-xs uppercase border-b border-card-border">
              <tr>
                <th className="px-4 py-2">Competência</th>
                <th className="px-4 py-2">Anexo</th>
                <th className="px-4 py-2 text-right">Receita mês</th>
                <th className="px-4 py-2 text-right">RBT12</th>
                <th className="px-4 py-2 text-right">Alíq. efet.</th>
                <th className="px-4 py-2 text-right">DAS</th>
                <th className="px-4 py-2 w-20">Salvo em</th>
                <th className="px-4 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {histLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}
              {!histLoading && historico.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                    {idCliente
                      ? "Nenhuma apuração salva pra este cliente."
                      : "Selecione um cliente acima pra ver o histórico."}
                  </td>
                </tr>
              )}
              {historico.map((a) => (
                <tr key={a.id_apuracao} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800 font-medium whitespace-nowrap">
                    {a.competencia}
                  </td>
                  <td className="px-4 py-2 text-gray-600">Anexo {a.anexo}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {formatBRL(Number(a.receita_mes))}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 whitespace-nowrap">
                    {formatBRL(Number(a.rbt12))}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600 whitespace-nowrap">
                    {(Number(a.aliquota_efetiva) * 100).toFixed(4)}%
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-verde-dark whitespace-nowrap">
                    {formatBRL(Number(a.valor_das))}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(a.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => {
                        if (confirm(`Remover apuração de ${a.competencia}?`))
                          excluir.mutate(a.id_apuracao);
                      }}
                      className="p-1 text-gray-400 hover:text-red-alert"
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
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
            : "text-base font-semibold text-gray-800 mt-1"
        }
      >
        {value}
      </div>
    </div>
  );
}
