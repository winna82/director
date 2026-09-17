import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Destructive confirmation that stays open (and locked) while the action runs. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 text-fg shadow-2xl">
          <AlertDialog.Title className="font-display text-2xl leading-tight tracking-tight">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="ghost" size="sm" disabled={busy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button type="button" variant="rec" size="sm" disabled={busy} onClick={onConfirm}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
