"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Upload,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { downloadCsv, normalizeHeader, parseCsv, toCsv } from "@/lib/csv";
import { gerarId } from "@/lib/utils";
import type {
  Cliente,
  PlanoConta,
  TipoLancamento,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  contas: PlanoConta[];
};

const COL_ALIAS: Record<string, string> = {
  cnpj: "cliente_cnpj",
  cliente_cnpj: "cliente_cnpj",
  cliente: "cliente_nome",
  cliente_nome: "cliente_nome",
  razao_social: "cliente_nome",
  data: "data_lancamento",
  data_lancamento: "data_lancamento",
  competencia: "competencia",
  tipo: "tipo",
  conta: "conta",
  codigo_conta: "conta",
  codigo: "conta",
  valor: "valor",
  descricao: "descricao",
  historico: "descricao",
  documento_ref: "documento_ref",
  doc: "documento_ref",
  doc_ref: "documento_ref",
  observacoes: "observacoes",
  obs: "observacoes",
};

const TIPO_ALIAS: Record<string, TipoLancamento> = {
  receita: "RECEITA",
  r: "RECEITA",
  rec: "RECEITA",
  c: "RECEITA",
  credito: "RECEITA",
  entrada: "RECEITA",
  despesa: "DESPESA",
  d: "DESPESA",
  des: "DESPESA",
  debito: "DESPESA",
  saida: "DESPESA",
};

type Linha = {
  numero: number;
  dados: Record<string, string>;
  id_cliente?: string;
  id_conta?: string;
  data_lancamento?: string;
  tipo?: TipoLancamento;
  valor?: number;
  erros: string[];
  alertas: string[];
};

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function parseDataBr(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dia = m[1].padStart(2, "0");
    const mes = m[2].padStart(2, "0");
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

function parseValor(s: string): number | null {
  const t = s.replace(/\./g, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) && n > 0 ? n : null;
}

function parseLinha(
  headers: string[],
  valores: string[],
  num: number,
  clientesMap: Map<string, string>,
  contasMap: Map<string, { id: string; tipo: TipoLancamento }>
): Linha {
  const dados: Record<string, string> = {};
  headers.forEach((h, i) => {
    const col = COL_ALIAS[normalizeHeader(h)];
    if (col) dados[col] = (valores[i] ?? "").trim();
  });

  const l: Linha = { numero: num, dados, erros: [], alertas: [] };

  // Cliente
  if (dados.cliente_cnpj) {
    const cnpj = onlyDigits(dados.cliente_cnpj);
    l.id_cliente = clientesMap.get("cnpj:" + cnpj);
    if (!l.id_cliente) l.erros.push(`CNPJ ${cnpj} não encontrado`);
  }
  if (!l.id_cliente && dados.cliente_nome) {
    l.id_cliente = clientesMap.get("nome:" + normalizeHeader(dados.cliente_nome));
    if (!l.id_cliente)
      l.erros.push(`Cliente '${dados.cliente_nome}' não encontrado`);
  }
  if (!l.id_cliente && !dados.cliente_cnpj && !dados.cliente_nome) {
    l.erros.push("informe cliente_cnpj ou cliente_nome");
  }

  // Conta (por código)
  if (dados.conta) {
    const k = normalizeHeader(dados.conta);
    const m = contasMap.get(k);
    if (m) l.id_conta = m.id;
    else l.erros.push(`Conta '${dados.conta}' não encontrada no plano`);
  } else {
    l.erros.push("informe a conta");
  }

  // Tipo
  if (dados.tipo) {
    const t = TIPO_ALIAS[normalizeHeader(dados.tipo)];
    if (t) l.tipo = t;
    else l.erros.push(`Tipo '${dados.tipo}' inválido (RECEITA/DESPESA)`);
  } else if (l.id_conta) {
    // Auto-detecta pelo tipo da conta
    const k = normalizeHeader(dados.conta);
    const m = contasMap.get(k);
    if (m) {
      l.tipo = m.tipo;
      l.alertas.push(`tipo deduzido da conta (${m.tipo})`);
    } else {
      l.erros.push("informe o tipo (RECEITA/DESPESA)");
    }
  } else {
    l.erros.push("informe o tipo (RECEITA/DESPESA)");
  }

  // Data
  if (dados.data_lancamento) {
    const d = parseDataBr(dados.data_lancamento);
    if (!d) l.erros.push(`data '${dados.data_lancamento}' inválida`);
    else l.data_lancamento = d;
  } else {
    l.erros.push("data vazia");
  }

  // Valor
  if (dados.valor) {
    const v = parseValor(dados.valor);
    if (v == null) l.erros.push(`valor '${dados.valor}' inválido`);
    else l.valor = v;
  } else {
    l.erros.push("valor vazio");
  }

  // Descrição
  if (!dados.descricao) l.erros.push("descrição vazia");

  return l;
}

export function ImportarLancamentosModal({
  open,
  onClose,
  clientes,
  contas,
}: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTexto("");
      setArquivoNome(null);
    }
  }, [open]);

  const clientesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes) {
      if (c.cnpj) m.set("cnpj:" + onlyDigits(c.cnpj), c.id_cliente);
      if (c.cpf) m.set("cnpj:" + onlyDigits(c.cpf), c.id_cliente);
      m.set("nome:" + normalizeHeader(c.razao_social), c.id_cliente);
      if (c.nome_fantasia)
        m.set("nome:" + normalizeHeader(c.nome_fantasia), c.id_cliente);
    }
    return m;
  }, [clientes]);

  const contasMap = useMemo(() => {
    const m = new Map<string, { id: string; tipo: TipoLancamento }>();
    for (const c of contas) {
      // por código (normalizado tira pontos)
      m.set(normalizeHeader(c.codigo), {
        id: c.id_conta,
        tipo: c.tipo,
      });
      // também por nome
      m.set(normalizeHeader(c.nome), {
        id: c.id_conta,
        tipo: c.tipo,
      });
    }
    return m;
  }, [contas]);

  function escolherArquivo() {
    inputRef.current?.click();
  }
  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 2 MB)");
      return;
    }
    const conteudo = await f.text();
    setTexto(conteudo);
    setArquivoNome(f.name);
    e.target.value = "";
  }

  const linhas = useMemo<Linha[]>(() => {
    if (!texto.trim()) return [];
    const rows = parseCsv(texto);
    if (rows.length < 1) return [];
    const headers = rows[0];
    return rows
      .slice(1)
      .map((vals, i) =>
        parseLinha(headers, vals, i + 2, clientesMap, contasMap)
      );
  }, [texto, clientesMap, contasMap]);

  const validas = linhas.filter((l) => l.erros.length === 0);
  const invalidas = linhas.length - validas.length;

  function baixarTemplate() {
    const csv = toCsv(
      [
        {
          cliente_cnpj: "00.000.000/0000-00",
          cliente_nome: "Exemplo Ltda",
          data: "15/05/2026",
          tipo: "DESPESA",
          conta: "4.01.01",
          valor: "2500,00",
          descricao: "Aluguel sala comercial maio/26",
          documento_ref: "Recibo 042",
          observacoes: "",
        },
      ],
      [
        "cliente_cnpj",
        "cliente_nome",
        "data",
        "tipo",
        "conta",
        "valor",
        "descricao",
        "documento_ref",
        "observacoes",
      ].map((c) => ({
        header: c,
        value: (row: Record<string, string>) => row[c] ?? "",
      }))
    );
    downloadCsv("template-lancamentos.csv", csv);
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (validas.length === 0) throw new Error("Nada válido pra importar");
      const supabase = createSupabaseBrowserClient();

      const payload = validas.map((l) => ({
        id_lancamento: gerarId("LCT"),
        id_cliente: l.id_cliente,
        id_conta: l.id_conta,
        data_lancamento: l.data_lancamento,
        competencia: (l.data_lancamento ?? "").slice(0, 7),
        tipo: l.tipo,
        valor: l.valor,
        descricao: l.dados.descricao,
        documento_ref: l.dados.documento_ref || null,
        observacoes: l.dados.observacoes || null,
      }));

      const { error } = await supabase
        .from("lancamentos")
        .insert(payload as never);
      if (error) throw error;
      return { criados: payload.length, invalidos: invalidas };
    },
    onSuccess: ({ criados, invalidos }) => {
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      let msg = `${criados} lançamento${criados === 1 ? "" : "s"} importado${criados === 1 ? "" : "s"}`;
      if (invalidos > 0) msg += ` • ${invalidos} com erro`;
      toast.success(msg);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar lançamentos (CSV)"
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={importar.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => importar.mutate()}
            disabled={importar.isPending || validas.length === 0}
            className="flex items-center gap-2"
          >
            <Upload size={16} />
            {importar.isPending
              ? "Importando..."
              : `Importar ${validas.length} lançament${validas.length === 1 ? "o" : "os"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-verde-light border border-verde-border rounded-lg p-4 text-sm text-verde-dark">
          <div className="flex items-start justify-between gap-3 mb-2">
            <strong>Formato do CSV</strong>
            <button
              type="button"
              onClick={baixarTemplate}
              className="text-xs text-gold hover:text-verde-dark inline-flex items-center gap-1"
            >
              <Download size={12} /> baixar template
            </button>
          </div>
          <p className="text-xs leading-relaxed text-verde-dark/80">
            <strong>Cliente:</strong> <code>cliente_cnpj</code> (preferido) ou{" "}
            <code>cliente_nome</code>. <strong>Conta:</strong> código (ex.{" "}
            <code>4.01.01</code>) ou nome exato do plano. <strong>Tipo:</strong>{" "}
            opcional — se vazio, deduz pelo tipo da conta. <strong>Data:</strong>{" "}
            <code>dd/mm/yyyy</code> ou <code>yyyy-mm-dd</code>.{" "}
            <strong>Valor:</strong> aceita formato BR (<code>1.234,56</code>).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={escolherArquivo}
            className="flex items-center gap-2"
          >
            <FileUp size={14} />
            {arquivoNome ?? "Escolher arquivo CSV"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onArquivo}
            className="hidden"
          />
          <span className="text-xs text-gray-500 self-center">
            ou cole o conteúdo abaixo
          </span>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder="cliente_cnpj;data;tipo;conta;valor;descricao&#10;00.000.000/0000-00;15/05/2026;DESPESA;4.01.01;2500,00;Aluguel maio"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-xs font-mono"
        />

        {linhas.length > 0 && (
          <div className="border border-card-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-card-border text-xs">
              <strong>{linhas.length}</strong> linhas •{" "}
              <span className="text-verde-dark">{validas.length} válidas</span>
              {invalidas > 0 && (
                <>
                  {" "}
                  • <span className="text-red-alert">{invalidas} com erro</span>
                </>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-12">#</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Conta</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-left">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {linhas.slice(0, 50).map((l) => (
                    <tr
                      key={l.numero}
                      className={l.erros.length > 0 ? "bg-red-50" : "hover:bg-gray-50"}
                    >
                      <td className="px-3 py-2 text-gray-400">{l.numero}</td>
                      <td className="px-3 py-2 text-gray-700 truncate max-w-[160px]">
                        {l.dados.cliente_cnpj || l.dados.cliente_nome || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {l.data_lancamento || l.dados.data_lancamento || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {l.tipo && (
                          <span
                            className={
                              l.tipo === "RECEITA"
                                ? "text-verde-dark font-medium"
                                : "text-red-alert font-medium"
                            }
                          >
                            {l.tipo === "RECEITA" ? "+" : "−"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-[11px]">
                        {l.dados.conta || "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {l.valor
                          ? l.valor.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {l.erros.length > 0 && (
                          <div className="text-red-alert flex items-start gap-1">
                            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                            {l.erros.join("; ")}
                          </div>
                        )}
                        {l.alertas.length > 0 && (
                          <div className="text-amber-700">{l.alertas.join("; ")}</div>
                        )}
                        {l.erros.length === 0 && l.alertas.length === 0 && (
                          <CheckCircle2 size={12} className="text-verde-primary" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {linhas.length > 50 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2 text-center text-gray-400 text-[11px]">
                        +{linhas.length - 50} linhas (preview limitado a 50)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
