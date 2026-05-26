"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  currentUrl: string | null | undefined;
};

export function LogoUpload({ currentUrl }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function onPick() {
    inputRef.current?.click();
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const supabase = createSupabaseBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `escritorio/logo-${Date.now()}.${ext}`;

      // Upload
      const { error: errUp } = await supabase.storage
        .from("logos")
        .upload(path, file, {
          cacheControl: "60",
          upsert: true,
          contentType: file.type || "image/png",
        });
      if (errUp) throw new Error(errUp.message);

      const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
      const newUrl = pub?.publicUrl;
      if (!newUrl) throw new Error("Não foi possível obter URL pública");

      const { error: errCfg } = await supabase
        .from("configuracoes")
        .update({
          logo_url: newUrl,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", 1);
      if (errCfg) throw new Error(errCfg.message);

      return newUrl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["configuracao"] });
      toast.success("Logo atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setUploading(false),
  });

  const remover = useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("configuracoes")
        .update({
          logo_url: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["configuracao"] });
      toast.success("Logo removida — voltou pro padrão");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (PNG, JPG, SVG, WEBP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande — máximo 2 MB");
      return;
    }
    setUploading(true);
    upload.mutate(file);
    e.target.value = "";
  }

  return (
    <div className="bg-white border border-card-border rounded-xl p-5">
      <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3 flex items-center gap-2">
        <ImageIcon size={14} className="text-gold" /> Logo do escritório
      </h3>

      <div className="flex items-center gap-4 mb-4">
        <div className="w-20 h-20 rounded-lg border border-card-border bg-app-bg flex items-center justify-center overflow-hidden">
          <Logo size={72} src={currentUrl ?? null} showSubtitle={false} />
        </div>
        <div className="flex-1 text-xs text-gray-500">
          {currentUrl
            ? "Logo customizada ativa. Aparece no login e na sidebar."
            : "Usando logo padrão JSP. Suba um arquivo pra substituir."}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        onChange={onChange}
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onPick}
          disabled={uploading || upload.isPending}
          className="flex items-center justify-center gap-2 text-xs"
        >
          <Upload size={12} />
          {uploading || upload.isPending ? "Enviando..." : "Trocar"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (!currentUrl) {
              toast.error("Não há logo customizada");
              return;
            }
            if (confirm("Remover a logo customizada?")) remover.mutate();
          }}
          disabled={remover.isPending || !currentUrl}
          className="flex items-center justify-center gap-2 text-xs"
        >
          <Trash2 size={12} /> Remover
        </Button>
      </div>

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        PNG, JPG, SVG ou WEBP até 2 MB. Recomendado: imagem quadrada
        (300×300 ou maior).
      </p>
    </div>
  );
}
