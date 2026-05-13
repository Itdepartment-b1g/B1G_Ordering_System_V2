import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type HubListSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  className?: string;
};

export function HubListSearchField({
  value,
  onChange,
  onClear,
  className,
}: HubListSearchFieldProps) {
  return (
    <div className={cn("relative max-w-md", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by hub name or address…"
        className="h-10 pl-9 pr-9"
        aria-label="Search hubs"
        autoComplete="off"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
