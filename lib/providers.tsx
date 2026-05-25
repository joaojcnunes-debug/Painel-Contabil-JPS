"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: { borderRadius: "10px", fontSize: "14px", padding: "12px 16px" },
          success: {
            iconTheme: { primary: "#006B54", secondary: "#fff" },
            style: {
              background: "#e8f5e9",
              color: "#1e4d28",
              border: "1px solid #c8e6c9",
            },
          },
          error: {
            iconTheme: { primary: "#D32F2F", secondary: "#fff" },
            style: {
              background: "#fee2e2",
              color: "#7f1d1d",
              border: "1px solid #fca5a5",
            },
          },
        }}
      />
    </QueryClientProvider>
  );
}
