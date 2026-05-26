"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { downloadCsv, normalizeHeader, parseCsv, toCsv } from "@/lib/csv";
import { gerarId } from "@/lib/utils";
import type { RegimeTributario } from "@/lib/supabase/types";

type Props = { open: boolean; onClose: () => void };

const REGIMES_VALIDOS: RegimeTributario[] = [
  "SIMPLES_NACIONAL",
  "LUCRO_PRESUMIDO",
  "LUCRO_REAL",
  "MEI",
  "DOMESTICO",
  "PRODUTOR_RURAL",
];

const REGIME_ALIAS: Record<string, RegimeTributario> = {
  simples: "SIMPLES_NACIONAL",
  simples_nacional: "SIMPLES_NACIONAL",
  presumido: "LUCRO_PRESUMIDO",
  lucro_presumido: "LUCRO_PRESUMIDO",
  real: "LUCRO_REAL",
  lucro_real: "LUCRO_REAL",
  mei: "MEI",
  domestico: "DOMESTICO",
  produtor_rural: "PRODUTOR_RURAL",
};

// Aliases pra cabeçalhos (chave normalizada → coluna interna)
const COL_ALIAS: Record<string, string> = {
  razao_social: "razao_social",
  razao: "razao_social",
  nome: "razao_social",
  nome_completo: "razao_social",
  nome_fantasia: "nome_fantasia",
  fantasia: "nome_fantasia",
  cnpj: "cnpj",
  cpf: "cpf",
  email: "email",
  e_mail: "email",
  regime: "regime",
  regime_tributario: "regime",
  atividade: "atividade_principal",
  atividade_principal: "atividade_principal",
  honorario: "honorario_mensal",
  honorario_mensal: "honorario_mensal",
  valor: "honorario_mensal",
  dia: "dia_vencimento",
  dia_vencimento: "dia_vencimento",
  dia_venc: "dia_vencimento",
  cep: "cep",
  logradouro: "logradouro",
  endereco: "logradouro",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  municipio: "municipio",
  cidade: "municipio",
  uf: "estado",
  estado: "estado",
  inicio: "inicio_contrato",
  inicio_contrato: "inicio_contrato",
  responsavel: "responsavel_nome",
  responsavel_nome: "responsavel_nome",
  responsavel_cpf: "responsavel_cpf",
  responsavel_email: "responsavel_email",
  responsavel_telefone: "responsavel_telefone",
  telefone_responsavel: "responsavel_telefone",
};

type Linha = {
  numero: number;
  dados: Record<string, string>;
  erros: string[];
  alertas: string[];
};

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function parseValor(s: string): number | null {
  const t = s.replace(/\./g, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) && n >= 0 ? n : null;
}

function parseRegime(s: string): RegimeTributario | null {
  const t = normalizeHeader(s);
  if (!t) return null;
  if (REGIMES_VALIDOS.includes(t.toUpperCase() as RegimeTributario)) {
    return t.toUpperCase() as RegimeTributario;
  }
  return REGIME_ALIAS[t] ?? null;
}

function parseDataBr(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // Aceita dd/mm/yyyy ou yyyy-mm-dd
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

function parseLinha(headers: string[], valores: string[], num: number): Linha {
  const dados: Record<string, string> = {};
  headers.forEach((h, i) => {
    const col = COL_ALIAS[normalizeHeader(h)];
    if (col) dados[col] = (valores[i] ?? "").trim();
  });

  const erros: string[] = [];
  const alertas: string[] = [];

  if (!dados.razao_social) erros.push("razão social vazia");

  if (dados.cnpj) {
    const d = onlyDigits(dados.cnpj);
    if (d.length !== 14) erros.push(`CNPJ inválido (${d.length} dígitos)`);
    else dados.cnpj = d;
  }
  if (dados.cpf) {
    const d = onlyDigits(dados.cpf);
    if (d.length !== 11) erros.push(`CPF inválido (${d.length} dígitos)`);
    else dados.cpf = d;
  }

  if (!dados.cnpj && !dados.cpf) alertas.push("sem CNPJ nem CPF");

  if (dados.regime) {
    const r = parseRegime(dados.regime);
    if (!r) {
      alertas.push(`regime '${dados.regime}' não reconhecido — usará SIMPLES_NACIONAL`);
      dados.regime = "SIMPLES_NACIONAL";
    } else {
      dados.regime = r;
    }
  } else {
    dados.regime = "SIMPLES_NACIONAL";
  }

  if (dados.honorario_mensal) {
    const v = parseValor(dados.honorario_mensal);
    if (v == null) {
      alertas.push(`honorário '${dados.honorario_mensal}' inválido — ignorado`);
      delete dados.honorario_mensal;
    } else {
      dados.honorario_mensal = String(v);
    }
  }

  if (dados.dia_vencimento) {
    const n = Number(dados.dia_vencimento);
    if (!isFinite(n) || n < 1 || n > 31) {
      alertas.push(`dia '${dados.dia_vencimento}' fora de 1-31 — ignorado`);
      delete dados.dia_vencimento;
    }
  }

  if (dados.cep) dados.cep = onlyDigits(dados.cep);
  if (dados.estado) dados.estado = dados.estado.toUpperCase().slice(0, 2);
  if (dados.responsavel_cpf) {
    const d = onlyDigits(dados.responsavel_cpf);
    if (d.length === 11) dados.responsavel_cpf = d;
    else {
      alertas.push(`CPF do responsável inválido — ignorado`);
      delete dados.responsavel_cpf;
    }
  }

  if (dados.inicio_contrato) {
    const iso = parseDataBr(dados.inicio_contrato);
    if (iso) dados.inicio_contrato = iso;
    else {
      alertas.push(`data inicio '${dados.inicio_contrato}' inválida — ignorada`);
      delete dados.inicio_contrato;
    }
  }

  return { numero: num, dados, erros, alertas };
}

const TEMPLATE_COLUMNS = [
  "razao_social",
  "nome_fantasia",
  "cnpj",
  "cpf",
  "email",
  "regime",
  "atividade",
  "honorario",
  "dia_vencimento",
  "inicio_contrato",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "municipio",
  "uf",
  "responsavel",
  "responsavel_cpf",
  "responsavel_email",
  "responsavel_telefone",
];

export function ImportarClientesModal({ open, onClose }: Props) {
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
    return rows.slice(1).map((vals, i) => parseLinha(headers, vals, i + 2));
  }, [texto]);

  const validas = linhas.filter((l) => l.erros.length === 0);
  const invalidas = linhas.length - validas.length;

  function baixarTemplate() {
    const csv = toCsv(
      [
        {
          razao_social: "Exemplo Ltda",
          nome_fantasia: "Exemplo",
          cnpj: "00.000.000/0000-00",
          cpf: "",
          email: "contato@exemplo.com.br",
          regime: "SIMPLES_NACIONAL",
          atividade: "Comércio varejista",
          honorario: "1500,00",
          dia_vencimento: "10",
          inicio_contrato: "01/01/2026",
          cep: "01310-100",
          logradouro: "Av. Paulista",
          numero: "1000",
          complemento: "Sala 1",
          bairro: "Bela Vista",
          municipio: "São Paulo",
          uf: "SP",
          responsavel: "João da Silva",
          responsavel_cpf: "000.000.000-00",
          responsavel_email: "joao@exemplo.com.br",
          responsavel_telefone: "(11) 99999-9999",
        },
      ],
      TEMPLATE_COLUMNS.map((c) => ({
        header: c,
        value: (row: Record<string, string>) => row[c] ?? "",
      }))
    );
    downloadCsv("template-clientes.csv", csv);
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (validas.length === 0) throw new Error("Nada válido pra importar");
      const supabase = createSupabaseBrowserClient();

      // Detecta duplicidade de CNPJ/CPF no banco antes de inserir
      const cnpjs = validas
        .map((l) => l.dados.cnpj)
        .filter((c): c is string => !!c);
      const cpfs = validas
        .map((l) => l.dados.cpf)
        .filter((c): c is string => !!c);

      const jaCadastrados = new Set<string>();
      if (cnpjs.length > 0) {
        const { data } = await supabase
          .from("clientes")
          .select("cnpj")
          .in("cnpj", cnpjs);
        for (const r of (data ?? []) as Array<{ cnpj: string | null }>) {
          if (r.cnpj) jaCadastrados.add("cnpj:" + r.cnpj);
        }
      }
      if (cpfs.length > 0) {
        const { data } = await supabase
          .from("clientes")
          .select("cpf")
          .in("cpf", cpfs);
        for (const r of (data ?? []) as Array<{ cpf: string | null }>) {
          if (r.cpf) jaCadastrados.add("cpf:" + r.cpf);
        }
      }

      const payload: Array<Record<string, unknown>> = [];
      let pulados = 0;
      for (const l of validas) {
        const d = l.dados;
        if (d.cnpj && jaCadastrados.has("cnpj:" + d.cnpj)) {
          pulados++;
          continue;
        }
        if (d.cpf && jaCadastrados.has("cpf:" + d.cpf)) {
          pulados++;
          continue;
        }
        const tipo = d.cnpj ? "PJ" : d.cpf ? "PF" : "PJ";
        payload.push({
          id_cliente: gerarId("CLI"),
          tipo_cadastro: tipo,
          razao_social: d.razao_social,
          nome_fantasia: d.nome_fantasia || null,
          cnpj: d.cnpj || null,
          cpf: d.cpf || null,
          email: d.email?.toLowerCase() || null,
          regime: d.regime || "SIMPLES_NACIONAL",
          atividade_principal: d.atividade_principal || null,
          honorario_mensal: d.honorario_mensal ? Number(d.honorario_mensal) : null,
          dia_vencimento: d.dia_vencimento ? Number(d.dia_vencimento) : null,
          inicio_contrato: d.inicio_contrato || null,
          status: "Ativo",
          cep: d.cep || null,
          logradouro: d.logradouro || null,
          numero: d.numero || null,
          complemento: d.complemento || null,
          bairro: d.bairro || null,
          municipio: d.municipio || null,
          estado: d.estado || null,
          responsavel_nome: d.responsavel_nome || null,
          responsavel_cpf: d.responsavel_cpf || null,
          responsavel_email: d.responsavel_email?.toLowerCase() || null,
          responsavel_telefone: d.responsavel_telefone || null,
        });
      }

      if (payload.length === 0) {
        return { criados: 0, pulados, invalidos: invalidas };
      }

      const { error } = await supabase
        .from("clientes")
        .insert(payload as never);
      if (error) throw error;

      return { criados: payload.length, pulados, invalidos: invalidas };
    },
    onSuccess: ({ criados, pulados, invalidos }) => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      let msg = `${criados} cliente${criados === 1 ? "" : "s"} importado${criados === 1 ? "" : "s"}`;
      if (pulados > 0)
        msg += ` • ${pulados} já existia${pulados === 1 ? "" : "m"}`;
      if (invalidos > 0)
        msg += ` • ${invalidos} com erro`;
      toast.success(msg);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar clientes (CSV)"
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
              : `Importar ${validas.length} cliente${validas.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Como usar */}
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
            Primeira linha = nomes das colunas. Separador <code>;</code> ou{" "}
            <code>,</code> (detecta automático). Aceita variações como{" "}
            <code>razao_social</code>, <code>razão social</code>,{" "}
            <code>nome</code>. Campos opcionais podem ficar em branco. Veja o
            template pra todos os campos suportados.
          </p>
        </div>

        {/* Upload + textarea */}
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
          placeholder="razao_social;cnpj;regime;honorario&#10;Exemplo Ltda;00.000.000/0000-00;SIMPLES_NACIONAL;1500,00"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-xs font-mono"
        />

        {/* Preview */}
        {linhas.length > 0 && (
          <div className="border border-card-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-card-border flex items-center justify-between text-xs">
              <span className="text-gray-600">
                <strong>{linhas.length}</strong> linhas •{" "}
                <span className="text-verde-dark">
                  {validas.length} válidas
                </span>
                {invalidas > 0 && (
                  <>
                    {" "}
                    •{" "}
                    <span className="text-red-alert">
                      {invalidas} com erro
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-12">#</th>
                    <th className="px-3 py-2 text-left">Razão social</th>
                    <th className="px-3 py-2 text-left">CNPJ/CPF</th>
                    <th className="px-3 py-2 text-left">Regime</th>
                    <th className="px-3 py-2 text-left">Honorário</th>
                    <th className="px-3 py-2 text-left">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {linhas.slice(0, 50).map((l) => (
                    <tr
                      key={l.numero}
                      className={
                        l.erros.length > 0 ? "bg-red-50" : "hover:bg-gray-50"
                      }
                    >
                      <td className="px-3 py-2 text-gray-400">{l.numero}</td>
                      <td className="px-3 py-2 text-gray-800">
                        {l.dados.razao_social || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-[11px]">
                        {l.dados.cnpj || l.dados.cpf || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.dados.regime || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.dados.honorario_mensal
                          ? Number(l.dados.honorario_mensal).toLocaleString(
                              "pt-BR",
                              {
                                style: "currency",
                                currency: "BRL",
                              }
                            )
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        {l.erros.length > 0 && (
                          <div className="text-red-alert flex items-start gap-1">
                            <AlertTriangle
                              size={11}
                              className="flex-shrink-0 mt-0.5"
                            />
                            {l.erros.join("; ")}
                          </div>
                        )}
                        {l.alertas.length > 0 && (
                          <div className="text-amber-700">
                            {l.alertas.join("; ")}
                          </div>
                        )}
                        {l.erros.length === 0 && l.alertas.length === 0 && (
                          <CheckCircle2
                            size={12}
                            className="text-verde-primary"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                  {linhas.length > 50 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-2 text-center text-gray-400 text-[11px]"
                      >
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
