import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const th = 'h-11 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

export function HubListTableHeader() {
  return (
    <TableHeader
      className={cn(
        'sticky top-0 z-10 border-b border-border/60 bg-gradient-to-b from-muted/90 to-muted/70 shadow-sm',
        'backdrop-blur-md supports-[backdrop-filter]:from-muted/80 supports-[backdrop-filter]:to-muted/60',
        '[&_tr]:border-0',
      )}
    >
      <TableRow className="border-0 hover:bg-transparent">
        <TableHead className={cn(th, 'min-w-[160px] pl-6')}>Hub Name</TableHead>
        <TableHead className={cn(th, 'min-w-[220px]')}>Location</TableHead>
        <TableHead className={cn(th, 'min-w-[140px]')}>Team leader</TableHead>
        <TableHead className={cn(th, 'min-w-[168px]')}>Created by</TableHead>
        <TableHead className={cn(th, 'min-w-[128px] whitespace-nowrap')}>Created</TableHead>
        <TableHead className={cn(th, 'w-[108px] pr-6 text-right')}>Actions</TableHead>
      </TableRow>
    </TableHeader>
  );
}
