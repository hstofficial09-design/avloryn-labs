import { ImageResponse } from "next/og";

export const alt = "Avloryn Labs — intelligent software products for people";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand share card. Rendered by Next at build/request — no external fonts.
export default function OpengraphImage() {
  const bg = "#100F0E";
  const warmWhite = "#F4F0E9";
  const muted = "#A8A299";
  const gold = "#CDA86A";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bg,
          padding: "80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* soft gold glow */}
        <div
          style={{
            position: "absolute",
            top: "-160px",
            right: "-120px",
            width: "520px",
            height: "520px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(205,168,106,0.22), rgba(205,168,106,0))",
            display: "flex",
          }}
        />

        {/* top: mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
            <path
              d="M16 5a11 11 0 1 0 10.4 7.3"
              stroke={warmWhite}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="25" cy="7" r="3.4" fill={gold} />
          </svg>
          <span
            style={{
              color: warmWhite,
              fontSize: "30px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Avloryn Labs
          </span>
        </div>

        {/* headline + sub */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              color: warmWhite,
              fontSize: "78px",
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
            }}
          >
            <span>Software that works the</span>
            <span>way people do.</span>
          </div>
          <div
            style={{
              marginTop: "28px",
              color: muted,
              fontSize: "30px",
              letterSpacing: "-0.01em",
              display: "flex",
            }}
          >
            Intelligent software products, built for the long term.
          </div>
        </div>

        {/* footer chip */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: gold,
              display: "flex",
            }}
          />
          <span style={{ color: muted, fontSize: "26px", letterSpacing: "0.01em" }}>
            Livodraft · Private Beta
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
