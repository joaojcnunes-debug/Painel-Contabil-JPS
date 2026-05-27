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
    slug: "esocial",
    acoes: [
      { id: "listar_pendentes", label: "Listar eventos pendentes" },
      { id: "enviar_eventos", label: "Enviar lote de eventos" },
      { id: "listar_enviados", label: "Histórico de lotes enviados" },
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
    slug: "efd-reinf",
    acoes: [
      { id: "listar_pendentes_r4000", label: "Listar eventos R-4000 pendentes" },
      { id: "listar_servicos_tomados", label: "Serviços tomados (R-4020)" },
      { id: "consultar_retencoes", label: "Retenções do período" },
      { id: "consultar_vinculo_dctfweb", label: "Vínculo com DCTFWeb" },
    ],
  },
  {
    id: "SPED",
    nome: "SPED",
    curto: "SPED",
    descricao:
      "ECD, ECF, EFD ICMS/IPI, EFD Contribuições. Importação, leitura e validação de arquivos TXT.",
    cor: "from-amber-50 to-white border-amber-200",
    slug: "sped",
    acoes: [
      { id: "validar_txt", label: "Validar arquivo TXT" },
      { id: "consultar_ecd", label: "ECD (Contábil Digital)" },
      { id: "consultar_ecf", label: "ECF (Contábil Fiscal)" },
      { id: "consultar_efd_icms", label: "EFD ICMS/IPI" },
      { id: "consultar_efd_contribuicoes", label: "EFD Contribuições" },
    ],
  },
  {
    id: "NOTAS_FISCAIS",
    nome: "Notas Fiscais",
    curto: "NFs",
    descricao:
      "NF-e, NFS-e, NFC-e, CT-e, MDF-e. Captura de XML, armazenamento, manifestação do destinatário.",
    cor: "from-teal-50 to-white border-teal-200",
    slug: "notas-fiscais",
    acoes: [
      { id: "baixar_xmls_sefaz", label: "Baixar XMLs novos da SEFAZ" },
      { id: "listar_pendentes_manifestacao", label: "Pendentes de manifestação" },
      { id: "consultar_historico_manifestadas", label: "Histórico de manifestações" },
      { id: "consultar_outros_documentos", label: "NFC-e / CT-e / MDF-e" },
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
