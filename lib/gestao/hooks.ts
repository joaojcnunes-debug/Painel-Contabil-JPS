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
            campos: dados.campos ?? {},
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
          campos: dados.campos ?? {},
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

// ─── Campos personalizados ────────────────────────────────────
export function useCamposQuadro(idQuadro: string | null) {
  return useQuery({
    queryKey: ["gestao", "campos", idQuadro ?? "none"],
    enabled: !!idQuadro,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_campos")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoCampo[];
    },
  });
}

export function useSalvarCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<import("./types").GestaoCampo> & {
        nome: string;
        tipo: import("./types").TipoCampo;
        id_quadro: string;
      }
    ) => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id) {
        const { error } = await supabase
          .from("gestao_campos")
          .update({
            nome: dados.nome,
            tipo: dados.tipo,
            opcoes: dados.opcoes ?? [],
            ordem: dados.ordem ?? 0,
            visivel_cliente: dados.visivel_cliente ?? false,
          } as never)
          .eq("id", dados.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("gestao_campos").insert({
        id_quadro: dados.id_quadro,
        nome: dados.nome,
        tipo: dados.tipo,
        opcoes: dados.opcoes ?? [],
        ordem: dados.ordem ?? 0,
        visivel_cliente: dados.visivel_cliente ?? false,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "campos", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_quadro: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_campos").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "campos", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Etiquetas do quadro ──────────────────────────────────────
export function useEtiquetasQuadro(idQuadro: string | null) {
  return useQuery({
    queryKey: ["gestao", "etiquetas", idQuadro ?? "none"],
    enabled: !!idQuadro,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_etiquetas")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoEtiqueta[];
    },
  });
}

export function useSalvarEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<import("./types").GestaoEtiqueta> & {
        nome: string;
        cor: string;
        id_quadro: string;
      }
    ) => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id) {
        const { error } = await supabase
          .from("gestao_etiquetas")
          .update({ nome: dados.nome, cor: dados.cor, ordem: dados.ordem ?? 0 } as never)
          .eq("id", dados.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("gestao_etiquetas").insert({
        id_quadro: dados.id_quadro,
        nome: dados.nome,
        cor: dados.cor,
        ordem: dados.ordem ?? 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "etiquetas", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_quadro: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_etiquetas").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "etiquetas", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Comentários ──────────────────────────────────────────────
export function useComentarios(idTarefa: string | null) {
  return useQuery({
    queryKey: ["gestao", "comentarios", idTarefa ?? "none"],
    enabled: !!idTarefa,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_comentarios")
        .select("*")
        .eq("id_tarefa", idTarefa!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoComentario[];
    },
  });
}

export function useAddComentario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_tarefa: string; autor: string; texto: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_comentarios").insert({
        id_comentario: gerarId("CMT"),
        id_tarefa: input.id_tarefa,
        autor: input.autor,
        texto: input.texto,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "comentarios", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirComentario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_comentario: string; id_tarefa: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_comentarios")
        .delete()
        .eq("id_comentario", input.id_comentario);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "comentarios", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Anexos ───────────────────────────────────────────────────
const MAX_ANEXO_BYTES = 25 * 1024 * 1024; // 25 MB

export function useAnexos(idTarefa: string | null) {
  return useQuery({
    queryKey: ["gestao", "anexos", idTarefa ?? "none"],
    enabled: !!idTarefa,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_anexos")
        .select("*")
        .eq("id_tarefa", idTarefa!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoAnexo[];
    },
  });
}

export function useUploadAnexo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_tarefa: string; file: File; autor: string | null }) => {
      if (input.file.size > MAX_ANEXO_BYTES) {
        throw new Error(`Arquivo maior que ${MAX_ANEXO_BYTES / 1024 / 1024}MB`);
      }
      const supabase = createSupabaseBrowserClient();
      const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uid =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const path = `gestao/${input.id_tarefa}/${uid}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("anexos")
        .upload(path, input.file, {
          contentType: input.file.type || "application/octet-stream",
        });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("gestao_anexos").insert({
        id_tarefa: input.id_tarefa,
        nome: input.file.name,
        storage_path: path,
        mime: input.file.type || null,
        tamanho_bytes: input.file.size,
        created_by: input.autor,
      } as never);
      if (insErr) throw insErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "anexos", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirAnexo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      id_tarefa: string;
      storage_path: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      await supabase.storage.from("anexos").remove([input.storage_path]);
      const { error } = await supabase.from("gestao_anexos").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "anexos", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Retorna URL assinada temporária (60s) pra download do anexo
export async function urlAssinadaAnexo(storage_path: string): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from("anexos")
    .createSignedUrl(storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}

// ─── Filtros salvos ───────────────────────────────────────────
export function useFiltrosSalvos(idQuadro: string | null, email: string | null) {
  return useQuery({
    queryKey: ["gestao", "filtros", idQuadro ?? "none", email ?? "anon"],
    enabled: !!idQuadro && !!email,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_filtros_salvos")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        usuario_email: string;
        id_quadro: string;
        nome: string;
        criterios: import("./types").FiltrosGestao;
        created_at: string;
      }>;
    },
  });
}

export function useSalvarFiltro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id_quadro: string;
      usuario_email: string;
      nome: string;
      criterios: import("./types").FiltrosGestao;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_filtros_salvos").insert({
        id_quadro: input.id_quadro,
        usuario_email: input.usuario_email,
        nome: input.nome,
        criterios: input.criterios,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ["gestao", "filtros", vars.id_quadro, vars.usuario_email],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirFiltro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_quadro: string; usuario_email: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_filtros_salvos")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ["gestao", "filtros", vars.id_quadro, vars.usuario_email],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Preferência de visão por (usuario, quadro) ───────────────
export function usePreferenciaVisao(idQuadro: string | null, email: string | null) {
  return useQuery({
    queryKey: ["gestao", "pref", idQuadro ?? "none", email ?? "anon"],
    enabled: !!idQuadro && !!email,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("gestao_preferencias_visao")
        .select("vista, agrupar_por, config")
        .eq("id_quadro", idQuadro!)
        .maybeSingle();
      return (data ?? null) as {
        vista: import("./types").VistaGestao;
        agrupar_por: import("./types").AgruparPor | null;
        config: Record<string, unknown>;
      } | null;
    },
  });
}

export function useSalvarPreferenciaVisao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id_quadro: string;
      usuario_email: string;
      vista?: import("./types").VistaGestao;
      agrupar_por?: import("./types").AgruparPor | null;
      config?: Record<string, unknown>;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        id_quadro: input.id_quadro,
        usuario_email: input.usuario_email,
        vista: input.vista ?? "quadro",
        agrupar_por: input.agrupar_por ?? null,
        config: input.config ?? {},
      };
      const { error } = await supabase
        .from("gestao_preferencias_visao")
        .upsert(payload as never, {
          onConflict: "usuario_email,id_quadro",
        });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ["gestao", "pref", vars.id_quadro, vars.usuario_email],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Notificações do módulo Gestão ────────────────────────────
export function useGestaoNotificacoes(email: string | null) {
  return useQuery({
    queryKey: ["gestao", "notif", email ?? "anon"],
    enabled: !!email,
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_notificacoes")
        .select("*")
        .eq("lida", false)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoNotificacao[];
    },
    staleTime: 30_000,
  });
}

export function useMarcarNotifLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; email: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_notificacoes")
        .update({ lida: true } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "notif", vars.email] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ─── Tempo (cronômetro + apontamento manual) ──────────────────
export function useTempoTarefa(idTarefa: string | null) {
  return useQuery({
    queryKey: ["gestao", "tempo", idTarefa ?? "none"],
    enabled: !!idTarefa,
    refetchInterval: 30_000, // atualiza pra timers rodando
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_tempo")
        .select("*")
        .eq("id_tarefa", idTarefa!)
        .order("inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoTempo[];
    },
  });
}

// Timer ativo do usuário atual (qualquer tarefa)
export function useTimerAtivo(email: string | null) {
  return useQuery({
    queryKey: ["gestao", "timer-ativo", email ?? "anon"],
    enabled: !!email,
    refetchInterval: 30_000,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("gestao_tempo")
        .select("*")
        .is("fim", null)
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as unknown as import("./types").GestaoTempo) ?? null;
    },
  });
}

export function useIniciarTempo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_tarefa: string; usuario_email: string }) => {
      const supabase = createSupabaseBrowserClient();
      // Fecha timer aberto anterior (se houver)
      await supabase
        .from("gestao_tempo")
        .update({ fim: new Date().toISOString() } as never)
        .eq("usuario_email", input.usuario_email)
        .is("fim", null);
      const { error } = await supabase.from("gestao_tempo").insert({
        id_tarefa: input.id_tarefa,
        usuario_email: input.usuario_email,
        inicio: new Date().toISOString(),
        manual: false,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tempo", vars.id_tarefa] });
      qc.invalidateQueries({ queryKey: ["gestao", "timer-ativo", vars.usuario_email] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePararTempo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      id_tarefa: string;
      usuario_email: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_tempo")
        .update({ fim: new Date().toISOString() } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tempo", vars.id_tarefa] });
      qc.invalidateQueries({ queryKey: ["gestao", "timer-ativo", vars.usuario_email] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddTempoManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id_tarefa: string;
      usuario_email: string;
      inicio: string;
      fim: string;
      descricao?: string;
    }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_tempo").insert({
        id_tarefa: input.id_tarefa,
        usuario_email: input.usuario_email,
        inicio: input.inicio,
        fim: input.fim,
        manual: true,
        descricao: input.descricao ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tempo", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirTempo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_tarefa: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_tempo").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "tempo", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Dependências ─────────────────────────────────────────────
export function useDependencias(idTarefa: string | null) {
  return useQuery({
    queryKey: ["gestao", "deps", idTarefa ?? "none"],
    enabled: !!idTarefa,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_dependencias")
        .select("*")
        .eq("id_tarefa", idTarefa!);
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoDependencia[];
    },
  });
}

export function useAddDependencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_tarefa: string; depende_de: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_dependencias").insert({
        id_tarefa: input.id_tarefa,
        depende_de: input.depende_de,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "deps", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirDependencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_tarefa: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_dependencias").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "deps", vars.id_tarefa] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Retorna true se as dependências permitem concluir esta tarefa
export async function checaPodeConcluir(idTarefa: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(
    "gestao_pode_concluir" as never,
    { p_id_tarefa: idTarefa } as never
  );
  if (error) return true; // fallback permissivo se RPC falhar
  return !!data;
}

// ─── Automações ────────────────────────────────────────────────
export function useAutomacoes(idQuadro: string | null) {
  return useQuery({
    queryKey: ["gestao", "automacoes", idQuadro ?? "none"],
    enabled: !!idQuadro,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_automacoes")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoAutomacao[];
    },
  });
}

export function useSalvarAutomacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<import("./types").GestaoAutomacao> & {
        nome: string;
        gatilho: import("./types").GatilhoAutomacao;
        id_quadro: string;
        acao: import("./types").GestaoAutomacao["acao"];
      }
    ) => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id) {
        const { error } = await supabase
          .from("gestao_automacoes")
          .update({
            nome: dados.nome,
            ativo: dados.ativo ?? true,
            gatilho: dados.gatilho,
            condicao: dados.condicao ?? {},
            acao: dados.acao,
            ordem: dados.ordem ?? 0,
          } as never)
          .eq("id", dados.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("gestao_automacoes").insert({
        id_quadro: dados.id_quadro,
        nome: dados.nome,
        ativo: dados.ativo ?? true,
        gatilho: dados.gatilho,
        condicao: dados.condicao ?? {},
        acao: dados.acao,
        ordem: dados.ordem ?? 0,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "automacoes", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirAutomacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_quadro: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_automacoes").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "automacoes", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Formulários públicos ─────────────────────────────────────
export function useFormulariosQuadro(idQuadro: string | null) {
  return useQuery({
    queryKey: ["gestao", "formularios", idQuadro ?? "none"],
    enabled: !!idQuadro,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("gestao_formularios")
        .select("*")
        .eq("id_quadro", idQuadro!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as import("./types").GestaoFormulario[];
    },
  });
}

export function useSalvarFormulario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      dados: Partial<import("./types").GestaoFormulario> & {
        titulo: string;
        id_quadro: string;
        token: string;
      }
    ) => {
      const supabase = createSupabaseBrowserClient();
      if (dados.id) {
        const { error } = await supabase
          .from("gestao_formularios")
          .update({
            titulo: dados.titulo,
            descricao: dados.descricao ?? null,
            ativo: dados.ativo ?? true,
            mostra_descricao: dados.mostra_descricao ?? true,
            mostra_prazo: dados.mostra_prazo ?? false,
            mostra_prioridade: dados.mostra_prioridade ?? false,
            prioridade_padrao: dados.prioridade_padrao ?? "Media",
            status_inicial: dados.status_inicial ?? null,
            responsavel_padrao: dados.responsavel_padrao ?? null,
            etiquetas_padrao: dados.etiquetas_padrao ?? [],
            perguntas: dados.perguntas ?? [],
          } as never)
          .eq("id", dados.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("gestao_formularios").insert({
        id_quadro: dados.id_quadro,
        titulo: dados.titulo,
        descricao: dados.descricao ?? null,
        token: dados.token,
        ativo: dados.ativo ?? true,
        mostra_descricao: dados.mostra_descricao ?? true,
        mostra_prazo: dados.mostra_prazo ?? false,
        mostra_prioridade: dados.mostra_prioridade ?? false,
        prioridade_padrao: dados.prioridade_padrao ?? "Media",
        status_inicial: dados.status_inicial ?? null,
        responsavel_padrao: dados.responsavel_padrao ?? null,
        etiquetas_padrao: dados.etiquetas_padrao ?? [],
        perguntas: dados.perguntas ?? [],
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "formularios", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExcluirFormulario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; id_quadro: string }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("gestao_formularios").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["gestao", "formularios", vars.id_quadro] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── ICS token do quadro (feed calendário) ────────────────────
export function useDefinirIcsToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id_quadro: string; token: string | null }) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("gestao_quadros")
        .update({ ics_token: input.token } as never)
        .eq("id_quadro", input.id_quadro);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gestao", "quadros"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// Utility client-side pra escolher a prioridade default
export function proximaPrioridade(p: PrioridadeTarefa): PrioridadeTarefa {
  const seq: PrioridadeTarefa[] = ["Baixa", "Media", "Alta", "Urgente"];
  const idx = seq.indexOf(p);
  return seq[(idx + 1) % seq.length];
}
