import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
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
          background: "#1D2A5C",
          color: "#F6F5F1",
          fontSize: 200,
          fontWeight: 800,
          letterSpacing: -8,
        }}
      >
        TAR
      </div>
    ),
    size,
  );
}
