import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MapPin, Plus, Search } from "lucide-react";

import { queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  resolveTableSortDirection,
  type TableSortCycleState,
} from "@/features/shared/utils/tableSortCycle";

import { AssignHubDialog } from "./hub-management/AssignHubDialog";
import { CreateHubDialog } from "./hub-management/CreateHubDialog";
import { DeleteHubDialog } from "./hub-management/DeleteHubDialog";
import { EditHubDialog } from "./hub-management/EditHubDialog";
import { ViewHubLocationDialog } from "./hub-management/ViewHubLocationDialog";
import { fetchHubsPage } from "./hub-management/fetchHubsPage";
import {
  DEFAULT_HUB_SORT_DIRECTION,
  DEFAULT_HUB_SORT_KEY,
  type HubSortKey,
} from "./hub-management/hubListSorting";
import { DEFAULT_PAGE_SIZE } from "./hub-management/hubListPagination";
import { HubListPaginationFooter } from "./hub-management/HubListPaginationFooter";
import { HubListRow } from "./hub-management/HubListRow";
import { HubListSearchField } from "./hub-management/HubListSearchField";
import { HubListTableHeader } from "./hub-management/HubListTableHeader";
import type { HubRow } from "./hub-management/types";
import { useDebouncedHubSearch } from "./hub-management/useDebouncedHubSearch";

export default function HubManagementList() {
  const [createOpen, setCreateOpen] = useState(false);
  const [assignHub, setAssignHub] = useState<HubRow | null>(null);
  const [viewHub, setViewHub] = useState<HubRow | null>(null);
  const [editHub, setEditHub] = useState<HubRow | null>(null);
  const [deleteHub, setDeleteHub] = useState<HubRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const { searchInput, setSearchInput, debouncedSearch, clearSearch } =
    useDebouncedHubSearch();
  const [sortState, setSortState] =
    useState<TableSortCycleState<HubSortKey>>(createInitialTableSortCycle);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_HUB_SORT_KEY,
        DEFAULT_HUB_SORT_DIRECTION
      ),
    [sortState]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortState]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["hubs", page, pageSize, debouncedSearch, resolvedSortKey, resolvedSortDirection],
    queryFn: () =>
      fetchHubsPage(page, pageSize, debouncedSearch, resolvedSortKey, resolvedSortDirection),
    staleTime: 60_000,
    refetchOnMount: true,
    placeholderData: (prev) => prev,
  });

  const hubs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const refreshHubs = () => {
    void queryClient.invalidateQueries({ queryKey: ["hubs"] });
  };

  const handleCreated = () => {
    setPage(1);
    refreshHubs();
  };

  const handleSort = (key: HubSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  return (
    <div className="w-full min-w-0 space-y-6 p-4 md:p-8">
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Hub Management</CardTitle>
            <CardDescription>
              Create hubs with precise map-backed coordinates for routing and
              logistics. Super admins only.
            </CardDescription>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create hub
          </Button>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Use <span className="font-medium text-foreground">Create hub</span>{" "}
            to search an address with OpenStreetMap Nominatim (Philippines),
            then drag the pin to fine-tune coordinates before saving.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">Your hubs</CardTitle>
            <CardDescription>All hubs stored for this tenant.</CardDescription>
          </div>
          <Badge variant="secondary" className="tabular-nums">
            {total} {total === 1 ? "hub" : "hubs"}
          </Badge>
        </CardHeader>
        <Separator />
        <CardContent className="relative space-y-4 pt-6">
          {isFetching && !isLoading ? (
            <div
              className="pointer-events-none absolute inset-x-6 top-6 z-[1] h-8 rounded-md bg-muted/40 backdrop-blur-[1px]"
              aria-hidden
            />
          ) : null}

          <HubListSearchField
            value={searchInput}
            onChange={setSearchInput}
            onClear={clearSearch}
          />

          {isError && ( 
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not load hubs</AlertTitle>
              <AlertDescription>
                {error instanceof Error
                  ? error.message
                  : "Check your connection and try again."}
              </AlertDescription>
            </Alert>
          )}

          {isLoading && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              {Array.from({ length: Math.min(pageSize, 8) }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!isLoading && !isError && total === 0 && !debouncedSearch && (
            <Alert className="border-dashed">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <AlertTitle>No hubs yet</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>Create your first hub to see it listed here.</span>
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !isError && total === 0 && debouncedSearch && (
            <Alert>
              <Search className="h-4 w-4 text-muted-foreground" />
              <AlertTitle>No matching hubs</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Nothing matches{" "}
                  <span className="font-medium text-foreground">
                    &ldquo;{debouncedSearch}&rdquo;
                  </span>
                  . Try a different name or address.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-fit shrink-0"
                  onClick={clearSearch}
                >
                  Clear search
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !isError && total > 0 && (
            <div
              className={cn(
                "overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
                "[&>div]:max-h-[min(440px,58vh)]",
                isFetching &&
                  !isLoading &&
                  "opacity-[0.88] transition-opacity duration-300",
              )}
            >
              <Table>
                <HubListTableHeader sortState={sortState} onSort={handleSort} />
                <TableBody>
                  {hubs.map((row) => (
                    <HubListRow
                      key={row.id}
                      row={row}
                      onAssign={setAssignHub}
                      onViewLocation={setViewHub}
                      onEdit={setEditHub}
                      onDelete={setDeleteHub}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {!isLoading && !isError && total > 0 && (
          <HubListPaginationFooter
            page={page}
            pageSize={pageSize}
            total={total}
            isFetching={isFetching}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>

      <CreateHubDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <AssignHubDialog
        hub={assignHub}
        open={assignHub !== null}
        onOpenChange={(next) => {
          if (!next) setAssignHub(null);
        }}
        onAssigned={refreshHubs}
      />

      <ViewHubLocationDialog
        hub={viewHub}
        open={viewHub !== null}
        onOpenChange={(next) => {
          if (!next) setViewHub(null);
        }}
      />

      <EditHubDialog
        hub={editHub}
        open={editHub !== null}
        onOpenChange={(next) => {
          if (!next) setEditHub(null);
        }}
        onUpdated={refreshHubs}
      />

      <DeleteHubDialog
        hub={deleteHub}
        open={deleteHub !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteHub(null);
        }}
        onDeleted={refreshHubs}
      />
    </div>
  );
}
