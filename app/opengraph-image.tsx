import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// Inline the transparent gold "A" mark as a data URI (Node runtime, build-time read).
const markSrc = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/avloryn-mark.png")
).toString("base64")}`;

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={52} height={46} alt="" />
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
            Livodraft · Now live
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
