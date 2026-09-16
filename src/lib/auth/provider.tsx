import type { ReactNode } from "react";
import { Toaster } from "sonner";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast: "border-border bg-surface text-fg",
          },
        }}
      />
    </>
  );
}
