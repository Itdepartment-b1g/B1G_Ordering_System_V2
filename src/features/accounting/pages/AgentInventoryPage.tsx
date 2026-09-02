import { useMemo, useState } from 'react';
import AgentInventoryList from '@/features/accounting/component/AgentInventoryList';
import {
  UNASSIGNED_TEAM_ID,
  getPersonTeamId,
  useAccountingAgentInventory,
  type AccountingAgentSummary,
} from '@/features/accounting/hooks/useAccountingAgentInventory';
import { exportAgentInventoryExcel } from '@/features/accounting/utils/exportAgentInventoryExcel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Box, Check, ChevronsUpDown, FileDown, Layers, Loader2, Package, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

type RoleFilter = 'all' | 'team_leader' | 'mobile_sales';
type AgentStatusFilter = 'all' | 'active' | 'inactive';
type AvailabilityFilter = 'all' | 'available' | 'not_available';

interface FilterOption {
  id: string;
  label: string;
  available?: boolean;
}

function SearchableFilter({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  scopeLabels,
}: {
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  scopeLabels: { all: string; available: string; not_available: string };
}) {
  const [open, setOpen] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const selected = options.find((option) => option.id === value);

  const visibleOptions = useMemo(() => {
    return options.filter((option) => {
      if (availability === 'available') return option.available !== false;
      if (availability === 'not_available') return option.available === false;
      return true;
    });
  }, [options, availability]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full lg:w-[240px] justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex flex-col gap-1.5 border-b p-2">
          {(
            [
              { value: 'all', label: scopeLabels.all },
              { value: 'available', label: scopeLabels.available },
              { value: 'not_available', label: scopeLabels.not_available },
            ] as const
          ).map(({ value: scope, label }) => {
            const selectedScope = availability === scope;
            return (
              <button
                key={scope}
                type="button"
                onClick={() => {
                  setAvailability(scope);
                  if (scope === 'all') {
                    onChange('all');
                    return;
                  }
                  const stillVisible = options.some((option) => {
                    if (option.id !== value) return false;
                    if (scope === 'available') return option.available !== false;
                    return option.available === false;
                  });
                  if (!stillVisible) onChange('all');
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                  selectedScope
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {visibleOptions.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.id}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function applyBrandFilter(
  people: AccountingAgentSummary[],
  brandId: string
): AccountingAgentSummary[] {
  if (brandId === 'all') return people;

  return people.flatMap((person) => {
    const inventory = person.inventory.filter((item) => item.brandId === brandId);
    if (inventory.length === 0) return [];
    return [
      {
        ...person,
        inventory,
        totalStock: inventory.reduce((sum, item) => sum + item.qty, 0),
        totalValue: inventory.reduce((sum, item) => sum + item.value, 0),
        variantCount: inventory.length,
      },
    ];
  });
}

function roleStats(people: AccountingAgentSummary[], role: RoleFilter) {
  const subset =
    role === 'all' ? people : people.filter((person) => person.agentRole === role);
  return {
    count: subset.length,
    units: subset.reduce((sum, person) => sum + person.totalStock, 0),
  };
}

function matchesTeamFilter(person: AccountingAgentSummary, teamId: string, role: RoleFilter) {
  if (teamId === 'all') return true;

  if (role === 'mobile_sales') {
    return getPersonTeamId(person) === teamId;
  }

  if (teamId === UNASSIGNED_TEAM_ID) {
    return person.agentRole === 'mobile_sales' && getPersonTeamId(person) === UNASSIGNED_TEAM_ID;
  }

  return (
    (person.agentRole === 'team_leader' && person.agentId === teamId) ||
    (person.agentRole === 'mobile_sales' && getPersonTeamId(person) === teamId)
  );
}

export default function AgentInventoryPage() {
  const { data, isLoading } = useAccountingAgentInventory();
  const { toast } = useToast();
  const people = data?.people ?? [];
  const catalogBrands = data?.brands ?? [];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<AgentStatusFilter>('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  const teamOptions = useMemo(() => {
    const teams = new Map<string, string>();

    for (const person of people) {
      if (person.agentRole === 'team_leader') {
        teams.set(person.agentId, person.agentName);
      }
    }

    for (const person of people) {
      if (person.agentRole !== 'mobile_sales') continue;
      const teamId = getPersonTeamId(person);
      if (teamId === UNASSIGNED_TEAM_ID) {
        teams.set(UNASSIGNED_TEAM_ID, 'Unassigned');
      } else if (person.leaderId && !teams.has(person.leaderId)) {
        teams.set(person.leaderId, person.leaderName || 'Team Leader');
      }
    }

    return Array.from(teams.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        if (a.id === UNASSIGNED_TEAM_ID) return 1;
        if (b.id === UNASSIGNED_TEAM_ID) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [people]);

  const teamFilterOptions = useMemo<FilterOption[]>(() => {
    const teamsWithAgents = new Set<string>();
    for (const person of people) {
      if (person.agentRole !== 'mobile_sales') continue;
      teamsWithAgents.add(getPersonTeamId(person));
    }

    return teamOptions.map((team) => ({
      id: team.id,
      label: team.name,
      available: teamsWithAgents.has(team.id),
    }));
  }, [people, teamOptions]);

  const brandFilterOptions = useMemo<FilterOption[]>(() => {
    const brands = new Map<string, string>();
    for (const brand of catalogBrands) {
      brands.set(brand.id, brand.name);
    }

    const heldBrandIds = new Set<string>();
    const source =
      selectedRole === 'all'
        ? people
        : people.filter((person) => person.agentRole === selectedRole);
    for (const person of source) {
      for (const item of person.inventory) {
        brands.set(item.brandId, item.brandName);
        heldBrandIds.add(item.brandId);
      }
    }

    return Array.from(brands.entries())
      .map(([id, name]) => ({
        id,
        label: name,
        available: heldBrandIds.has(id),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogBrands, people, selectedRole]);

  const filteredPeople = useMemo(() => {
    let next =
      selectedRole === 'all'
        ? people
        : people.filter((person) => person.agentRole === selectedRole);

    if (statusFilter !== 'all') {
      next = next.filter((person) => person.status === statusFilter);
    }

    if (selectedRole !== 'team_leader' && teamFilter !== 'all') {
      next = next.filter((person) => matchesTeamFilter(person, teamFilter, selectedRole));
    }

    next = applyBrandFilter(next, brandFilter);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      next = next.filter(
        (person) =>
          person.agentName.toLowerCase().includes(query) ||
          (person.leaderName || '').toLowerCase().includes(query)
      );
    }

    return next;
  }, [people, selectedRole, statusFilter, teamFilter, brandFilter, searchQuery]);

  const isFiltered =
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    teamFilter !== 'all' ||
    brandFilter !== 'all';

  const teamLeaderStats = useMemo(() => roleStats(people, 'team_leader'), [people]);
  const mobileSalesStats = useMemo(() => roleStats(people, 'mobile_sales'), [people]);
  const allStats = useMemo(() => roleStats(people, 'all'), [people]);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const teamLabel =
        teamFilter === 'all'
          ? 'All teams'
          : teamOptions.find((team) => team.id === teamFilter)?.name || 'All teams';
      const brandLabel =
        brandFilter === 'all'
          ? 'All brands'
          : brandFilterOptions.find((brand) => brand.id === brandFilter)?.label || 'All brands';

      await exportAgentInventoryExcel(filteredPeople, {
        role: selectedRole,
        roleLabel:
          selectedRole === 'all'
            ? 'All'
            : selectedRole === 'mobile_sales'
              ? 'Mobile Sales'
              : 'Team Leader',
        statusLabel:
          statusFilter === 'active' ? 'Active' : statusFilter === 'inactive' ? 'Inactive' : 'All',
        teamLabel,
        brandLabel,
        searchLabel: searchQuery.trim() || '—',
      });
      toast({ title: 'Export complete', description: 'Agent inventory exported to Excel.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export agent inventory to Excel.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const selectRole = (role: RoleFilter) => {
    setSelectedRole(role);
    setStatusFilter('all');
    setTeamFilter('all');
    setBrandFilter('all');
  };

  const roleCards: Array<{
    role: RoleFilter;
    label: string;
    caption: string;
    stats: ReturnType<typeof roleStats>;
    tint: string;
    iconTint: string;
    Icon: typeof Users;
  }> = [
    {
      role: 'all',
      label: 'All',
      caption: 'Leaders and agents in this company',
      stats: allStats,
      tint: 'from-emerald-500/[0.08]',
      iconTint: 'text-emerald-500/10',
      Icon: Layers,
    },
    {
      role: 'team_leader',
      label: 'Team Leader',
      caption: 'Leaders in this company',
      stats: teamLeaderStats,
      tint: 'from-sky-500/[0.08]',
      iconTint: 'text-sky-500/10',
      Icon: Users,
    },
    {
      role: 'mobile_sales',
      label: 'Mobile Sales',
      caption: 'Agents in this company',
      stats: mobileSalesStats,
      tint: 'from-violet-500/[0.08]',
      iconTint: 'text-violet-500/10',
      Icon: Box,
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agent Inventory</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Field stock held by team leaders and mobile sales — view only
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 gap-2 shrink-0"
          onClick={() => void handleExportExcel()}
          disabled={exporting || filteredPeople.length === 0}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Export Excel
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              selectedRole === 'team_leader' ? 'Search person...' : 'Search agent or team...'
            }
            className="pl-8 bg-background h-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {selectedRole !== 'team_leader' && (
          <SearchableFilter
            options={teamFilterOptions}
            value={teamFilter}
            onChange={setTeamFilter}
            placeholder="All teams"
            searchPlaceholder="Search team..."
            scopeLabels={{ all: 'All', available: 'Has team', not_available: 'No team' }}
          />
        )}
        <SearchableFilter
          options={brandFilterOptions}
          value={brandFilter}
          onChange={setBrandFilter}
          placeholder="All brands"
          searchPlaceholder="Search brand..."
          scopeLabels={
            selectedRole === 'all'
              ? {
                  all: 'All',
                  available: 'Held',
                  not_available: 'Not held',
                }
              : selectedRole === 'mobile_sales'
                ? {
                    all: 'All',
                    available: 'Held by Mobile Sales',
                    not_available: 'Not held by Mobile Sales',
                  }
                : {
                    all: 'All',
                    available: 'Held by TL',
                    not_available: 'Not held by TL',
                  }
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {roleCards.map(({ role, label, caption, stats, tint, iconTint, Icon }) => {
          const selected = selectedRole === role;
          return (
            <Card
              key={role}
              role="button"
              tabIndex={0}
              onClick={() => selectRole(role)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectRole(role);
                }
              }}
              className={cn(
                'relative overflow-hidden cursor-pointer shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary ring-1 ring-primary/20'
                  : 'border-border/70 hover:border-primary/40 hover:shadow-md'
              )}
            >
              <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent', tint)} />
              <Icon className={cn('pointer-events-none absolute -bottom-4 -right-3 h-24 w-24', iconTint)} />
              <div className="relative z-10 p-4 pr-14">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                  {stats.count.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Package className="h-3.5 w-3.5" />
                    <span className="tabular-nums font-medium text-foreground">
                      {stats.units.toLocaleString()}
                    </span>
                    <span>units</span>
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
          {(
            [
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ] as const
          ).map(({ value, label }) => {
            const selected = statusFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <AgentInventoryList
            people={filteredPeople}
            isFiltered={isFiltered}
            selectedRole={selectedRole}
          />
        </div>
      )}
    </div>
  );
}
