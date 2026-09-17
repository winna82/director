import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionItem = {
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
};

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-surface";

/** The ⋯ menu on reels, scenes and takes. */
export function ActionMenu({ label, items }: { label: string; items: ActionItem[] }) {
  return (
    // Non-modal so a confirm dialog opened from an item doesn't inherit a locked page.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="grid size-9 shrink-0 place-items-center rounded-md text-subtle hover:bg-bg hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-border bg-raised p-1 text-fg shadow-2xl"
        >
          {items.map(({ label: itemLabel, icon: Icon, onSelect, href, danger }) =>
            href ? (
              <DropdownMenu.Item key={itemLabel} asChild className={itemClass}>
                <a href={href} download>
                  <Icon className="size-4 text-muted" />
                  {itemLabel}
                </a>
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item
                key={itemLabel}
                onSelect={onSelect}
                className={cn(itemClass, danger && "text-danger")}
              >
                <Icon className={cn("size-4", danger ? "text-danger" : "text-muted")} />
                {itemLabel}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
