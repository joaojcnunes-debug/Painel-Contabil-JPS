"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  FileLock2,
  History,
  ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { CardIntegracao } from "@/components/integracoes/CardIntegracao";
import { useClientes } from "@/lib/hooks/useClientes";
import { useIntegracoes } from "@/lib/hooks/useIntegracoes";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MODULOS } from "@/lib/integracoes/core/registry";
import { executarIntegracao } from "@/lib/integracoes/core/client";
import { gerarId } from "@/lib/utils";
import type {
  IntegracaoConfig,
  ModoIntegracao,
  ModuloIntegracao,
  StatusIntegracao,
} from "@/lib/supabase/types";

export default function IntegracoesPage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const isEquipe = isAdmin || user?.perfil === "Contador";

  const { data: clientes = [], isLoading: clientesLoading, error: clientesError } = useClientes();
  const qc = useQueryClient();
  const router = useRouter();

  const [idCliente, setIdCliente] = useState("");
  const [executando, setExecutando] = useState<ModuloIntegracao | null>(null);

  const { data: configs = [], isLoading } = useIntegracoes(
    idCliente ? { idCliente } : undefined
  );

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id_cliente === idCliente) ?? null,
    [clientes, idCliente]
  );

  // Mapeia config por módulo do cliente selecionado (ou config global se idCliente vazio)
  const configPorModulo = useMemo(() => {
    const m = new Map<ModuloIntegracao, IntegracaoConfig>();
    for (const c of configs) {
      m.set(c.modulo, c);
    }
    return m;
  }, [configs]);

  // ─── Consultar (executa simulado e atualiza config) ──────
  async function consultar(modulo: ModuloIntegracao) {
    if (!idCliente) {
      toast.error("Selecione uma empresa pra consultar");
      return;
    }
    setExecutando(modulo);
    try {
      const supabase = createSupabaseBrowserClient();
      const config = configPorModulo.get(modulo);
      const meta = MODULOS.find((m) => m.id === modulo)!;
      const acaoPadrao = meta.acoes[0]?.id ?? "consultar";
      const modoAtual = (config?.modo ?? "SIMULADO") as ModoIntegracao;

      // Redirect pro fluxo dedicado quando:
      // (a) ação padrão exige fluxo dedicado (cert A1 + senha por chamada), OU
      // (b) módulo tem slug mas nenhuma ação real (cai em erro genérico).
      const acaoMeta = meta.acoes.find((a) => a.id === acaoPadrao);
      const temAlgumaAcaoReal = meta.acoes.some((a) => a.temReal);
      const redirectDedicado =
        modoAtual === "REAL" &&
        meta.slug &&
        (acaoMeta?.requerFluxoDedicado || !temAlgumaAcaoReal);
      if (redirectDedicado) {
        toast.success(
          `${meta.curto}: redirecionando para o fluxo dedicado…`
        );
        router.push(`/integracoes/${meta.slug}`);
        return;
      }

      const resp = await executarIntegracao({
        supabase,
        modulo,
        acao: acaoPadrao,
        modo: modoAtual,
        idConfig: config?.id_config ?? null,
        idCliente,
        cnpjCliente: clienteSel?.cnpj ?? null,
        usuario: { email: user?.email, nome: user?.nome },
      });

      // Atualiza ou cria config com último resultado
      const status: StatusIntegracao = resp.ok
        ? (resp.pendencias?.length ?? 0) > 0
          ? "PENDENTE"
          : "OK"
        : "ERRO";

      if (config) {
        await supabase
          .from("integracoes_config")
          .update({
            ultima_sync: new Date().toISOString(),
            ultimo_status: status,
            ultimo_retorno: resp as unknown as Record<string, unknown>,
            pendencias_count: resp.pendencias?.length ?? 0,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id_config", config.id_config);
      } else {
        await supabase.from("integracoes_config").insert({
          id_config: gerarId("INT"),
          id_cliente: idCliente,
          modulo,
          ativo: true,
          modo: "SIMULADO",
          ultima_sync: new Date().toISOString(),
          ultimo_status: status,
          ultimo_retorno: resp as unknown as Record<string, unknown>,
          pendencias_count: resp.pendencias?.length ?? 0,
        } as never);
      }

      qc.invalidateQueries({ queryKey: ["integracoes-config"] });
      qc.invalidateQueries({ queryKey: ["integracoes-logs"] });
      if (resp.ok) {
        toast.success(
          `${meta.curto}: ${
            resp.pendencias?.length ?? 0
          } pendência(s) encontrada(s)`
        );
      } else {
        toast.error(`${meta.curto}: ${resp.erro?.mensagem ?? "erro"}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExecutando(null);
    }
  }

  // Alterna modo simulado/real (só Admin)
  const alternarModo = useMutation({
    mutationFn: async ({
      modulo,
      modo,
    }: {
      modulo: ModuloIntegracao;
      modo: ModoIntegracao;
    }) => {
      if (!idCliente) throw new Error("Selecione uma empresa");
      const supabase = createSupabaseBrowserClient();
      const config = configPorModulo.get(modulo);
      if (config) {
        const { error } = await supabase
          .from("integracoes_config")
          .update({ modo, updated_at: new Date().toISOString() } as never)
          .eq("id_config", config.id_config);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("integracoes_config").insert({
          id_config: gerarId("INT"),
          id_cliente: idCliente,
          modulo,
          ativo: true,
          modo,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integracoes-config"] });
      toast.success("Modo alterado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Integrações governamentais" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas Admin/Contador pode acessar integrações.
        </div>
      </div>
    );
  }

  const totalPendencias = configs.reduce(
    (s, c) => s + (c.pendencias_count ?? 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="Integrações governamentais"
        subtitle="Receita Federal, eSocial, EFD-Reinf, SPED, NFs, Simples Nacional, FGTS, Prefeituras, REDESIM e Certificados"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/integracoes/certificados"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-verde-primary hover:bg-verde-light"
            >
              <FileLock2 size={14} /> Certificados
            </Link>
            <Link
              href="/integracoes/logs"
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-card-border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <History size={14} /> Logs
            </Link>
          </div>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-xs text-amber-900">
        <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          <strong>Modo simulado ativo por padrão.</strong> Todas as
          chamadas geram pendências fictícias deterministas (mesma empresa
          sempre vê o mesmo &quot;cenário&quot;). Modo real será habilitado
          módulo-a-módulo conforme certificados e credenciais forem
          disponibilizados.
        </div>
      </div>

      {/* Filtro de empresa */}
      <div className="bg-white border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[280px]">
          <label className="block text-xs uppercase text-gray-500 mb-1">
            Empresa
          </label>
          <select
            className={inputClass}
            value={idCliente}
            onChange={(e) => setIdCliente(e.target.value)}
            disabled={clientesLoading}
          >
            <option value="">
              {clientesLoading
                ? "Carregando empresas…"
                : clientesError
                  ? "Erro ao carregar (recarregue a página)"
                  : clientes.length === 0
                    ? "Nenhuma empresa cadastrada"
                    : `Selecione uma empresa… (${clientes.length} disponível${clientes.length > 1 ? "eis" : ""})`}
            </option>
            {clientes.map((c) => (
              <option key={c.id_cliente} value={c.id_cliente}>
                {c.razao_social}
              </option>
            ))}
          </select>
          {clientesError && (
            <div className="text-[10px] text-red-alert mt-1">
              {(clientesError as Error).message}
            </div>
          )}
        </div>
        {idCliente && (
          <div className="flex items-center gap-3 ml-auto">
            <div className="text-xs text-gray-600">
              <strong>{configs.length}</strong> módulo(s) configurado(s)
              {totalPendencias > 0 && (
                <span className="ml-2 text-amber-700">
                  • {totalPendencias} pendência(s)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {!idCliente ? (
        <div className="bg-white border border-card-border rounded-xl p-10 text-center text-sm text-gray-500">
          <AlertTriangle size={32} className="mx-auto text-gray-300 mb-3" />
          Selecione uma empresa acima pra ver/consultar as integrações
          governamentais.
          <br />
          <span className="text-xs">
            Cada empresa tem configurações independentes.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {MODULOS.map((meta) => {
            const config = configPorModulo.get(meta.id) ?? null;
            return (
              <div key={meta.id} className="relative">
                <CardIntegracao
                  meta={meta}
                  config={config}
                  carregando={executando === meta.id}
                  onConsultar={() => consultar(meta.id)}
                  onConfigurar={() => {
                    if (!isAdmin) {
                      toast.error("Só Admin pode alterar configuração");
                      return;
                    }
                    const novo: ModoIntegracao =
                      config?.modo === "REAL" ? "SIMULADO" : "REAL";
                    if (novo === "REAL") {
                      const acoesReais = meta.acoes.filter((a) => a.temReal);
                      const total = meta.acoes.length;
                      const real = acoesReais.length;
                      let msg: string;
                      if (real === 0) {
                        msg =
                          `Trocar ${meta.curto} para MODO REAL?\n\n` +
                          `Nenhuma ação deste módulo tem implementação REAL ainda. ` +
                          `Toda chamada vai retornar erro com motivo específico (cert A1 necessário, ` +
                          `webservice indisponível, etc).\n\nContinuar mesmo assim?`;
                      } else if (real < total) {
                        const lista = acoesReais.map((a) => `• ${a.label}`).join("\n");
                        msg =
                          `Trocar ${meta.curto} para MODO REAL?\n\n` +
                          `${real} de ${total} ações têm REAL disponível:\n${lista}\n\n` +
                          `As demais retornam erro explicativo. Continuar?`;
                      } else {
                        msg =
                          `Trocar ${meta.curto} para MODO REAL?\n\n` +
                          `Todas as ${total} ações têm implementação REAL.`;
                      }
                      if (!confirm(msg)) return;
                    }
                    alternarModo.mutate({ modulo: meta.id, modo: novo });
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Carregando configurações…
        </div>
      )}
    </div>
  );
}
