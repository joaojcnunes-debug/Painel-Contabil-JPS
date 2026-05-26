type LogoProps = {
  size?: number;
  showSubtitle?: boolean;
  className?: string;
  src?: string | null; // override com URL externa (configuracoes.logo_url)
};

// Marca da JSP: placa quadrada deep-oliva, "JSP" em serifa pesada brass,
// filete com losango central, subtítulo em caps espacejado.
// Quando src é passado, renderiza a imagem em vez do SVG padrão.
export function Logo({
  size = 96,
  showSubtitle = true,
  className,
  src,
}: LogoProps) {
  if (src) {
    return (
      <img
        src={src}
        alt="JSP Contabilidade"
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  return <LogoSvg size={size} showSubtitle={showSubtitle} className={className} />;
}

function LogoSvg({
  size,
  showSubtitle,
  className,
}: {
  size: number;
  showSubtitle: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="JSP Contabilidade Personalizada"
      role="img"
    >
      <defs>
        <linearGradient id="jsp-plate" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4A5326" />
          <stop offset="100%" stopColor="#2A3014" />
        </linearGradient>
        <linearGradient id="jsp-brass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#D9B776" />
          <stop offset="50%" stopColor="#A88440" />
          <stop offset="100%" stopColor="#6B4F1F" />
        </linearGradient>
      </defs>

      {/* Placa */}
      <rect x="4" y="4" width="192" height="192" rx="10" fill="url(#jsp-plate)" />

      {/* Filete externo brass */}
      <rect
        x="12"
        y="12"
        width="176"
        height="176"
        rx="6"
        fill="none"
        stroke="url(#jsp-brass)"
        strokeWidth="1.5"
      />
      {/* Filete interno bem fino brass (duplo, sensação de timbre) */}
      <rect
        x="18"
        y="18"
        width="164"
        height="164"
        rx="3"
        fill="none"
        stroke="url(#jsp-brass)"
        strokeWidth="0.6"
        opacity="0.6"
      />

      {/* Monograma JSP */}
      <text
        x="100"
        y={showSubtitle ? 113 : 130}
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize={showSubtitle ? 78 : 96}
        fill="url(#jsp-brass)"
        style={{ letterSpacing: "-2px" }}
      >
        JSP
      </text>

      {showSubtitle && (
        <>
          {/* Filete com losango */}
          <line
            x1="42"
            y1="138"
            x2="92"
            y2="138"
            stroke="url(#jsp-brass)"
            strokeWidth="1.2"
          />
          <line
            x1="108"
            y1="138"
            x2="158"
            y2="138"
            stroke="url(#jsp-brass)"
            strokeWidth="1.2"
          />
          <g transform="translate(100 138) rotate(45)">
            <rect x="-3.2" y="-3.2" width="6.4" height="6.4" fill="url(#jsp-brass)" />
          </g>

          {/* Subtítulo */}
          <text
            x="100"
            y="158"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="600"
            fontSize="11"
            fill="url(#jsp-brass)"
            letterSpacing="3"
          >
            CONTABILIDADE
          </text>
          <text
            x="100"
            y="174"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="500"
            fontSize="9"
            fill="url(#jsp-brass)"
            letterSpacing="4"
          >
            PERSONALIZADA
          </text>
        </>
      )}
    </svg>
  );
}
