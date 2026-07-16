"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId } from "@/lib/utils";
import type {
  GestaoEspaco,
  GestaoPasta,
  GestaoQuadro,
  GestaoStatus,
  GestaoTarefa,
  GestaoPapel,
  PrioridadeTarefa,
} from "./types";

// ─── Meu papel (portão do módulo) ─────────────────────────────
export function useMeuPapelGestao() {
  return useQuery({
    queryKey: ["gestao", "meu-papel"],
    queryFn: async (): Promise<GestaoPapel | null> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("gestao_meu_papel");
      if (error) throw error;
      return (data as GestaoPapel | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Espaços ──────────────────────────────────────────────────
export function useEspacos() {
  return useQuery({
    queryKey: ["gestao", "espacos"],
    queryFn: async (): Promise<GestaoEspaco[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_espacos")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as GestaoEspaco[];
    },
  });
}

export function useSalvarEspaco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<GestaoEspaco> & { nome: string }
    ): Promise<GestaoEspaco> => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id) {
        const { data, error } = await supabase
          .from("gestao_espacos")
          .update({ nome: dados.nome, cor: dados.cor, ordem: dados.ordem } as never)
          .eq("id", dados.id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as GestaoEspaco;
      }
      const { data, error } = await supabase
        .from("gestao_espacos")
        .insert({
          nome: dados.nome,
          cor: dados.cor ?? "#006B54",
          ordem: dados.ordem ?? 0,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as GestaoEspaco;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "espacos"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirEspaco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_espacos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gestao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Pastas ───────────────────────────────────────────────────
export function usePastas(idEspaco?: string | null) {
  return useQuery({
    queryKey: ["gestao", "pastas", idEspaco ?? "todos"],
    queryFn: async (): Promise<GestaoPasta[]> => {
      const supabase = createSupabaseBrowserClient();
      let q = supabase.from("gestao_pastas").select("*").order("ordem").order("nome");
      if (idEspaco) q = q.eq("id_espaco", idEspaco);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as GestaoPasta[];
    },
  });
}

export function useSalvarPasta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<GestaoPasta> & { nome: string; id_espaco: string }
    ): Promise<GestaoPasta> => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id) {
        const { data, error } = await supabase
          .from("gestao_pastas")
          .update({ nome: dados.nome, ordem: dados.ordem } as never)
          .eq("id", dados.id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as GestaoPasta;
      }
      const { data, error } = await supabase
        .from("gestao_pastas")
        .insert({
          nome: dados.nome,
          id_espaco: dados.id_espaco,
          ordem: dados.ordem ?? 0,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as GestaoPasta;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "pastas"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirPasta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_pastas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Quadros ──────────────────────────────────────────────────
export function useQuadros() {
  return useQuery({
    queryKey: ["gestao", "quadros"],
    queryFn: async (): Promise<GestaoQuadro[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_quadros")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as GestaoQuadro[];
    },
  });
}

export function useSalvarQuadro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<GestaoQuadro> & { nome: string }
    ): Promise<GestaoQuadro> => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id_quadro) {
        const { data, error } = await supabase
          .from("gestao_quadros")
          .update({
            nome: dados.nome,
            descricao: dados.descricao ?? null,
            id_espaco: dados.id_espaco ?? null,
            id_pasta: dados.id_pasta ?? null,
            restrito: dados.restrito ?? false,
            ordem: dados.ordem ?? 0,
          } as never)
          .eq("id_quadro", dados.id_quadro)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as GestaoQuadro;
      }
      const { data, error } = await supabase
        .from("gestao_quadros")
        .insert({
          id_quadro: gerarId("QDR"),
          nome: dados.nome,
          descricao: dados.descricao ?? null,
          id_espaco: dados.id_espaco ?? null,
          id_pasta: dados.id_pasta ?? null,
          restrito: dados.restrito ?? false,
          ordem: dados.ordem ?? 0,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as GestaoQuadro;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "quadros"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirQuadro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id_quadro: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_quadros")
        .delete()
        .eq("id_quadro", id_quadro);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Status ───────────────────────────────────────────────────
export function useStatusQuadro(idQuadro: string | null) {
  return useQuery({
    queryKey: ["gestao", "status", idQuadro ?? "none"],
    enabled: !!idQuadro,
    queryFn: async (): Promise<GestaoStatus[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_status")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as GestaoStatus[];
    },
  });
}

// ─── Tarefas ──────────────────────────────────────────────────
export function useTarefas(idQuadro: string | null) {
  return useQuery({
    queryKey: ["gestao", "tarefas", idQuadro ?? "none"],
    enabled: !!idQuadro,
    queryFn: async (): Promise<GestaoTarefa[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_tarefas")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("ordem")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as GestaoTarefa[];
    },
  });
}

type SalvarTarefaInput = Partial<GestaoTarefa> & {
  titulo: string;
  id_quadro: string;
};

export function useSalvarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: SalvarTarefaInput): Promise<GestaoTarefa> => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id_tarefa) {
        const { data, error } = await supabase
          .from("gestao_tarefas")
          .update({
            titulo: dados.titulo,
            descricao: dados.descricao ?? null,
            status: dados.status,
            prioridade: dados.prioridade ?? "Media",
            responsavel: dados.responsavel ?? null,
            data_inicio: dados.data_inicio ?? null,
            prazo: dados.prazo ?? null,
            etiquetas: dados.etiquetas ?? [],
            pontos: dados.pontos ?? null,
          } as never)
          .eq("id_tarefa", dados.id_tarefa)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as GestaoTarefa;
      }
      const { data, error } = await supabase
        .from("gestao_tarefas")
        .insert({
          id_tarefa: gerarId("TRF"),
          id_quadro: dados.id_quadro,
          titulo: dados.titulo,
          descricao: dados.descricao ?? null,
          status: dados.status ?? "A_FAZER",
          prioridade: dados.prioridade ?? "Media",
          responsavel: dados.responsavel ?? null,
          data_inicio: dados.data_inicio ?? null,
          prazo: dados.prazo ?? null,
          etiquetas: dados.etiquetas ?? [],
          pontos: dados.pontos ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as GestaoTarefa;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tarefas", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Mover uma tarefa entre colunas (mudança de status) — otimista
export function useMoverTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id_tarefa: string;
      id_quadro: string;
      novo_status: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_tarefas")
        .update({ status: input.novo_status } as never)
        .eq("id_tarefa", input.id_tarefa);
      if (error) throw error;
    },
    onMutate: async (input) => {
      const key = ["gestao", "tarefas", input.id_quadro];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<GestaoTarefa[]>(key);
      if (prev) {
        qc.setQueryData<GestaoTarefa[]>(
          key,
          prev.map((t) =>
            t.id_tarefa === input.id_tarefa ? { ...t, status: input.novo_status } : t
          )
        );
      }
      return { prev, key };
    },
    onError: (e: Error, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tarefas", input.id_quadro] });
    },
  });
}

export function useExcluirTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_tarefa: string; id_quadro: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_tarefas")
        .delete()
        .eq("id_tarefa", input.id_tarefa);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tarefas", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Utility client-side pra escolher a prioridade default
export function proximaPrioridade(p: PrioridadeTarefa): PrioridadeTarefa {
  const seq: PrioridadeTarefa[] = ["Baixa", "Media", "Alta", "Urgente"];
  const idx = seq.indexOf(p);
  return seq[(idx + 1) % seq.length];
}
