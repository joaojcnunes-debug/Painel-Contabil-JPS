"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Upload, FileText, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { gerarId, cn } from "@/lib/utils";
import type { Cliente, OrigemDocumento } from "@/lib/supabase/types";

type Props = {
  open: boolean;
  onClose: () => void;
  // Se passado, o modal fica trancado nesse cliente (uso no portal)
  fixedIdCliente?: string;
  // CLIENTE quando portal, CONTABILIDADE quando interno
  origem: OrigemDocumento;
  clientes?: Cliente[];
};

const TIPOS = [
  "Nota Fiscal — Entrada",
  "Nota Fiscal — Saída",
  "Extrato bancário",
  "Folha de pagamento",
  "Comprovante de pagamento",
  "Contrato",
  "Outro",
];

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function DocumentoUploadModal({
  open,
  onClose,
  fixedIdCliente,
  origem,
  clientes = [],
}: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [idCliente, setIdCliente] = useState(fixedIdCliente ?? "");
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [descricao, setDescricao] = useState("");
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIdCliente(fixedIdCliente ?? "");
    setTipo(TIPOS[0]);
    setDescricao("");
    setCompetencia(competenciaAtual());
    setFiles([]);
    setDragOver(false);
  }, [open, fixedIdCliente]);

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  }

  function remover(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (!idCliente) throw new Error("Selecione o cliente");
      if (files.length === 0) throw new Error("Adicione pelo menos 1 arquivo");

      const supabase = createSupabaseBrowserClient();

      for (const file of files) {
        const ts = Date.now();
        const safe = sanitizeName(file.name);
        const path = `${idCliente}/${ts}-${safe}`;

        const { error: errUp } = await supabase.storage
          .from("documentos")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (errUp) throw new Error(`${file.name}: ${errUp.message}`);

        const { error: errIns } = await supabase.from("documentos").insert({
          id_documento: gerarId("DOC"),
          id_cliente: idCliente,
          tipo,
          descricao: descricao.trim() || null,
          competencia: competencia || null,
          arquivo_path: path,
          arquivo_nome: file.name,
          tamanho_bytes: file.size,
          status: "RECEBIDO",
          origem,
        } as never);
        if (errIns) {
          // Reverte storage se metadata falhou
          await supabase.storage.from("documentos").remove([path]);
          throw new Error(`${file.name}: ${errIns.message}`);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documentos"] });
      toast.success(
        `${files.length} arquivo${files.length === 1 ? " enviado" : "s enviados"}`
      );
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    upload.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar documentos"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={upload.isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={upload.isPending || files.length === 0}>
            {upload.isPending
              ? "Enviando..."
              : `Enviar ${files.length || ""} arquivo${files.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!fixedIdCliente && (
          <Field label="Cliente" required>
            <select
              className={inputClass}
              value={idCliente}
              onChange={(e) => setIdCliente(e.target.value)}
            >
              <option value="">Selecione…</option>
              {clientes.map((c) => (
                <option key={c.id_cliente} value={c.id_cliente}>
                  {c.razao_social}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo">
            <select
              className={inputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Competência">
            <input
              type="month"
              className={inputClass}
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Descrição">
          <input
            className={inputClass}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Opcional"
          />
        </Field>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition",
            dragOver
              ? "border-verde-primary bg-verde-light"
              : "border-card-border hover:border-verde-primary hover:bg-verde-light/40"
          )}
        >
          <Upload className="mx-auto text-gold mb-2" size={28} />
          <p className="text-sm text-gray-700">
            <span className="text-verde-dark font-medium">Clique pra escolher</span>
            {" "}ou arraste arquivos aqui
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PDF, imagens, planilhas — sem limite de tipo
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={onPick}
            className="hidden"
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 bg-gray-50 border border-card-border rounded-md px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-gold flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => remover(i)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-500"
                  aria-label="Remover"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}
