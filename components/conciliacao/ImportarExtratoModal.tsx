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
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { downloadCsv, normalizeHeader, parseCsv, toCsv } from "@/lib/csv";
import { isOfx, parseOfx } from "@/lib/ofx";
import { gerarId } from "@/lib/utils";
import type { Cliente } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  cliente: Cliente | null;
};

const COL_ALIAS: Record<string, string> = {
  data: "data_movimento",
  data_movimento: "data_movimento",
  date: "data_movimento",
  descricao: "descricao",
  historico: "descricao",
  description: "descricao",
  valor: "valor",
  amount: "valor",
  credito: "credito",
  debito: "debito",
  banco: "banco",
  conta: "conta_bancaria",
  conta_bancaria: "conta_bancaria",
};

type Linha = {
  numero: number;
  dados: Record<string, string>;
  data?: string;
  valor?: number;
  erros: string[];
};

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

function parseValorAssinado(s: string): number | null {
  const t = s
    .replace(/\s+/g, "")
    .replace(/R\$/i, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

function parseLinha(
  headers: string[],
  valores: string[],
  num: number
): Linha {
  const dados: Record<string, string> = {};
  headers.forEach((h, i) => {
    const col = COL_ALIAS[normalizeHeader(h)];
    if (col) dados[col] = (valores[i] ?? "").trim();
  });

  const l: Linha = { numero: num, dados, erros: [] };

  if (dados.data_movimento) {
    const d = parseDataBr(dados.data_movimento);
    if (!d) l.erros.push(`data '${dados.data_movimento}' inválida`);
    else l.data = d;
  } else l.erros.push("data vazia");

  if (!dados.descricao) l.erros.push("descrição vazia");

  // Valor: tenta coluna 'valor' única (positivo/negativo). Senão tenta
  // credito/debito separados (formato comum em alguns extratos).
  if (dados.valor) {
    const v = parseValorAssinado(dados.valor);
    if (v == null) l.erros.push(`valor '${dados.valor}' inválido`);
    else l.valor = v;
  } else if (dados.credito || dados.debito) {
    const c = dados.credito ? parseValorAssinado(dados.credito) : null;
    const d = dados.debito ? parseValorAssinado(dados.debito) : null;
    if (c && c > 0) l.valor = c;
    else if (d && d > 0) l.valor = -Math.abs(d);
    else l.erros.push("crédito/débito sem valor");
  } else {
    l.erros.push("valor vazio");
  }

  if (l.valor === 0) l.erros.push("valor zero");

  return l;
}

export function ImportarExtratoModal({ open, onClose, cliente }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [banco, setBanco] = useState("");
  const [conta, setConta] = useState("");

  useEffect(() => {
    if (!open) {
      setTexto("");
      setArquivoNome(null);
      setBanco("");
      setConta("");
    }
  }, [open]);

  // Auto-preenche banco/conta se vier do OFX (e ainda não foi mexido)
  useEffect(() => {
    if (!texto || !isOfx(texto)) return;
    const ext = parseOfx(texto);
    if (ext.banco && !banco) setBanco(`Banco ${ext.banco}`);
    if (ext.conta && !conta)
      setConta(
        ext.agencia ? `Ag ${ext.agencia} / ${ext.conta}` : ext.conta
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  function escolherArquivo() {
    inputRef.current?.click();
  }
  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 5 MB)");
      return;
    }
    const conteudo = await f.text();
    setTexto(conteudo);
    setArquivoNome(f.name);
    e.target.value = "";
  }

  // Detecta formato e converte ambos pro mesmo formato Linha[]
  const { linhas, formato, ofxMeta } = useMemo<{
    linhas: Linha[];
    formato: "ofx" | "csv" | "vazio";
    ofxMeta?: { banco?: string; agencia?: string; conta?: string };
  }>(() => {
    if (!texto.trim()) return { linhas: [], formato: "vazio" };

    if (isOfx(texto)) {
      const ext = parseOfx(texto);
      const linhas: Linha[] = ext.transacoes.map((t, i) => ({
        numero: i + 1,
        dados: {
          data_movimento: t.data,
          descricao: t.descricao + (t.ref ? ` (ref: ${t.ref})` : ""),
          valor: String(t.valor),
        },
        data: t.data,
        valor: t.valor,
        erros: [],
      }));
      return {
        linhas,
        formato: "ofx",
        ofxMeta: {
          banco: ext.banco,
          agencia: ext.agencia,
          conta: ext.conta,
        },
      };
    }

    const rows = parseCsv(texto);
    if (rows.length < 1) return { linhas: [], formato: "csv" };
    const headers = rows[0];
    return {
      linhas: rows
        .slice(1)
        .map((vals, i) => parseLinha(headers, vals, i + 2)),
      formato: "csv",
    };
  }, [texto]);

  const validas = linhas.filter((l) => l.erros.length === 0);
  const invalidas = linhas.length - validas.length;

  const totalCreditos = validas
    .filter((l) => (l.valor ?? 0) > 0)
    .reduce((s, l) => s + Number(l.valor), 0);
  const totalDebitos = validas
    .filter((l) => (l.valor ?? 0) < 0)
    .reduce((s, l) => s + Math.abs(Number(l.valor)), 0);

  function baixarTemplate() {
    const csv = toCsv(
      [
        {
          data: "01/05/2026",
          descricao: "Depósito Banco do Brasil",
          valor: "1500,00",
          banco: "BB",
          conta: "12345-6",
        },
        {
          data: "02/05/2026",
          descricao: "Pagto Energia CEMIG",
          valor: "-189,50",
          banco: "BB",
          conta: "12345-6",
        },
      ],
      ["data", "descricao", "valor", "banco", "conta"].map((c) => ({
        header: c,
        value: (row: Record<string, string>) => row[c] ?? "",
      }))
    );
    downloadCsv("template-extrato.csv", csv);
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error("Cliente não selecionado");
      if (validas.length === 0) throw new Error("Nada válido pra importar");

      const supabase = createSupabaseBrowserClient();

      const payload = validas.map((l) => ({
        id_movimento: gerarId("MOV"),
        id_cliente: cliente.id_cliente,
        data_movimento: l.data,
        descricao: l.dados.descricao,
        valor: l.valor,
        banco: l.dados.banco || banco.trim() || null,
        conta_bancaria: l.dados.conta_bancaria || conta.trim() || null,
      }));

      const { error } = await supabase
        .from("banco_movimentos")
        .insert(payload as never);
      if (error) throw error;
      return { criados: payload.length, invalidos: invalidas };
    },
    onSuccess: ({ criados, invalidos }) => {
      qc.invalidateQueries({ queryKey: ["banco-movimentos"] });
      let msg = `${criados} movimento${criados === 1 ? "" : "s"} importado${criados === 1 ? "" : "s"}`;
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
      title={`Importar extrato${cliente ? ` — ${cliente.razao_social}` : ""}`}
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
              : `Importar ${validas.length} movimento${validas.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-verde-light border border-verde-border rounded-lg p-4 text-sm text-verde-dark">
          <div className="flex items-start justify-between gap-3 mb-2">
            <strong>Formatos aceitos</strong>
            <button
              type="button"
              onClick={baixarTemplate}
              className="text-xs text-gold hover:text-verde-dark inline-flex items-center gap-1"
            >
              <Download size={12} /> baixar template CSV
            </button>
          </div>
          <p className="text-xs leading-relaxed text-verde-dark/80">
            <strong>OFX</strong> (recomendado): exportação direta do internet
            banking — detecta banco/agência/conta e transações automaticamente.{" "}
            <strong>CSV</strong>: colunas <code>data</code>, <code>descricao</code>,{" "}
            <code>valor</code> (negativo=débito, positivo=crédito) ou{" "}
            <code>credito</code>+<code>debito</code> separados. Datas{" "}
            <code>dd/mm/yyyy</code>. Valores formato BR (<code>1.234,56</code>).
          </p>
        </div>

        {formato !== "vazio" && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className={
                formato === "ofx"
                  ? "px-2 py-1 rounded-full bg-verde-primary text-white font-semibold"
                  : "px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold"
              }
            >
              {formato === "ofx" ? "OFX detectado" : "CSV detectado"}
            </span>
            {formato === "ofx" && ofxMeta && (
              <span className="text-gray-500">
                {ofxMeta.banco && `Banco ${ofxMeta.banco}`}
                {ofxMeta.agencia && ` • Ag ${ofxMeta.agencia}`}
                {ofxMeta.conta && ` • Conta ${ofxMeta.conta}`}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Banco (default se CSV não tiver)">
            <input
              className={inputClass}
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
              placeholder="BB / Itaú / Caixa..."
            />
          </Field>
          <Field label="Conta bancária (default se CSV não tiver)">
            <input
              className={inputClass}
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              placeholder="12345-6"
            />
          </Field>
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
            accept=".csv,.ofx,text/csv,application/x-ofx"
            onChange={onArquivo}
            className="hidden"
          />
          <span className="text-xs text-gray-500 self-center">
            ou cole abaixo
          </span>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          placeholder="data;descricao;valor&#10;01/05/2026;Depósito BB;1500,00&#10;02/05/2026;CEMIG;-189,50"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-xs font-mono"
        />

        {linhas.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-verde-light rounded-md p-2 text-center">
                <div className="text-[10px] uppercase text-verde-dark">
                  Créditos
                </div>
                <div className="font-bold text-verde-dark">
                  R$ {totalCreditos.toFixed(2).replace(".", ",")}
                </div>
              </div>
              <div className="bg-red-100 rounded-md p-2 text-center">
                <div className="text-[10px] uppercase text-red-alert">
                  Débitos
                </div>
                <div className="font-bold text-red-alert">
                  R$ {totalDebitos.toFixed(2).replace(".", ",")}
                </div>
              </div>
              <div className="bg-gray-100 rounded-md p-2 text-center">
                <div className="text-[10px] uppercase text-gray-600">
                  Linhas
                </div>
                <div className="font-bold text-gray-800">
                  {validas.length} / {linhas.length}
                </div>
              </div>
            </div>

            <div className="border border-card-border rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left w-12">#</th>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Descrição</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-left w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {linhas.slice(0, 100).map((l) => (
                      <tr
                        key={l.numero}
                        className={
                          l.erros.length > 0 ? "bg-red-50" : "hover:bg-gray-50"
                        }
                      >
                        <td className="px-3 py-2 text-gray-400">{l.numero}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {l.data || l.dados.data_movimento || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-700 truncate max-w-[280px]">
                          {l.dados.descricao || "—"}
                        </td>
                        <td
                          className={
                            (l.valor ?? 0) >= 0
                              ? "px-3 py-2 text-right text-verde-dark font-medium"
                              : "px-3 py-2 text-right text-red-alert font-medium"
                          }
                        >
                          {l.valor != null
                            ? l.valor.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {l.erros.length > 0 ? (
                            <AlertTriangle
                              size={12}
                              className="text-red-alert"
                            />
                          ) : (
                            <CheckCircle2
                              size={12}
                              className="text-verde-primary"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                    {linhas.length > 100 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-2 text-center text-gray-400 text-[11px]"
                        >
                          +{linhas.length - 100} linhas (preview 100)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
