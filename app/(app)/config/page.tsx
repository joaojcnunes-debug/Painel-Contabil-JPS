"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  CalendarCheck,
  MailCheck,
  Receipt,
  Save,
  Send,
  Settings2,
  ShieldCheck,
} from "lucide-react";
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

  const [emailTeste, setEmailTeste] = useState("");
  const alertasObrig = useAlertaMutation(
    "enviar-alertas-vencimento",
    emailTeste
  );
  const alertasFat = useAlertaMutation("enviar-alertas-faturas", emailTeste);

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

          <div className="bg-white border border-card-border rounded-xl p-5">
            <h3 className="font-serif text-sm font-semibold text-verde-dark mb-3 flex items-center gap-2">
              <MailCheck size={14} className="text-gold" /> Alertas por e-mail
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              E-mail de teste (usado por ambos):
            </p>
            <input
              className={`${inputClass} text-xs mb-4`}
              value={emailTeste}
              onChange={(e) => setEmailTeste(e.target.value)}
              placeholder="seu-email@..."
              type="email"
            />

            <BlocoAlerta
              icon={CalendarCheck}
              titulo="Obrigações vencendo"
              descricao="Avisa cliente sobre prazos fiscais (DAS, DCTF, eSocial...)"
              mutation={alertasObrig}
              emailTeste={emailTeste}
              confirmTxt="Enviar e-mails REAIS de obrigações para todos os clientes com vencimentos próximos?"
            />

            <div className="my-4 border-t border-card-border" />

            <BlocoAlerta
              icon={Receipt}
              titulo="Faturas a vencer"
              descricao="Cobrança de honorários em aberto/atrasados"
              mutation={alertasFat}
              emailTeste={emailTeste}
              confirmTxt="Enviar e-mails REAIS de cobrança para todos os clientes com faturas em aberto/atrasadas?"
            />

            <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
              Precisa das Edge Functions <code>enviar-alertas-vencimento</code> e{" "}
              <code>enviar-alertas-faturas</code> deployadas + secret{" "}
              <code>RESEND_API_KEY</code>.
            </p>
          </div>

          <div className="bg-verde-light border border-verde-border rounded-xl p-5 text-sm text-verde-dark">
            <h3 className="font-serif text-sm font-semibold mb-2">
              Pré-requisitos do banco
            </h3>
            <p className="text-xs text-verde-dark/80">
              Migrations <code>02_configuracoes.sql</code> precisa estar
              aplicada no Supabase pra essa tela funcionar.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BlocoAlerta({
  icon: Icon,
  titulo,
  descricao,
  mutation,
  emailTeste,
  confirmTxt,
}: {
  icon: React.ElementType;
  titulo: string;
  descricao: string;
  mutation: ReturnType<typeof useAlertaMutation>;
  emailTeste: string;
  confirmTxt: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gold" />
        <h4 className="text-sm font-semibold text-verde-dark">{titulo}</h4>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">{descricao}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <Button
          type="button"
          variant="secondary"
          onClick={() => mutation.mutate("dry_run")}
          disabled={mutation.isPending}
          className="text-xs px-2 py-1.5 flex items-center justify-center gap-1"
          title="Não envia, só simula"
        >
          <Send size={11} /> Simular
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => mutation.mutate("test_to")}
          disabled={mutation.isPending || !emailTeste.trim()}
          className="text-xs px-2 py-1.5"
        >
          Teste
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (confirm(confirmTxt)) mutation.mutate("real");
          }}
          disabled={mutation.isPending}
          className="text-xs px-2 py-1.5"
        >
          {mutation.isPending ? "..." : "Enviar"}
        </Button>
      </div>
    </div>
  );
}

// Factory de mutation pra alertas — compartilhada pelos 2 botões.
function useAlertaMutation(funcName: string, emailTeste: string) {
  return useMutation({
    mutationFn: async (modo: "dry_run" | "test_to" | "real") => {
      const supabase = createSupabaseBrowserClient();
      const body: Record<string, unknown> = {};
      if (modo === "dry_run") body.dry_run = true;
      if (modo === "test_to") {
        if (!emailTeste.trim()) throw new Error("Informe o e-mail de teste");
        body.to = emailTeste.trim();
      }
      const { data, error } = await supabase.functions.invoke(funcName, { body });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.text === "function") {
            const txt = await ctx.text();
            const j = JSON.parse(txt);
            if (j?.error) msg = j.error;
          }
        } catch {
          /* mantém msg padrão */
        }
        throw new Error(msg);
      }
      return data as {
        ok: boolean;
        modo: string;
        enviados: number;
        sem_email: number;
        falhas: Array<{ cliente: string; erro: string }>;
        mensagem?: string;
      };
    },
    onSuccess: (r) => {
      if (r.mensagem) {
        toast.success(r.mensagem);
      } else {
        toast.success(
          `${r.enviados} email${r.enviados === 1 ? "" : "s"} ${r.modo === "dry_run" ? "(simulação)" : "enviado" + (r.enviados === 1 ? "" : "s")}${r.sem_email ? ` — ${r.sem_email} sem e-mail` : ""}`
        );
      }
      if (r.falhas && r.falhas.length > 0) {
        toast.error(
          `${r.falhas.length} falha${r.falhas.length === 1 ? "" : "s"}: ${r.falhas[0].erro}`
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
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
