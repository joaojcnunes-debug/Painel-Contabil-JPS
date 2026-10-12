"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { normalizeHeader, parseCsv } from "@/lib/csv";
import {
  normalizarNome,
  parseDataBR,
  parseValorBR,
  soDigitos,
} from "@/lib/distribuicao-lucros";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatBRL, formatDate, gerarId } from "@/lib/utils";
import type { Cliente, Socio } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  socios: Socio[];
};

type Linha = {
  n: number;
  empresa: string;
  socio: string;
  data: string | null;
  valor: number;
  cliente: Cliente | null;
  socioMatch: Socio | null;
  erro: string | null;
};

// Aliases aceitos no cabeçalho da planilha (já normalizados)
const COL = {
  data: ["data", "data_da_retirada", "data_retirada", "data_distribuicao"],
  empresa: ["empresa", "razao_social", "cliente"],
  cnpj: ["cnpj", "cnpj_empresa"],
  socio: ["socio", "nome_socio", "nome"],
  cpf: ["cpf", "cpf_socio"],
  valor: ["valor", "valor_r", "valor_distribuicao", "valor_r_distribuicao"],
  forma: ["forma", "forma_pagamento", "forma_de_pagamento"],
  obs: ["observacoes", "observacao", "obs"],
};

function acharColuna(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h));
}

export function ImportarDistribuicoesModal({ open, onClose, clientes, socios }: Props) {
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState("");
  const [linhas, setLinhas] = useState<(Linha & { forma: string; obs: string })[]>([]);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);

  const validas = useMemo(() => linhas.filter((l) => !l.erro), [linhas]);

  function fechar() {
    setArquivo("");
    setLinhas([]);
    setErroArquivo(null);
    onClose();
  }

  async function lerArquivo(file: File) {
    setArquivo(file.name);
    setErroArquivo(null);
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setErroArquivo("Planilha vazia.");
      setLinhas([]);
      return;
    }
    const headers = rows[0].map(normalizeHeader);
    const idx = {
      data: acharColuna(headers, COL.data),
      empresa: acharColuna(headers, COL.empresa),
      cnpj: acharColuna(headers, COL.cnpj),
      socio: acharColuna(headers, COL.socio),
      cpf: acharColuna(headers, COL.cpf),
      valor: acharColuna(headers, COL.valor),
      forma: acharColuna(headers, COL.forma),
      obs: acharColuna(headers, COL.obs),
    };
    const faltando: string[] = [];
    if (idx.data < 0) faltando.push("Data");
    if (idx.valor < 0) faltando.push("Valor");
    if (idx.empresa < 0 && idx.cnpj < 0) faltando.push("Empresa ou CNPJ");
    if (idx.socio < 0 && idx.cpf < 0) faltando.push("Sócio ou CPF");
    if (faltando.length) {
      setErroArquivo(`Colunas não encontradas: ${faltando.join(", ")}.`);
      setLinhas([]);
      return;
    }

    const cel = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

    setLinhas(
      rows.slice(1).map((r, i) => {
        const empresa = cel(r, idx.empresa);
        const cnpj = soDigitos(cel(r, idx.cnpj));
        const nomeSocio = cel(r, idx.socio);
        const cpf = soDigitos(cel(r, idx.cpf));
        const data = parseDataBR(cel(r, idx.data));
        const valor = parseValorBR(cel(r, idx.valor));

        const cliente =
          (cnpj && clientes.find((c) => soDigitos(c.cnpj) === cnpj)) ||
          (empresa &&
            clientes.find(
              (c) =>
                normalizarNome(c.razao_social) === normalizarNome(empresa) ||
                (c.nome_fantasia &&
                  normalizarNome(c.nome_fantasia) === normalizarNome(empresa))
            )) ||
          null;

        const daEmpresa = cliente
          ? socios.filter((s) => s.id_cliente === cliente.id_cliente)
          : [];
        const socioMatch =
          (cpf && daEmpresa.find((s) => soDigitos(s.cpf) === cpf)) ||
          (nomeSocio &&
            daEmpresa.find((s) => normalizarNome(s.nome) === normalizarNome(nomeSocio))) ||
          null;

        let erro: string | null = null;
        if (!data) erro = "Data inválida";
        else if (!(valor > 0)) erro = "Valor inválido";
        else if (!cliente) erro = "Empresa não encontrada";
        else if (!socioMatch) erro = "Sócio não cadastrado nesta empresa";

        return {
          n: i + 2,
          empresa: cliente?.razao_social ?? (empresa || cnpj),
          socio: socioMatch?.nome ?? (nomeSocio || cpf),
          data,
          valor,
          cliente,
          socioMatch,
          erro,
          forma: cel(r, idx.forma),
          obs: cel(r, idx.obs),
        };
      })
    );
  }

  const importar = useMutation({
    mutationFn: async () => {
      if (validas.length === 0) throw new Error("Nenhuma linha válida para importar");
      const registros = validas.map((l) => ({
        id_distribuicao: gerarId("DLU"),
        id_cliente: l.cliente!.id_cliente,
        id_socio: l.socioMatch!.id_socio,
        nome_socio: l.socioMatch!.nome,
        cpf_socio: l.socioMatch!.cpf,
        data_distribuicao: l.data!,
        valor: Math.round(l.valor * 100) / 100,
        forma_pagamento: l.forma || null,
        observacoes: l.obs || null,
      }));
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("distribuicoes_lucros")
        .insert(registros as never);
      if (error) throw error;
      return registros.length;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries({ queryKey: ["distribuicoes-lucros"] });
      toast.success(`${qtd} distribuição(ões) importada(s)`);
      fechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Importar planilha de distribuições"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">
            {linhas.length > 0 &&
              `${validas.length} de ${linhas.length} linha(s) prontas para importar`}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fechar} disabled={importar.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => importar.mutate()}
              disabled={importar.isPending || validas.length === 0}
            >
              {importar.isPending ? "Importando..." : `Importar ${validas.length}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-xs text-gray-600 bg-gray-50 border border-card-border rounded-lg p-3">
          CSV (separador <strong>;</strong> ou <strong>,</strong>) com cabeçalho. Colunas:{" "}
          <strong>Data</strong>, <strong>Empresa</strong> ou <strong>CNPJ</strong>,{" "}
          <strong>Sócio</strong> ou <strong>CPF</strong>, <strong>Valor</strong> — opcionais:
          Forma de pagamento, Observações. No Excel: Arquivo › Salvar como › CSV.
          <br />
          O sócio precisa estar cadastrado na empresa (RH / DP › Pró-labore).
        </div>

        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-sm text-gray-600 cursor-pointer hover:border-verde-primary hover:text-verde-dark">
          <Upload size={16} />
          {arquivo || "Escolher arquivo .csv"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) lerArquivo(f);
              e.target.value = "";
            }}
          />
        </label>

        {erroArquivo && (
          <div className="text-sm text-red-alert">{erroArquivo}</div>
        )}

        {linhas.length > 0 && (
          <div className="border border-card-border rounded-lg overflow-auto max-h-80">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-gray-50 text-gray-600 text-left uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Sócio</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {linhas.map((l) => (
                  <tr key={l.n} className={l.erro ? "bg-red-50" : ""}>
                    <td className="px-3 py-1.5 text-gray-400">{l.n}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(l.data)}</td>
                    <td className="px-3 py-1.5">{l.empresa || "—"}</td>
                    <td className="px-3 py-1.5">{l.socio || "—"}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {l.valor > 0 ? formatBRL(l.valor) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {l.erro ? (
                        <span className="text-red-alert">{l.erro}</span>
                      ) : (
                        <span className="text-verde-dark">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
