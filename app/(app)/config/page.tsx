import { PageHeader } from "@/components/layout/PageHeader";

export default function ConfigPage() {
  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Usuários, catálogo de obrigações e parâmetros gerais"
      />
      <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
        Em construção. As próximas iterações trarão:
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Gestão de usuários (Admin/Contador/Assistente/Cliente)</li>
          <li>Catálogo de obrigações fiscais (DAS, DCTF, SPED, etc)</li>
          <li>Parâmetros do escritório (logo, dados, dia padrão de fechamento)</li>
        </ul>
      </div>
    </div>
  );
}
