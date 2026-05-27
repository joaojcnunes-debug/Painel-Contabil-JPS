import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

// Ícone PWA — placa oliva deep com "JSP" brass serifado.
// Mesma identidade do componente Logo SVG.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #4A5326 0%, #2A3014 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 28,
          fontFamily: "Georgia, serif",
          color: "#D9B776",
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          JSP
        </div>
      </div>
    ),
    { ...size }
  );
}
