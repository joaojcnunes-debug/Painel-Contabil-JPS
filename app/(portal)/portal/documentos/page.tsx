import { PageHeader } from "@/components/layout/PageHeader";

export default function PortalDocumentos() {
  return (
    <div>
      <PageHeader
        title="Meus documentos"
        subtitle="Envie notas, extratos e folha para a contabilidade"
        actions={
          <button className="px-4 py-2 bg-verde-primary text-white rounded-lg text-sm font-medium hover:bg-verde-accent">
            + Enviar arquivo
          </button>
        }
      />
      <div className="bg-white border border-card-border rounded-xl p-6 text-sm text-gray-600">
        Em construção.
      </div>
    </div>
  );
}
