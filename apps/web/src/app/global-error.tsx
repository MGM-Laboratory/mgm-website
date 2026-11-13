"use client";

import { useEffect } from "react";

// Replaces the root layout when the layout itself throws, so it carries its
// own html and body and uses only inline styles.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 1.5rem",
          fontFamily: "system-ui, sans-serif",
          background: "#fcfcfc",
          color: "#0e1116",
        }}
      >
        <main style={{ maxWidth: "40rem", margin: "0 auto" }}>
          <h1 style={{ fontSize: "2rem", margin: 0 }}>We could not load this page</h1>
          <p style={{ marginTop: "1rem", lineHeight: 1.6 }}>
            The problem is on our side, not yours. Please try again in a moment.
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              border: 0,
              borderRadius: "0.375rem",
              background: "#3a6dc5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
            type="button"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
