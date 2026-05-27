"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, gerarId } from "@/lib/utils";
import {
  calcularFerias,
  calcularFimGozo,
  diasDireitoPorFaltas,
} from "@/lib/ferias";
import type { Ferias, Funcionario, StatusFerias } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  ferias: Ferias | null;
  funcionarios: Funcionario[];
  idClienteDefault?: string;
};

const STATUS_OPTIONS: StatusFerias[] = [
  "PROGRAMADA",
  "EM_GOZO",
  "PAGA",
  "ENCERRADA",
];

export function FeriasFormModal({
  open,
  onClose,
  ferias,
  funcionarios,
  idClienteDefault,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!ferias;

  const [idFunc, setIdFunc] = useState("");
  const [aqInicio, setAqInicio] = useState("");
  const [aqFim, setAqFim] = useState("");
  const [faltas, setFaltas] = useState("0");
  const [inicioGozo, setInicioGozo] = useState("");
  const [diasGozados, setDiasGozados] = useState("30");
  const [comAbono, setComAbono] = useState(false);
  const [mediaVariaveis, setMediaVariaveis] = useState("");
  const [outrosDescontos, setOutrosDescontos] = useState("");
  const [status, setStatus] = useState<StatusFerias>("PROGRAMADA");
  const [dataPagamento, setDataPagamento] = useState("");
  const [obs, setObs] = useState("");

  // Funcionário selecionado
  const funcSel = useMemo(
    () => funcionarios.find((f) => f.id_funcionario === idFunc) ?? null,
    [funcionarios, idFunc]
  );

  useEffect(() => {
    if (!open) return;
    setIdFunc(ferias?.id_funcionario ?? "");
    setAqInicio(ferias?.periodo_aquisitivo_inicio ?? "");
    setAqFim(ferias?.periodo_aquisitivo_fim ?? "");
    setFaltas(String(ferias?.faltas_periodo ?? 0));
    setInicioGozo(ferias?.data_inicio_gozo ?? "");
    setDiasGozados(String(ferias?.dias_gozados ?? 30));
    setComAbono((ferias?.dias_abono ?? 0) > 0);
    setMediaVariaveis(
      ferias?.media_variaveis ? String(ferias.media_variaveis) : ""
    );
    setOutrosDescontos(
      ferias?.outros_descontos ? String(ferias.outros_descontos) : ""
    );
    setStatus(ferias?.status ?? "PROGRAMADA");
    setDataPagamento(ferias?.data_pagamento ?? "");
    setObs(ferias?.observacoes ?? "");
  }, [open, ferias]);

  // Auto-sugere período aquisitivo (12 meses anteriores) ao trocar de func
  useEffect(() => {
    if (!funcSel || isEdit || aqInicio) return;
    // Por padrão: 12 meses anteriores ao primeiro dia do mês atual
    const hoje = new Date();
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0); // último dia do mês anterior
    const inicio = new Date(fim);
    inicio.setMonth(inicio.getMonth() - 11);
    inicio.setDate(1);
    setAqInicio(toIso(inicio));
    setAqFim(toIso(fim));
    if (!mediaVariaveis) setMediaVariaveis("");
  }, [funcSel, isEdit, aqInicio, mediaVariaveis]);

  // Cálculo em tempo real
  const calculo = useMemo(() => {
    if (!funcSel) return null;
    const dias = Number(diasGozados) || 0;
    const abonoDias: 0 | 10 = comAbono ? 10 : 0;
    return calcularFerias({
      salarioBase: Number(funcSel.salario_base),
      mediaVariaveis: Number(mediaVariaveis) || 0,
      diasGozados: dias,
      diasAbono: abonoDias,
      dependentes: funcSel.dependentes,
      outrosDescontos: Number(outrosDescontos) || 0,
    });
  }, [funcSel, diasGozados, comAbono, mediaVariaveis, outrosDescontos]);

  const diasDireito = diasDireitoPorFaltas(Number(faltas) || 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!funcSel) throw new Error("Selecione o funcionário");
      if (!aqInicio || !aqFim)
        throw new Error("Período aquisitivo é obrigatório");
      if (!inicioGozo) throw new Error("Data de início do gozo é obrigatória");
      const dias = Number(diasGozados) || 0;
      if (dias <= 0 || dias > 30)
        throw new Error("Dias gozados deve ser entre 1 e 30");
      if (!calculo) throw new Error("Falha no cálculo");

      const fimGozo = calcularFimGozo(inicioGozo, dias);
      const abonoDias = comAbono ? 10 : 0;

      const payload = {
        id_funcionario: funcSel.id_funcionario,
        id_cliente: funcSel.id_cliente,
        periodo_aquisitivo_inicio: aqInicio,
        periodo_aquisitivo_fim: aqFim,
        faltas_periodo: Number(faltas) || 0,
        dias_direito: diasDireito,
        data_inicio_gozo: inicioGozo,
        data_fim_gozo: fimGozo,
        dias_gozados: dias,
        dias_abono: abonoDias,
        nome_func: funcSel.nome,
        cargo_func: funcSel.cargo,
        cpf_func: funcSel.cpf,
        salario_base: Number(funcSel.salario_base),
        media_variaveis: Number(mediaVariaveis) || 0,
        valor_ferias: calculo.valorFerias,
        terco_ferias: calculo.tercoFerias,
        valor_abono: calculo.valorAbono,
        terco_abono: calculo.tercoAbono,
        base_inss: calculo.baseInss,
        inss: calculo.inss,
        base_irrf: calculo.baseIrrf,
        irrf: calculo.irrf,
        outros_descontos: calculo.outrosDescontos,
        total_bruto: calculo.totalBruto,
        liquido: calculo.liquido,
        fgts: calculo.fgts,
        data_pagamento: dataPagamento || null,
        status,
        observacoes: obs.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const supabase = createSupabaseBrowserClient();
      if (isEdit) {
        const { error } = await supabase
          .from("ferias")
          .update(payload as never)
          .eq("id_ferias", ferias!.id_ferias);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ferias")
          .insert({ id_ferias: gerarId("FER"), ...payload } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ferias"] });
      toast.success(isEdit ? "Férias atualizadas" : "Férias programadas");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  // Filtra funcionários do cliente default se houver
  const funcs = idClienteDefault
    ? funcionarios.filter((f) => f.id_cliente === idClienteDefault)
    : funcionarios;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar férias" : "Programar férias"}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={mutation.isPending || !calculo}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Bloco titulo="Funcionário">
          <Field label="Selecione o funcionário" required>
            <select
              className={inputClass}
              value={idFunc}
              onChange={(e) => setIdFunc(e.target.value)}
              disabled={isEdit}
            >
              <option value="">—</option>
              {funcs.map((f) => (
                <option key={f.id_funcionario} value={f.id_funcionario}>
                  {f.nome} ({f.cargo ?? f.tipo}) — {formatBRL(Number(f.salario_base))}
                </option>
              ))}
            </select>
          </Field>
        </Bloco>

        <Bloco titulo="Período aquisitivo">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Início" required>
              <input
                type="date"
                className={inputClass}
                value={aqInicio}
                onChange={(e) => setAqInicio(e.target.value)}
                required
              />
            </Field>
            <Field label="Fim" required>
              <input
                type="date"
                className={inputClass}
                value={aqFim}
                onChange={(e) => setAqFim(e.target.value)}
                required
              />
            </Field>
            <Field label="Faltas no período" hint={`Direito a ${diasDireito} dias`}>
              <input
                className={inputClass}
                value={faltas}
                onChange={(e) => setFaltas(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </Field>
          </div>
          <div className="text-[11px] text-gray-500 px-1">
            <strong>Tabela de faltas:</strong> 0-5 → 30 dias • 6-14 → 24 • 15-23 → 18 • 24-32 → 12 • +32 → 0
          </div>
        </Bloco>

        <Bloco titulo="Gozo">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Início do gozo" required>
              <input
                type="date"
                className={inputClass}
                value={inicioGozo}
                onChange={(e) => setInicioGozo(e.target.value)}
                required
              />
            </Field>
            <Field
              label="Dias gozados"
              hint={comAbono ? "20 ao gozar + 10 abono" : `Máx. ${diasDireito} dias`}
            >
              <input
                className={inputClass}
                value={diasGozados}
                onChange={(e) => setDiasGozados(e.target.value)}
                inputMode="numeric"
                max={30}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFerias)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm pt-1">
            <input
              type="checkbox"
              checked={comAbono}
              onChange={(e) => {
                setComAbono(e.target.checked);
                if (e.target.checked && Number(diasGozados) > 20) {
                  setDiasGozados("20");
                }
              }}
            />
            <span>
              Abono pecuniário (vender 10 dias) —{" "}
              <span className="text-gray-500">isento de INSS e IRRF</span>
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Média de variáveis (R$)" hint="Média de HE/comissões no período">
              <input
                className={inputClass}
                value={mediaVariaveis}
                onChange={(e) => setMediaVariaveis(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
            <Field label="Outros descontos (R$)">
              <input
                className={inputClass}
                value={outrosDescontos}
                onChange={(e) => setOutrosDescontos(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
          </div>
          {status === "PAGA" || status === "ENCERRADA" ? (
            <Field label="Data de pagamento">
              <input
                type="date"
                className={inputClass}
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </Field>
          ) : null}
        </Bloco>

        {/* ─── Cálculo em tempo real ─── */}
        {calculo && (
          <Bloco titulo="Cálculo">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Linha label="Férias gozadas" value={formatBRL(calculo.valorFerias)} />
              <Linha label="1/3 constitucional" value={formatBRL(calculo.tercoFerias)} />
              {calculo.valorAbono > 0 && (
                <>
                  <Linha label="Abono (10 dias)" value={formatBRL(calculo.valorAbono)} />
                  <Linha label="1/3 do abono" value={formatBRL(calculo.tercoAbono)} />
                </>
              )}
            </div>
            <div className="border-t border-card-border pt-3 mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Linha label="INSS" value={formatBRL(calculo.inss)} tone="red" />
              <Linha label="IRRF" value={formatBRL(calculo.irrf)} tone="red" />
              {calculo.outrosDescontos > 0 && (
                <Linha
                  label="Outros desc."
                  value={formatBRL(calculo.outrosDescontos)}
                  tone="red"
                />
              )}
              <Linha label="FGTS (encargo)" value={formatBRL(calculo.fgts)} />
            </div>
            <div className="border-2 border-verde-dark rounded-lg p-3 mt-2 bg-gold/5 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gold">
                  Líquido a receber
                </div>
                <div className="text-xs text-gray-500">
                  Bruto {formatBRL(calculo.totalBruto)}
                </div>
              </div>
              <div className="font-serif text-2xl font-bold text-verde-dark">
                {formatBRL(calculo.liquido)}
              </div>
            </div>
          </Bloco>
        )}

        <Field label="Observações">
          <textarea
            className={`${inputClass} min-h-[60px]`}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

function Bloco({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-card-border rounded-lg p-4 bg-app-bg/40 space-y-4">
      <h3 className="font-serif text-sm font-semibold text-verde-dark border-b border-card-border pb-2">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Linha({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red";
}) {
  return (
    <div className="bg-white border border-card-border rounded p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`font-medium ${tone === "red" ? "text-red-alert" : "text-gray-800"}`}
      >
        {value}
      </div>
    </div>
  );
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
