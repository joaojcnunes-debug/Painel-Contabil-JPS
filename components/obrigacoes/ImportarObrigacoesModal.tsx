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
import type {
  Cliente,
  ObrigacaoCatalogo,
  StatusObrigacao,
} from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  catalogo: ObrigacaoCatalogo[];
};

const STATUS_VALIDOS: StatusObrigacao[] = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "ENTREGUE",
  "ATRASADA",
  "DISPENSADA",
];

const STATUS_ALIAS: Record<string, StatusObrigacao> = {
  pendente: "PENDENTE",
  em_andamento: "EM_ANDAMENTO",
  andamento: "EM_ANDAMENTO",
  entregue: "ENTREGUE",
  entregue_no_prazo: "ENTREGUE",
  atrasada: "ATRASADA",
  atraso: "ATRASADA",
  dispensada: "DISPENSADA",
  dispensa: "DISPENSADA",
};

const COL_ALIAS: Record<string, string> = {
  cnpj: "cliente_cnpj",
  cliente_cnpj: "cliente_cnpj",
  cliente: "cliente_nome",
  cliente_nome: "cliente_nome",
  razao_social: "cliente_nome",
  sigla: "sigla",
  obrigacao: "sigla",
  competencia: "competencia",
  comp: "competencia",
  vencimento: "vencimento",
  data_vencimento: "vencimento",
  entrega: "entrega",
  data_entrega: "entrega",
  status: "status",
  responsavel: "responsavel",
  observacoes: "observacoes",
  obs: "observacoes",
};

type Linha = {
  numero: number;
  dados: Record<string, string>;
  // Resolvidos no parse
  id_cliente?: string;
  id_obrigacao_catalogo?: string;
  competencia?: string;
  data_vencimento?: string;
  data_entrega?: string | null;
  status?: StatusObrigacao;
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

function parseCompetencia(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  // MM/YYYY
  const m = t.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  // YYYYMM
  if (/^\d{6}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4)}`;
  return null;
}

function parseLinha(
  headers: string[],
  valores: string[],
  num: number,
  clientesMap: Map<string, string>,
  catalogoMap: Map<string, string>
): Linha {
  const dados: Record<string, string> = {};
  headers.forEach((h, i) => {
    const col = COL_ALIAS[normalizeHeader(h)];
    if (col) dados[col] = (valores[i] ?? "").trim();
  });

  const linha: Linha = { numero: num, dados, erros: [], alertas: [] };

  // Cliente — tenta CNPJ primeiro, depois nome
  let idCliente: string | undefined;
  if (dados.cliente_cnpj) {
    const cnpj = onlyDigits(dados.cliente_cnpj);
    idCliente = clientesMap.get("cnpj:" + cnpj);
    if (!idCliente) linha.erros.push(`CNPJ ${cnpj} não encontrado`);
  }
  if (!idCliente && dados.cliente_nome) {
    const norm = normalizeHeader(dados.cliente_nome);
    idCliente = clientesMap.get("nome:" + norm);
    if (!idCliente)
      linha.erros.push(`Cliente '${dados.cliente_nome}' não encontrado`);
  }
  if (!idCliente && !dados.cliente_cnpj && !dados.cliente_nome) {
    linha.erros.push("informe cliente_cnpj ou cliente_nome");
  }
  linha.id_cliente = idCliente;

  // Catálogo — pela sigla
  if (dados.sigla) {
    const id = catalogoMap.get(normalizeHeader(dados.sigla));
    if (!id) linha.erros.push(`Sigla '${dados.sigla}' não está no catálogo`);
    else linha.id_obrigacao_catalogo = id;
  } else {
    linha.erros.push("informe a sigla da obrigação");
  }

  // Competência
  if (dados.competencia) {
    const c = parseCompetencia(dados.competencia);
    if (!c) linha.erros.push(`competência '${dados.competencia}' inválida (use YYYY-MM ou MM/YYYY)`);
    else linha.competencia = c;
  } else {
    linha.erros.push("competência vazia");
  }

  // Vencimento
  if (dados.vencimento) {
    const d = parseDataBr(dados.vencimento);
    if (!d) linha.erros.push(`vencimento '${dados.vencimento}' inválido`);
    else linha.data_vencimento = d;
  } else {
    linha.erros.push("vencimento vazio");
  }

  // Entrega (opcional)
  if (dados.entrega) {
    const d = parseDataBr(dados.entrega);
    if (!d) {
      linha.alertas.push(`entrega '${dados.entrega}' inválida — ignorada`);
    } else {
      linha.data_entrega = d;
    }
  }

  // Status
  if (dados.status) {
    const s = STATUS_ALIAS[normalizeHeader(dados.status)];
    if (s) linha.status = s;
    else if (
      STATUS_VALIDOS.includes(dados.status.toUpperCase() as StatusObrigacao)
    ) {
      linha.status = dados.status.toUpperCase() as StatusObrigacao;
    } else {
      linha.alertas.push(`status '${dados.status}' inválido — usará PENDENTE`);
      linha.status = "PENDENTE";
    }
  } else {
    linha.status = linha.data_entrega ? "ENTREGUE" : "PENDENTE";
  }

  return linha;
}

export function ImportarObrigacoesModal({
  open,
  onClose,
  clientes,
  catalogo,
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

  // Mapas pra resolução rápida
  const clientesMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes) {
      if (c.cnpj) m.set("cnpj:" + onlyDigits(c.cnpj), c.id_cliente);
      if (c.cpf) m.set("cnpj:" + onlyDigits(c.cpf), c.id_cliente); // fallback
      m.set("nome:" + normalizeHeader(c.razao_social), c.id_cliente);
      if (c.nome_fantasia) {
        m.set("nome:" + normalizeHeader(c.nome_fantasia), c.id_cliente);
      }
    }
    return m;
  }, [clientes]);

  const catalogoMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of catalogo) {
      m.set(normalizeHeader(it.sigla), it.id_obrigacao_catalogo);
    }
    return m;
  }, [catalogo]);

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
      .map((vals, i) => parseLinha(headers, vals, i + 2, clientesMap, catalogoMap));
  }, [texto, clientesMap, catalogoMap]);

  const validas = linhas.filter((l) => l.erros.length === 0);
  const invalidas = linhas.length - validas.length;

  function baixarTemplate() {
    const csv = toCsv(
      [
        {
          cliente_cnpj: "00.000.000/0000-00",
          cliente_nome: "Exemplo Ltda",
          sigla: "DAS",
          competencia: "2026-05",
          vencimento: "20/05/2026",
          entrega: "",
          status: "PENDENTE",
          responsavel: "Juliane",
          observacoes: "",
        },
      ],
      [
        "cliente_cnpj",
        "cliente_nome",
        "sigla",
        "competencia",
        "vencimento",
        "entrega",
        "status",
        "responsavel",
        "observacoes",
      ].map((c) => ({
        header: c,
        value: (row: Record<string, string>) => row[c] ?? "",
      }))
    );
    downloadCsv("template-obrigacoes.csv", csv);
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (validas.length === 0) throw new Error("Nada válido pra importar");
      const supabase = createSupabaseBrowserClient();

      // Detecta duplicidade (cliente + catálogo + competência já existente)
      const chaves = validas.map(
        (l) => `${l.id_cliente}::${l.id_obrigacao_catalogo}::${l.competencia}`
      );

      const competenciasUnicas = Array.from(
        new Set(validas.map((l) => l.competencia!).filter(Boolean))
      );

      const { data: existentes } = await supabase
        .from("obrigacoes")
        .select("id_cliente, id_obrigacao_catalogo, competencia")
        .in("competencia", competenciasUnicas);

      const jaTem = new Set(
        ((existentes ?? []) as Array<{
          id_cliente: string;
          id_obrigacao_catalogo: string;
          competencia: string;
        }>).map(
          (e) => `${e.id_cliente}::${e.id_obrigacao_catalogo}::${e.competencia}`
        )
      );

      const payload: Array<Record<string, unknown>> = [];
      let pulados = 0;
      for (const l of validas) {
        const chave = `${l.id_cliente}::${l.id_obrigacao_catalogo}::${l.competencia}`;
        if (jaTem.has(chave)) {
          pulados++;
          continue;
        }
        payload.push({
          id_obrigacao: gerarId("OBR"),
          id_cliente: l.id_cliente,
          id_obrigacao_catalogo: l.id_obrigacao_catalogo,
          competencia: l.competencia,
          data_vencimento: l.data_vencimento,
          data_entrega: l.data_entrega ?? null,
          status: l.status ?? "PENDENTE",
          responsavel: l.dados.responsavel || null,
          observacoes: l.dados.observacoes || null,
        });
      }

      if (payload.length === 0) {
        return { criadas: 0, puladas: pulados, invalidas };
      }

      const { error } = await supabase
        .from("obrigacoes")
        .insert(payload as never);
      if (error) throw error;

      return { criadas: payload.length, puladas: pulados, invalidas };
    },
    onSuccess: ({ criadas, puladas, invalidas }) => {
      qc.invalidateQueries({ queryKey: ["obrigacoes"] });
      let msg = `${criadas} obrigaç${criadas === 1 ? "ão importada" : "ões importadas"}`;
      if (puladas > 0)
        msg += ` • ${puladas} já existi${puladas === 1 ? "a" : "am"}`;
      if (invalidas > 0)
        msg += ` • ${invalidas} com erro`;
      toast.success(msg);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Lista de siglas válidas pra ajudar o usuário
  const siglasValidas = catalogo.map((c) => c.sigla).join(", ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar obrigações (CSV)"
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
              : `Importar ${validas.length} obrigaç${validas.length === 1 ? "ão" : "ões"}`}
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
            <strong>Cliente:</strong> use <code>cliente_cnpj</code> (preferido) ou{" "}
            <code>cliente_nome</code> (razão social/fantasia exato).{" "}
            <strong>Sigla:</strong> uma das do catálogo —{" "}
            <span className="font-mono text-[11px]">{siglasValidas}</span>.{" "}
            <strong>Competência:</strong> <code>YYYY-MM</code> ou{" "}
            <code>MM/YYYY</code>. <strong>Datas:</strong> <code>dd/mm/yyyy</code>{" "}
            ou <code>yyyy-mm-dd</code>.
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
          placeholder="cliente_cnpj;sigla;competencia;vencimento&#10;00.000.000/0000-00;DAS;2026-05;20/05/2026"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-xs font-mono"
        />

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
                    • <span className="text-red-alert">{invalidas} com erro</span>
                  </>
                )}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-12">#</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Sigla</th>
                    <th className="px-3 py-2 text-left">Comp.</th>
                    <th className="px-3 py-2 text-left">Vencimento</th>
                    <th className="px-3 py-2 text-left">Status</th>
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
                      <td className="px-3 py-2 text-gray-700 truncate max-w-[180px]">
                        {l.dados.cliente_cnpj || l.dados.cliente_nome || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-verde-dark">
                        {l.dados.sigla || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.competencia || l.dados.competencia || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.data_vencimento || l.dados.vencimento || "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {l.status || "—"}
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
                        colSpan={7}
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
