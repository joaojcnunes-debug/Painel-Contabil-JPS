import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #4A5326 0%, #2A3014 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, serif",
          color: "#D9B776",
        }}
      >
        <div
          style={{
            fontSize: 90,
            fontWeight: 700,
            letterSpacing: -3,
          }}
        >
          JSP
        </div>
      </div>
    ),
    { ...size }
  );
}
