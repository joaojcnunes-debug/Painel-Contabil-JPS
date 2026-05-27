// Registry estático dos 10 módulos de integração.
// É a "fonte da verdade" pro painel renderizar os cards.

import type { ModuloMeta } from "./types";

export const MODULOS: ModuloMeta[] = [
  {
    id: "RECEITA_FEDERAL",
    nome: "Receita Federal / e-CAC",
    curto: "RF / e-CAC",
    descricao:
      "Consulta de pendências, situação fiscal, débitos, DCTFWeb, PER/DCOMP, caixa postal, DARF e certidões.",
    cor: "from-blue-50 to-white border-blue-200",
    slug: "receita-federal",
    acoes: [
      { id: "consultar_situacao_fiscal", label: "Consultar situação fiscal" },
      { id: "consultar_pendencias", label: "Listar pendências" },
      { id: "consultar_dctfweb", label: "Consultar DCTFWeb" },
      { id: "consultar_caixa_postal", label: "Caixa postal e-CAC" },
      { id: "emitir_certidao", label: "Emitir CND/CPEN" },
    ],
  },
  {
    id: "ESOCIAL",
    nome: "eSocial",
    curto: "eSocial",
    descricao:
      "Eventos trabalhistas (S-2200/S-2299), eventos de folha (S-1200) e eventos SST (S-2210 CAT, S-2220 ASO, S-2240 riscos).",
    cor: "from-emerald-50 to-white border-emerald-200",
    acoes: [
      { id: "validar_eventos", label: "Validar eventos pendentes" },
      { id: "enviar_eventos", label: "Enviar lote de eventos" },
      { id: "consultar_recibo", label: "Consultar recibo de entrega" },
      { id: "gerar_xml_sst", label: "Gerar XMLs SST (S-2210/2220/2240)" },
    ],
  },
  {
    id: "EFD_REINF",
    nome: "EFD-Reinf",
    curto: "EFD-Reinf",
    descricao:
      "Serviços tomados/prestados, retenções, série R-4000 e integração com DCTFWeb.",
    cor: "from-purple-50 to-white border-purple-200",
    acoes: [
      { id: "gerar_r4000", label: "Gerar eventos R-4000" },
      { id: "enviar_reinf", label: "Enviar à Receita" },
      { id: "consultar_retencoes", label: "Listar retenções do período" },
    ],
  },
  {
    id: "SPED",
    nome: "SPED",
    curto: "SPED",
    descricao:
      "ECD, ECF, EFD ICMS/IPI, EFD Contribuições. Importação, leitura e validação de arquivos TXT.",
    cor: "from-amber-50 to-white border-amber-200",
    acoes: [
      { id: "validar_txt", label: "Validar arquivo TXT" },
      { id: "gerar_ecd", label: "Gerar ECD do período" },
      { id: "gerar_ecf", label: "Gerar ECF anual" },
      { id: "gerar_efd_contribuicoes", label: "Gerar EFD Contribuições" },
    ],
  },
  {
    id: "NOTAS_FISCAIS",
    nome: "Notas Fiscais",
    curto: "NFs",
    descricao:
      "NF-e, NFS-e, NFC-e, CT-e, MDF-e. Captura de XML, armazenamento, manifestação do destinatário.",
    cor: "from-teal-50 to-white border-teal-200",
    acoes: [
      { id: "baixar_xmls_sefaz", label: "Baixar XMLs SEFAZ (Manifestação)" },
      { id: "consultar_nfse_municipio", label: "Consultar NFS-e do município" },
      { id: "validar_xmls_armazenados", label: "Validar XMLs armazenados" },
    ],
  },
  {
    id: "SIMPLES_NACIONAL",
    nome: "Simples Nacional",
    curto: "SN",
    descricao:
      "PGDAS-D, DEFIS, DAS, parcelamentos, sublimite e pendências.",
    cor: "from-lime-50 to-white border-lime-200",
    slug: "simples-nacional",
    acoes: [
      { id: "consultar_pgdas", label: "Consultar PGDAS-D do período" },
      { id: "gerar_das", label: "Gerar DAS" },
      { id: "consultar_parcelamentos", label: "Listar parcelamentos" },
      { id: "checar_sublimite", label: "Checar sublimite estadual" },
    ],
  },
  {
    id: "FGTS_DIGITAL",
    nome: "FGTS Digital / Caixa",
    curto: "FGTS",
    descricao:
      "Guias, débitos, integração com eventos eSocial e Conectividade Social ICP.",
    cor: "from-cyan-50 to-white border-cyan-200",
    slug: "fgts-digital",
    acoes: [
      { id: "gerar_guias", label: "Gerar guias FGTS" },
      { id: "consultar_guias_fgts", label: "Listar guias do período" },
      { id: "consultar_debitos", label: "Consultar débitos FGTS" },
      { id: "conciliar_esocial", label: "Conciliar com eSocial" },
      { id: "emitir_crf", label: "Emitir CRF" },
    ],
  },
  {
    id: "PREFEITURAS",
    nome: "Prefeituras / ISS",
    curto: "Prefeituras",
    descricao:
      "NFS-e por município, ISS, CND Municipal. Endpoints diferentes por prefeitura.",
    cor: "from-rose-50 to-white border-rose-200",
    acoes: [
      { id: "consultar_nfse", label: "Consultar NFS-e emitidas" },
      { id: "consultar_iss", label: "Consultar ISS devido" },
      { id: "consultar_cnd_municipal", label: "Emitir CND municipal" },
    ],
  },
  {
    id: "REDESIM",
    nome: "REDESIM / Junta Comercial",
    curto: "REDESIM",
    descricao:
      "Abertura, alteração, baixa, DBE, viabilidade e protocolos.",
    cor: "from-indigo-50 to-white border-indigo-200",
    acoes: [
      { id: "consultar_protocolos", label: "Consultar protocolos abertos" },
      { id: "consultar_viabilidade", label: "Consultar viabilidade" },
      { id: "gerar_dbe", label: "Gerar DBE" },
    ],
  },
  {
    id: "CERTIFICADO_DIGITAL",
    nome: "Certificado Digital",
    curto: "Cert. Digital",
    descricao:
      "A1/A3, procurações e-CAC, validade, alertas de expiração.",
    cor: "from-gray-50 to-white border-gray-300",
    acoes: [
      { id: "listar_certificados", label: "Listar certificados cadastrados" },
      { id: "checar_vencimentos", label: "Checar próximos vencimentos" },
    ],
  },
];

export function getModulo(
  id: string
): ModuloMeta | undefined {
  return MODULOS.find((m) => m.id === id);
}
