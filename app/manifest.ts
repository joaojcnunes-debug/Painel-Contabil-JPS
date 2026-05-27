import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JSP Contabilidade Personalizada",
    short_name: "JSP",
    description:
      "Sistema interno e portal cliente da JSP Contabilidade Personalizada",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F4EFE0",
    theme_color: "#4A5326",
    lang: "pt-BR",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
