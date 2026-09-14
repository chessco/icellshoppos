import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          Pro Buyer
        </div>
        <div style={{ color: "#94a3b8", fontSize: 30 }}>
          Smart POS for Cell Phone Resellers
        </div>
        <div
          style={{
            marginTop: 32,
            color: "#475569",
            fontSize: 20,
            textAlign: "center",
            maxWidth: 700,
          }}
        >
          Inventory · Sales · Purchase Orders · Pricing · Receipts
        </div>
      </div>
    )
  );
}
