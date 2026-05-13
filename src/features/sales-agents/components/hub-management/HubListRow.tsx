import { format } from "date-fns";
import { Calendar, MapPin, UserPlus, Warehouse } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { HubRow } from "./types";

type HubListRowProps = {
  row: HubRow;
  onAssign: (row: HubRow) => void;
};

export function HubListRow({ row, onAssign }: HubListRowProps) {
  const locationText = row.hub_location?.trim() ?? "";
  const hasLocation = Boolean(locationText);
  const creatorName = row.profiles?.full_name ?? null;

  return (
    <TableRow
      className={cn(
        "group border-0 border-b border-border/50 transition-colors duration-200",
        "hover:bg-gradient-to-r hover:from-muted/50 hover:via-muted/30 hover:to-transparent",
        "data-[state=selected]:bg-muted/40",
      )}
    >
      <TableCell className="py-4 pl-6 align-middle">
        <div className="flex items-center gap-3.5">
          <span
            className={cn(
              "text-primary shrink-0",
              "transition-transform duration-200 group-hover:scale-110",
            )}
          >
            <Warehouse
              className="h-[18px] w-[18px]"
              strokeWidth={2}
              aria-hidden
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-snug tracking-tight text-foreground">
              {row.hub_name}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell className="max-w-[min(340px,42vw)] py-4 align-middle">
        {hasLocation ? (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex max-w-full cursor-default items-center gap-2  px-3 py-2 text-sm leading-snug",
                  "transition-all duration-200 group-hover:shadow-md",
                )}
              >
                <span>
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="truncate">{locationText}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              sideOffset={6}
              className="max-w-sm border-0 bg-popover px-3 py-2 text-popover-foreground shadow-lg"
            >
              <p className="text-xs leading-relaxed text-popover-foreground/95">
                {row.hub_location}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="inline-flex items-center rounded-xl bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            No address on file
          </span>
        )}
      </TableCell>

      <TableCell className="max-w-[min(200px,28vw)] py-4 align-middle">
        {row.assigned_team_leader ? (
          <span className="truncate text-sm font-medium text-foreground">
            {row.assigned_team_leader.full_name}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="py-4 align-middle">
        {creatorName ? (
          <div className="flex items-center gap-3">
            <span className="truncate text-xs leading-tight text-foreground">
              {creatorName}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="py-4 align-middle">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <time
            className="whitespace-nowrap text-xs tabular-nums tracking-tight"
            dateTime={row.created_at}
          >
            {format(new Date(row.created_at), "MMM d, yyyy · HH:mm")}
          </time>
        </div>
      </TableCell>

      <TableCell className="py-4 pr-6 text-right align-middle">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-full px-4 font-medium shadow-sm",
            "border border-border/60 bg-background/80 transition-all",
            "hover:border-primary/30 hover:bg-primary/5 hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          onClick={() => onAssign(row)}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          Assign
        </Button>
      </TableCell>
    </TableRow>
  );
}
