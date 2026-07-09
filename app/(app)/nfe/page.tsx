"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Eye,
  FileX,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useClientes } from "@/lib/hooks/useClientes";
import { useNotasFiscais } from "@/lib/hooks/useNotasFiscais";
import { usePlanoContas } from "@/lib/hooks/useLancamentos";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  detectarTipo,
  parseNfe,
  type NfeParsed,
} from "@/lib/nfe-parser";
import { formatBRL, formatCNPJ, formatDate, gerarId } from "@/lib/utils";

type Aba = "importar" | "lista";

type ArquivoParseado = {
  nome: string;
  status: "ok" | "erro" | "duplicada";
  nfe?: NfeParsed;
  tipo?: "ENTRADA" | "SAIDA";
  erro?: string;
  criarLancamento: boolean;
  idConta: string;
};

export default function NFePage() {
  const user = useUserStore((s) => s.user);
  const isEquipe =
    user?.perfil === "Admin" ||
    user?.perfil === "Contador" ||
    user?.perfil === "Assistente";

  const { data: clientes = [] } = useClientes();
  const { data: contas = [] } = usePlanoContas(true);
  const qc = useQueryClient();

  const [aba, setAba] = useState<Aba>("importar");
  const [idCliente, setIdCliente] = useState("");
  const [arquivos, setArquivos] = useState<ArquivoParseado[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtros lista
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const { data: notas = [], isLoading: notasLoading } = useNotasFiscais({
    idCliente: idCliente || undefined,
    tipo: tipoFiltro || undefined,
    busca: busca || undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  });

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id_cliente === idCliente) ?? null,
    [clientes, idCliente]
  );

  // Conta receita default (primeira do tipo RECEITA) e despesa default
  const contaReceitaDefault = useMemo(
    () => contas.find((c) => c.tipo === "RECEITA")?.id_conta ?? "",
    [contas]
  );
  const contaDespesaDefault = useMemo(
    () => contas.find((c) => c.tipo === "DESPESA")?.id_conta ?? "",
    [contas]
  );

  async function handleFiles(filesList: FileList | null) {
    if (!filesList || !idCliente) {
      if (!idCliente) toast.error("Selecione o cliente primeiro");
      return;
    }
    const novos: ArquivoParseado[] = [];

    // Carrega chaves existentes pra detectar duplicadas
    const supabase = createSupabaseBrowserClient();
    const { data: existentes } = await supabase
      .from("notas_fiscais")
      .select("chave")
      .eq("id_cliente", idCliente);
    const chavesExistentes = new Set(
      (existentes ?? []).map((e: { chave: string }) => e.chave)
    );

    for (const file of Array.from(filesList)) {
      try {
        const texto = await file.text();
        const nfe = parseNfe(texto);
        if (!nfe || !nfe.chave) {
          // Detecta se é NFSe (Nota Fiscal de Serviço) e dá mensagem específica.
          // Padrão Nacional usa tags com prefixo namespace (<ns:NFSe>,
          // <nfse:infNFSe>), chave varia entre 45-55 dígitos (vs 44 exatos
          // da NF-e), e namespace referencia nfse.gov.br.
          const ehNfse =
            /<[\w:.-]*(?:nfse|infnfse|compnfse|nfsepadraonacional|dpsprestador|dpstomador|xnbs|infrps)\b/i.test(
              texto
            ) ||
            /<[\w:.-]*rps\b/i.test(texto) ||
            texto.slice(0, 3000).toLowerCase().includes("nfse.gov.br") ||
            /^\d{45,55}\.xml$/i.test(file.name);
          novos.push({
            nome: file.name,
            status: "erro",
            erro: ehNfse
              ? "Este XML é uma NFSe (serviço), não NF-e (mercadoria). Importe em /integracoes/nfse/recebidas → botão \"Importar XML manual\"."
              : "XML não é NF-e válida (chave não encontrada)",
            criarLancamento: false,
            idConta: "",
          });
          continue;
        }
        if (chavesExistentes.has(nfe.chave)) {
          novos.push({
            nome: file.name,
            status: "duplicada",
            nfe,
            erro: `Já importada (chave ${nfe.chave.slice(-8)})`,
            criarLancamento: false,
            idConta: "",
          });
          continue;
        }
        const tipo = detectarTipo(nfe, clienteSel?.cnpj ?? null);
        novos.push({
          nome: file.name,
          status: "ok",
          nfe,
          tipo,
          criarLancamento: true,
          idConta:
            tipo === "SAIDA" ? contaReceitaDefault : contaDespesaDefault,
        });
      } catch (e) {
        novos.push({
          nome: file.name,
          status: "erro",
          erro: (e as Error).message,
          criarLancamento: false,
          idConta: "",
        });
      }
    }
    setArquivos((prev) => [...prev, ...novos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removerArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
  }

  function atualizarArquivo(idx: number, patch: Partial<ArquivoParseado>) {
    setArquivos((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
  }

  const importar = useMutation({
    mutationFn: async () => {
      const aImportar = arquivos.filter(
        (a) => a.status === "ok" && a.nfe && a.tipo
      );
      if (aImportar.length === 0) throw new Error("Nada pra importar");
      const supabase = createSupabaseBrowserClient();

      let okCount = 0;
      for (const a of aImportar) {
        const n = a.nfe!;
        const tipo = a.tipo!;
        // Cria NF
        const idNota = gerarId("NFE");
        let idLancamento: string | null = null;

        if (a.criarLancamento && a.idConta) {
          // Cria lançamento contábil
          idLancamento = gerarId("LAN");
          const tipoLanc = tipo === "SAIDA" ? "RECEITA" : "DESPESA";
          const competencia = n.dataEmissao
            ? n.dataEmissao.slice(0, 7)
            : new Date().toISOString().slice(0, 7);
          const { error: errLanc } = await supabase
            .from("lancamentos")
            .insert({
              id_lancamento: idLancamento,
              id_cliente: idCliente,
              id_conta: a.idConta,
              data_lancamento: n.dataEmissao ?? new Date().toISOString().slice(0, 10),
              competencia,
              tipo: tipoLanc,
              valor: n.totais.vNF,
              descricao: `NF-e ${n.numero}/${n.serie} — ${
                tipo === "SAIDA" ? n.dest.nome : n.emit.nome
              }`,
              documento_ref: n.numero,
              observacoes: `Chave: ${n.chave}`,
            } as never);
          if (errLanc) throw errLanc;
        }

        const { error } = await supabase.from("notas_fiscais").insert({
          id_nota: idNota,
          chave: n.chave,
          id_cliente: idCliente,
          numero: n.numero,
          serie: n.serie,
          data_emissao: n.dataEmissao,
          natureza_operacao: n.naturezaOperacao,
          tipo,
          emit_cnpj: n.emit.cnpj,
          emit_nome: n.emit.nome,
          emit_uf: n.emit.uf,
          dest_cnpj: n.dest.documento,
          dest_nome: n.dest.nome,
          valor_produtos: n.totais.vProd,
          valor_desconto: n.totais.vDesc,
          valor_frete: n.totais.vFrete,
          valor_icms: n.totais.vICMS,
          valor_ipi: n.totais.vIPI,
          valor_pis: n.totais.vPIS,
          valor_cofins: n.totais.vCOFINS,
          valor_total: n.totais.vNF,
          itens: n.itens,
          id_lancamento: idLancamento,
          status: idLancamento ? "PROCESSADA" : "IMPORTADA",
          imported_by: user?.email ?? null,
        } as never);
        if (error) throw error;
        okCount++;
      }
      return okCount;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success(`${qtd} nota(s) importada(s)`);
      setArquivos([]);
      setAba("lista");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (idNota: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("notas_fiscais")
        .delete()
        .eq("id_nota", idNota);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notas-fiscais"] });
      toast.success("NF removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stats da lista
  const stats = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const n of notas) {
      if (n.tipo === "SAIDA") saidas += Number(n.valor_total);
      else entradas += Number(n.valor_total);
    }
    return { entradas, saidas };
  }, [notas]);

  const aProcessar = arquivos.filter((a) => a.status === "ok");

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Notas Fiscais (NF-e)" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas a equipe pode importar NF-e.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Notas Fiscais (NF-e)"
        subtitle="Importação de XML — extrai dados e cria lançamento contábil automático"
      />

      {/* Cliente */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[280px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Empresa
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => {
              setIdCliente(e.target.value);
              setArquivos([]);
            }}
          >
            <option value="">
              {aba === "importar" ? "Selecione a empresa…" : "Todas"}
            </option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
                {c.cnpj && ` (${formatCNPJ(c.cnpj)})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-card-border rounded-xl mb-4 flex items-center gap-1 p-1 w-fit">
        <TabBtn ativo={aba === "importar"} onClick={() => setAba("importar")}>
          Importar XMLs
        </TabBtn>
        <TabBtn ativo={aba === "lista"} onClick={() => setAba("lista")}>
          Notas importadas
        </TabBtn>
      </div>

      {/* ─── Aba Importar ─── */}
      {aba === "importar" && (
        <>
          {!idCliente ? (
            <div className="bg-white border border-card-border rounded-xl p-8 text-center text-sm text-gray-500">
              Selecione uma empresa pra começar a importação.
            </div>
          ) : (
            <>
              {/* Dropzone */}
              <div
                className="bg-white border-2 border-dashed border-card-border rounded-xl p-8 text-center mb-4 hover:border-verde-primary transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("border-verde-primary");
                }}
                onDragLeave={(e) =>
                  e.currentTarget.classList.remove("border-verde-primary")
                }
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-verde-primary");
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <Upload size={32} className="mx-auto text-gray-300 mb-2" />
                <div className="text-sm text-gray-700 font-medium">
                  Arraste XMLs de NF-e aqui ou clique pra selecionar
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Suporta múltiplos arquivos. Notas duplicadas são detectadas
                  pela chave.
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {arquivos.length > 0 && (
                <>
                  <div className="bg-white border border-card-border rounded-xl mb-4">
                    <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
                      <h3 className="font-serif text-sm font-semibold text-verde-dark">
                        Prévia ({arquivos.length} arquivo
                        {arquivos.length > 1 ? "s" : ""})
                      </h3>
                      <button
                        onClick={() => setArquivos([])}
                        className="text-xs text-gray-500 hover:text-red-alert"
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="divide-y divide-card-border">
                      {arquivos.map((a, idx) => (
                        <ItemPrevia
                          key={idx}
                          item={a}
                          contas={contas}
                          onRemove={() => removerArquivo(idx)}
                          onChange={(patch) => atualizarArquivo(idx, patch)}
                        />
                      ))}
                    </div>
                  </div>

                  {aProcessar.length > 0 && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() => importar.mutate()}
                        disabled={importar.isPending}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle2 size={14} />
                        {importar.isPending
                          ? "Importando…"
                          : `Importar ${aProcessar.length} nota${
                              aProcessar.length > 1 ? "s" : ""
                            }`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Aba Lista ─── */}
      {aba === "lista" && (
        <>
          <div className="bg-white border border-card-border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-end">
            <input
              className={`${inputClass} max-w-[260px]`}
              placeholder="Buscar nº / emitente / dest…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              className={`${inputClass} max-w-[160px]`}
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
            >
              <option value="">Todos os tipos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
            </select>
            <input
              type="date"
              className={`${inputClass} max-w-[160px]`}
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
            <input
              type="date"
              className={`${inputClass} max-w-[160px]`}
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard
              icon={ArrowDownCircle}
              label="Total entradas"
              value={formatBRL(stats.entradas)}
              tone="neutral"
            />
            <StatCard
              icon={ArrowUpCircle}
              label="Total saídas"
              value={formatBRL(stats.saidas)}
              tone="verde"
            />
            <StatCard
              label="Notas"
              value={String(notas.length)}
              tone="neutral"
              raw
            />
          </div>

          <div className="bg-white border border-card-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-gray-50 text-gray-600 text-left text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 w-24">Data</th>
                  <th className="px-4 py-3 w-32">Nº / Série</th>
                  <th className="px-4 py-3">Outro lado</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3 w-24">Tipo</th>
                  <th className="px-4 py-3 text-right w-32">Valor</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {notasLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!notasLoading && notas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      <FileX size={32} className="mx-auto text-gray-300 mb-2" />
                      Nenhuma NF-e importada.
                    </td>
                  </tr>
                )}
                {notas.map((n) => (
                  <tr key={n.id_nota} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {formatDate(n.data_emissao)}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-700 whitespace-nowrap">
                      {n.numero}/{n.serie}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800 truncate max-w-xs">
                        {n.tipo === "SAIDA" ? n.dest_nome : n.emit_nome}
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {n.tipo === "SAIDA"
                          ? n.dest_cnpj && formatCNPJ(n.dest_cnpj)
                          : n.emit_cnpj && formatCNPJ(n.emit_cnpj)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {n.clientes?.razao_social ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
                          n.tipo === "SAIDA"
                            ? "bg-verde-light text-verde-dark"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {n.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-verde-dark whitespace-nowrap">
                      {formatBRL(Number(n.valor_total))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/nfe/${n.id_nota}`}
                          className="inline-flex items-center gap-1 text-verde-primary hover:text-verde-dark text-xs font-medium"
                        >
                          <Eye size={12} /> Ver
                        </Link>
                        <button
                          onClick={() => {
                            if (confirm(`Remover NF ${n.numero}?`))
                              excluir.mutate(n.id_nota);
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
        </>
      )}
    </div>
  );
}

function ItemPrevia({
  item,
  contas,
  onRemove,
  onChange,
}: {
  item: ArquivoParseado;
  contas: Array<{ id_conta: string; codigo: string; nome: string; tipo: string }>;
  onRemove: () => void;
  onChange: (patch: Partial<ArquivoParseado>) => void;
}) {
  if (item.status === "erro") {
    return (
      <div className="p-4 flex items-start gap-3 bg-red-50">
        <AlertCircle size={16} className="text-red-alert flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-red-alert">{item.nome}</div>
          <div className="text-xs text-gray-600 mt-0.5">{item.erro}</div>
        </div>
        <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-alert">
          <X size={14} />
        </button>
      </div>
    );
  }

  if (item.status === "duplicada") {
    return (
      <div className="p-4 flex items-start gap-3 bg-amber-50">
        <AlertCircle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-800">{item.nome}</div>
          <div className="text-xs text-amber-700 mt-0.5">
            {item.erro}
          </div>
          {item.nfe && (
            <div className="text-xs text-gray-600 mt-1">
              {item.nfe.emit.nome} → {item.nfe.dest.nome} •{" "}
              {formatBRL(item.nfe.totais.vNF)}
            </div>
          )}
        </div>
        <button onClick={onRemove} className="p-1 text-gray-400 hover:text-amber-700">
          <X size={14} />
        </button>
      </div>
    );
  }

  const n = item.nfe!;
  const tipo = item.tipo!;
  const contasFiltradas = contas.filter((c) =>
    tipo === "SAIDA" ? c.tipo === "RECEITA" : c.tipo === "DESPESA"
  );

  return (
    <div className="p-4 grid grid-cols-12 gap-3 items-start">
      <div className="col-span-12 sm:col-span-5">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
              tipo === "SAIDA"
                ? "bg-verde-light text-verde-dark"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {tipo}
          </span>
          <span className="text-xs font-mono text-gray-500">
            NF {n.numero}/{n.serie}
          </span>
          <span className="text-[10px] text-gray-400">
            {formatDate(n.dataEmissao)}
          </span>
        </div>
        <div className="text-sm font-medium text-gray-800 truncate">
          {tipo === "SAIDA" ? n.dest.nome : n.emit.nome}
        </div>
        <div className="text-[11px] text-gray-500 font-mono">
          {tipo === "SAIDA"
            ? n.dest.documento && (n.dest.tipoDoc === "CPF"
                ? n.dest.documento
                : formatCNPJ(n.dest.documento))
            : n.emit.cnpj && formatCNPJ(n.emit.cnpj)}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {n.itens.length} item(ns) • {n.naturezaOperacao}
        </div>
      </div>

      <div className="col-span-5 sm:col-span-3">
        <label className="flex items-center gap-2 text-xs text-gray-700 mb-1.5">
          <input
            type="checkbox"
            checked={item.criarLancamento}
            onChange={(e) => onChange({ criarLancamento: e.target.checked })}
          />
          Criar lançamento
        </label>
        {item.criarLancamento && (
          <select
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:border-verde-primary focus:outline-none"
            value={item.idConta}
            onChange={(e) => onChange({ idConta: e.target.value })}
          >
            <option value="">Conta…</option>
            {contasFiltradas.map((c) => (
              <option key={c.id_conta} value={c.id_conta}>
                {c.codigo} — {c.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="col-span-6 sm:col-span-3 text-right">
        <div className="text-[10px] uppercase text-gray-500">Valor NF</div>
        <div className="text-lg font-bold text-verde-dark">
          {formatBRL(n.totais.vNF)}
        </div>
        {n.totais.vICMS > 0 && (
          <div className="text-[10px] text-gray-500">
            ICMS {formatBRL(n.totais.vICMS)}
          </div>
        )}
      </div>

      <div className="col-span-1 text-right">
        <button onClick={onRemove} className="p-1 text-gray-400 hover:text-red-alert">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  raw,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  tone: "verde" | "neutral";
  raw?: boolean;
}) {
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        {Icon && <Icon size={16} className="text-gold" />}
      </div>
      <div
        className={`mt-2 text-xl ${
          raw ? "font-semibold" : "font-bold"
        } ${tone === "verde" ? "text-verde-dark" : "text-gray-800"}`}
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
