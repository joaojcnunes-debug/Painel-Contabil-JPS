"use client";

import { useMemo, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import type { GestaoEspaco, GestaoPasta } from "@/lib/gestao/types";

type Tipo = "espaco" | "pasta" | "quadro";

type Props = {
  tipo: Tipo;
  idEspaco?: string;
  idPasta?: string;
  espacos: GestaoEspaco[];
  pastas: GestaoPasta[];
  onClose: () => void;
  onSubmit: (dados: {
    nome: string;
    cor?: string;
    descricao?: string;
    idEspaco?: string;
    idPasta?: string;
    restrito: boolean;
  }) => void;
};

const CORES = [
  "#006B54",
  "#B45838",
  "#4A6B7B",
  "#8B6A2F",
  "#7A3B7B",
  "#3F4A7B",
];

const TITULOS: Record<Tipo, string> = {
  espaco: "Novo espaço",
  pasta: "Nova pasta",
  quadro: "Novo quadro",
};

export function NovoRecursoModal({
  tipo,
  idEspaco: idEspacoInicial,
  idPasta: idPastaInicial,
  espacos,
  pastas,
  onClose,
  onSubmit,
}: Props) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [idEspaco, setIdEspaco] = useState(idEspacoInicial ?? "");
  const [idPasta, setIdPasta] = useState(idPastaInicial ?? "");
  const [restrito, setRestrito] = useState(false);

  const pastasFiltradas = useMemo(
    () => (idEspaco ? pastas.filter((p) => p.id_espaco === idEspaco) : pastas),
    [idEspaco, pastas]
  );

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    if (tipo === "pasta" && !idEspaco) return;
    onSubmit({
      nome: nome.trim(),
      cor: tipo === "espaco" ? cor : undefined,
      descricao: tipo === "quadro" ? descricao.trim() : undefined,
      idEspaco: tipo === "espaco" ? undefined : idEspaco || undefined,
      idPasta: tipo === "quadro" ? idPasta || undefined : undefined,
      restrito: tipo === "quadro" ? restrito : false,
    });
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={TITULOS[tipo]}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onFormSubmit} disabled={!nome.trim()}>
            Criar
          </Button>
        </div>
      }
    >
      <form onSubmit={onFormSubmit} className="space-y-3">
        <Field label="Nome" required>
          <input
            className={inputClass}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            placeholder={
              tipo === "espaco"
                ? "Ex: Operacional"
                : tipo === "pasta"
                  ? "Ex: Fiscal 2026"
                  : "Ex: Sprint mensal"
            }
          />
        </Field>

        {tipo === "espaco" && (
          <Field label="Cor" hint="Identificação visual na árvore">
            <div className="flex gap-2 flex-wrap">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    cor === c ? "ring-2 ring-offset-2 ring-verde-primary" : ""
                  }`}
                  style={{ background: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </Field>
        )}

        {(tipo === "pasta" || tipo === "quadro") && (
          <Field label={tipo === "pasta" ? "Espaço" : "Espaço (opcional)"} required={tipo === "pasta"}>
            <select
              className={inputClass}
              value={idEspaco}
              onChange={(e) => {
                setIdEspaco(e.target.value);
                setIdPasta("");
              }}
            >
              <option value="">Nenhum (quadro solto)</option>
              {espacos.map((es) => (
                <option key={es.id} value={es.id}>
                  {es.nome}
                </option>
              ))}
            </select>
          </Field>
        )}

        {tipo === "quadro" && idEspaco && pastasFiltradas.length > 0 && (
          <Field label="Pasta (opcional)">
            <select
              className={inputClass}
              value={idPasta}
              onChange={(e) => setIdPasta(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {pastasFiltradas.map((pa) => (
                <option key={pa.id} value={pa.id}>
                  {pa.nome}
                </option>
              ))}
            </select>
          </Field>
        )}

        {tipo === "quadro" && (
          <>
            <Field label="Descrição">
              <textarea
                className={`${inputClass} min-h-[60px]`}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={restrito}
                onChange={(e) => setRestrito(e.target.checked)}
              />
              Quadro <strong>restrito</strong> — só membros com grant explícito
              enxergam
            </label>
          </>
        )}
      </form>
    </Modal>
  );
}
