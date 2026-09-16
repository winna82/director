import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full min-h-40 resize-y rounded-lg bg-paper px-4 py-3 text-base leading-relaxed text-paper-fg placeholder:text-paper-muted",
        "border border-border-strong outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
