import { ImageResponse } from "next/og";
// Clientizza brand mark — purple rounded square with a "C" monogram.
// Next.js renders this at build time and auto-injects <link rel="icon">
// into <head>. Matches the sidebar logo in
// `src/components/layout/sidebar.tsx` — update both together if the
// brand color or mark changes.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7c3aed",
          borderRadius: 6,
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "sans-serif",
            lineHeight: 1,
          }}
        >
          C
        </span>
      </div>
    ),
    { ...size },
  );
}
