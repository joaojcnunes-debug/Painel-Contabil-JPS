"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { PRIORIDADES, type PrioridadeTarefa } from "@/lib/gestao/types";

type Form = {
  titulo: string;
  descricao: string | null;
  mostra_descricao: boolean;
  mostra_prazo: boolean;
  mostra_prioridade: boolean;
  ativo: boolean;
  perguntas: Array<{
    id: string;
    label: string;
    tipo: string;
    obrigatoria?: boolean;
  }>;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function FormularioPublico({ token, form }: { token: string; form: Form }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>("Media");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-sm";

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!titulo.trim()) {
      setErro("Título é obrigatório");
      return;
    }
    // Validar obrigatórias
    for (const p of form.perguntas ?? []) {
      if (p.obrigatoria && !respostas[p.id]?.trim()) {
        setErro(`Preencha: ${p.label}`);
        return;
      }
    }
    setEnviando(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gestao-form-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          titulo: titulo.trim(),
          descricao: form.mostra_descricao ? descricao.trim() : undefined,
          prazo: form.mostra_prazo ? prazo || undefined : undefined,
          prioridade: form.mostra_prioridade ? prioridade : undefined,
          respostas: (form.perguntas ?? []).map((p) => ({
            id: p.id,
            label: p.label,
            valor: respostas[p.id] ?? "",
          })),
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setErro(data.error ?? "Erro ao enviar");
        return;
      }
      setSucesso(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="bg-white border border-card-border rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <CheckCircle2 size={40} className="text-verde-primary mx-auto mb-3" />
          <h1 className="font-serif text-xl text-verde-dark mb-1">Recebido!</h1>
          <p className="text-sm text-gray-600">
            Sua solicitação foi enviada. Nossa equipe vai analisar em breve.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg py-10 px-4">
      <div className="max-w-lg mx-auto bg-white border border-card-border rounded-xl p-6 shadow-sm">
        <h1 className="font-serif text-2xl text-verde-dark mb-1">{form.titulo}</h1>
        {form.descricao && (
          <p className="text-sm text-gray-600 mb-5 whitespace-pre-line">
            {form.descricao}
          </p>
        )}

        <form onSubmit={submeter} className="space-y-3">
          <div>
            <label className="block text-xs uppercase text-gray-500 mb-1">
              Título <span className="text-red-alert">*</span>
            </label>
            <input
              className={inputCls}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />
          </div>

          {form.mostra_descricao && (
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1">
                Descrição
              </label>
              <textarea
                className={`${inputCls} min-h-[100px]`}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>
          )}

          {(form.perguntas ?? []).map((p) => (
            <div key={p.id}>
              <label className="block text-xs uppercase text-gray-500 mb-1">
                {p.label}
                {p.obrigatoria && <span className="text-red-alert"> *</span>}
              </label>
              {p.tipo === "textarea" ? (
                <textarea
                  className={`${inputCls} min-h-[80px]`}
                  value={respostas[p.id] ?? ""}
                  onChange={(e) =>
                    setRespostas({ ...respostas, [p.id]: e.target.value })
                  }
                />
              ) : (
                <input
                  type={p.tipo === "email" ? "email" : "text"}
                  className={inputCls}
                  value={respostas[p.id] ?? ""}
                  onChange={(e) =>
                    setRespostas({ ...respostas, [p.id]: e.target.value })
                  }
                />
              )}
            </div>
          ))}

          {form.mostra_prazo && (
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1">
                Prazo desejado
              </label>
              <input
                type="date"
                className={inputCls}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>
          )}

          {form.mostra_prioridade && (
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1">
                Prioridade
              </label>
              <select
                className={inputCls}
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
              >
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-alert">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-verde-primary text-white rounded-lg py-2.5 font-medium hover:bg-verde-accent disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </form>

        <div className="text-[10px] text-center text-gray-400 mt-6">
          Formulário via JSP Contabilidade — Painel Gestão
        </div>
      </div>
    </div>
  );
}
