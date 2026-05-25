"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Save, Settings2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { useConfiguracao } from "@/lib/hooks/useConfiguracao";
import { useUserStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ConfigPage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = user?.perfil === "Admin";
  const { data: cfg, isLoading } = useConfiguracao();
  const qc = useQueryClient();

  const [nome, setNome] = useState("");
  const [razao, setRazao] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [site, setSite] = useState("");
  const [dia, setDia] = useState("10");
  const [logo, setLogo] = useState("");
  const [msgLogin, setMsgLogin] = useState("");

  useEffect(() => {
    if (!cfg) return;
    setNome(cfg.nome_escritorio ?? "");
    setRazao(cfg.razao_social ?? "");
    setCnpj(cfg.cnpj ?? "");
    setEndereco(cfg.endereco ?? "");
    setTelefone(cfg.telefone ?? "");
    setEmail(cfg.email ?? "");
    setSite(cfg.site ?? "");
    setDia(String(cfg.dia_padrao_fechamento ?? 10));
    setLogo(cfg.logo_url ?? "");
    setMsgLogin(cfg.mensagem_login ?? "");
  }, [cfg]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome do escritório é obrigatório");
      const diaNum = Number(dia);
      if (!isFinite(diaNum) || diaNum < 1 || diaNum > 31) {
        throw new Error("Dia padrão deve estar entre 1 e 31");
      }
      const supabase = createSupabaseBrowserClient();
      const payload = {
        nome_escritorio: nome.trim(),
        razao_social: razao.trim() || null,
        cnpj: cnpj.replace(/\D/g, "") || null,
        endereco: endereco.trim() || null,
        telefone: telefone.trim() || null,
        email: email.trim().toLowerCase() || null,
        site: site.trim() || null,
        dia_padrao_fechamento: diaNum,
        logo_url: logo.trim() || null,
        mensagem_login: msgLogin.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("configuracoes")
        .update(payload as never)
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["configuracao"] });
      toast.success("Configurações salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    salvar.mutate();
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Configurações" />
        <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
          Apenas administradores podem alterar as configurações do escritório.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Dados do escritório e parâmetros do sistema"
        actions={
          <Button
            onClick={onSubmit}
            disabled={salvar.isPending || isLoading}
            className="flex items-center gap-2"
          >
            <Save size={16} /> {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={onSubmit}
          className="lg:col-span-2 space-y-6"
        >
          <Bloco title="Identificação do escritório">
            <Field label="Nome de exibição" required>
              <input
                className={inputClass}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="JSP Contabilidade Personalizada"
              />
            </Field>
            <Field label="Razão social">
              <input
                className={inputClass}
                value={razao}
                onChange={(e) => setRazao(e.target.value)}
              />
            </Field>
            <Field label="CNPJ">
              <input
                className={inputClass}
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </Field>
            <Field label="Endereço completo">
              <textarea
                className={`${inputClass} min-h-[70px]`}
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </Field>
          </Bloco>

          <Bloco title="Contato">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Telefone">
                <input
                  className={inputClass}
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Site">
              <input
                className={inputClass}
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="https://..."
              />
            </Field>
          </Bloco>

          <Bloco title="Parâmetros do sistema">
            <Field
              label="Dia padrão de vencimento (honorários)"
              hint="Usado no gerador de faturas quando o cliente não tem dia configurado"
            >
              <input
                className={inputClass}
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field
              label="URL da logo (opcional)"
              hint="Cole uma URL pública pra substituir a logo SVG padrão"
            >
              <input
                className={inputClass}
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://..."
              />
            </Field>
            <Field
              label="Mensagem no login (opcional)"
              hint="Texto adicional exibido na tela de acesso"
            >
              <textarea
                className={`${inputClass} min-h-[60px]`}
                value={msgLogin}
                onChange={(e) => setMsgLogin(e.target.value)}
              />
            </Field>
          </Bloco>
        </form>

        <aside className="space-y-4">
          <div className="bg-white border border-card-border rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3 flex items-center gap-2">
              <Settings2 size={14} className="text-gold" /> Atalhos
            </h3>
            <div className="space-y-2 text-sm">
              <Atalho
                href="/usuarios"
                title="Usuários"
                desc="Gerenciar logins da equipe e clientes"
                icon={ShieldCheck}
              />
              <Atalho
                href="/obrigacoes/catalogo"
                title="Catálogo de obrigações"
                desc="DAS, DCTF, SPED e demais itens fiscais"
                icon={Settings2}
              />
            </div>
          </div>

          <div className="bg-verde-light border border-verde-border rounded-xl p-5 text-sm text-verde-dark">
            <h3 className="font-serif text-sm font-semibold mb-2">
              Pré-requisitos do banco
            </h3>
            <p className="text-xs text-verde-dark/80 mb-2">
              Pra essa tela funcionar, a migration <code>02_configuracoes.sql</code> precisa ter rodado no SQL Editor do Supabase.
            </p>
            <p className="text-xs text-verde-dark/80">
              Se você ver erro &quot;table not found&quot; ao salvar, rode o arquivo em
              {" "}<code>supabase/migrations/02_configuracoes.sql</code>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bloco({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-card-border rounded-xl p-5">
      <h3 className="font-serif text-sm font-semibold text-verde-dark mb-4">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Atalho({
  href,
  title,
  desc,
  icon: Icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition"
    >
      <Icon size={16} className="text-gold mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-800">{title}</div>
        <div className="text-xs text-gray-500">{desc}</div>
      </div>
    </Link>
  );
}
