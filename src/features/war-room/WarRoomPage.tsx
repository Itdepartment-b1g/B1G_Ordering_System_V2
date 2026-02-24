import { useState, useMemo, useEffect } from 'react';
import { Loader2, AlertCircle, Filter } from 'lucide-react';
import { WarRoomMap } from './components/WarRoomMap';
import { WarRoomFilters } from './components/WarRoomFilters';
import { ClientMapPopup } from './components/ClientMapPopup';
import { useWarRoomClients, WarRoomClient } from './hooks/useWarRoomClients';
import { useWarRoomHierarchy } from './hooks/useWarRoomHierarchy';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useExecutiveCompanies } from '@/features/dashboard/executiveHooks';
import { useIsMobile } from '@/hooks/use-mobile';
import './WarRoomPage.css';

export function WarRoomPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  // For executive accounts, get assigned companies
  const { data: executiveCompanies, isLoading: executiveCompaniesLoading } = useExecutiveCompanies();
  const isExecutive = user?.role === 'executive';
  
  // Company filter state (for executive accounts)
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  
  // Determine which company IDs to use for data fetching
  const allCompanyIds = isExecutive && executiveCompanies?.companyIds 
    ? executiveCompanies.companyIds 
    : undefined;
  
  // Use filtered company IDs if any are selected, otherwise use all
  const effectiveCompanyIds = useMemo(() => {
    if (!allCompanyIds) return undefined;
    if (selectedCompanyIds.length === 0) return allCompanyIds;
    return selectedCompanyIds;
  }, [allCompanyIds, selectedCompanyIds]);

  const { clients, loading: clientsLoading, error: clientsError } = useWarRoomClients(effectiveCompanyIds);
  const { data: hierarchy, isLoading: hierarchyLoading } = useWarRoomHierarchy(effectiveCompanyIds);
  
  const [selectedClient, setSelectedClient] = useState<WarRoomClient | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  
  // Filter states
  const [selectedManagerId, setSelectedManagerId] = useState<string>('all');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all brands (for all companies if executive, otherwise single company)
  useEffect(() => {
    const brandCompanyIds = effectiveCompanyIds && effectiveCompanyIds.length > 0 
      ? effectiveCompanyIds 
      : (user?.company_id ? [user.company_id] : []);
    
    if (brandCompanyIds.length === 0) return;
    
    let cancelled = false;
    const fetchBrands = async () => {
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('id, name')
          .in('company_id', brandCompanyIds)
          .order('name');

        if (error) throw error;
        if (!cancelled) setBrands(data || []);
      } catch (err) {
        console.error('Error fetching brands:', err);
      }
    };
    fetchBrands();
    return () => { cancelled = true; };
  }, [effectiveCompanyIds?.join(','), user?.company_id]);

  // Fetch mobile sales agents (for all companies if executive, otherwise single company)
  useEffect(() => {
    const agentCompanyIds = effectiveCompanyIds && effectiveCompanyIds.length > 0 
      ? effectiveCompanyIds 
      : (user?.company_id ? [user.company_id] : []);
    
    if (agentCompanyIds.length === 0) return;
    
    let cancelled = false;
    const fetchAgents = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('company_id', agentCompanyIds)
          .eq('role', 'mobile_sales')
          .order('full_name');

        if (error) throw error;
        if (!cancelled) setAgents((data || []).map(a => ({ id: a.id, name: a.full_name || 'Unknown' })));
      } catch (err) {
        console.error('Error fetching agents:', err);
      }
    };
    fetchAgents();
    return () => { cancelled = true; };
  }, [effectiveCompanyIds?.join(','), user?.company_id]);

  // 1. Manager Filter Logic
  // If a manager is selected, we get all agent IDs that fall under their hierarchy.
  const managerTeamAgentIds = useMemo(() => {
    if (selectedManagerId === 'all' || !hierarchy) return null;
    
    // Find the selected manager node
    const managerNode = hierarchy.find(m => m.id === selectedManagerId);
    if (!managerNode) return null;

    // Collect all member IDs from all sub-teams
    const ids = new Set<string>();
    // include manager themself if they have clients
    ids.add(managerNode.id); 
    
    managerNode.subTeams.forEach(st => {
      st.memberIds.forEach(id => ids.add(id));
    });
    
    return ids;
  }, [selectedManagerId, hierarchy]);

  // 2. Base Filtered Clients (Filtered by Manager ONLY)
  // This is used to generate the City Options available for this Manager
  const clientsInManagerScope = useMemo(() => {
    if (selectedManagerId === 'all') return clients;
    if (!managerTeamAgentIds) return []; // Should not happen if 'all' check passes, but for safety
    
    return clients.filter(c => 
      c.agent_id && managerTeamAgentIds.has(c.agent_id)
    );
  }, [clients, selectedManagerId, managerTeamAgentIds]);

  // 3. Generate City Options from Manager Scope
  const cityOptions = useMemo(() => {
    const cityMap = new Map<string, Set<string>>(); // City -> Set of Agent Names
    const cityCounts = new Map<string, number>();

    clientsInManagerScope.forEach(client => {
      const city = client.city || 'Unknown';
      if (!city || city.trim() === '') return;

      // Track agent names for this city
      if (!cityMap.has(city)) {
        cityMap.set(city, new Set());
        cityCounts.set(city, 0);
      }
      
      if (client.agent_name) {
        cityMap.get(city)!.add(client.agent_name);
      }
      cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
    });

    return Array.from(cityMap.entries()).map(([city, agentSet]) => ({
      city,
      holderNames: Array.from(agentSet).sort(),
      count: cityCounts.get(city) || 0
    })).sort((a, b) => a.city.localeCompare(b.city));
  }, [clientsInManagerScope]);

  // Generate City -> Holder Map for the Map Component
  const cityHolderMap = useMemo(() => {
    const map = new Map<string, string>();
    cityOptions.forEach(opt => {
      map.set(opt.city, opt.holderNames.join(', '));
    });
    return map;
  }, [cityOptions]);

  // Check if any filters have been applied (for lazy loading markers)
  const hasActiveFilters = useMemo(() => {
    return (
      selectedManagerId !== 'all' ||
      selectedCities.length > 0 ||
      selectedBrandIds.length > 0 ||
      selectedAgentIds.length > 0 ||
      searchQuery.length > 0 ||
      (isExecutive && selectedCompanyIds.length > 0)
    );
  }, [selectedManagerId, selectedCities, selectedBrandIds, selectedAgentIds, searchQuery, isExecutive, selectedCompanyIds]);

  // 4. Final Filtered Clients (Manager + Cities + Brands + Agents + Search)
  const finalFilteredClients = useMemo(() => {
    // If no filters are active, return empty array (no markers shown)
    if (!hasActiveFilters) {
      return [];
    }

    return clientsInManagerScope.filter(client => {
      // City Filter
      if (selectedCities.length > 0) {
        const clientCity = client.city || 'Unknown';
        if (!selectedCities.includes(clientCity)) return false;
      }

      // Brand Filter
      if (selectedBrandIds.length > 0) {
        if (!client.brand_ids) return false;
        const hasBrand = client.brand_ids.some(id => selectedBrandIds.includes(id));
        if (!hasBrand) return false;
      }

      // Agent Filter
      if (selectedAgentIds.length > 0) {
        if (!client.agent_id) return false;
        if (!selectedAgentIds.includes(client.agent_id)) return false;
      }

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = 
          client.name.toLowerCase().includes(q) ||
          client.company.toLowerCase().includes(q) ||
          (client.city || '').toLowerCase().includes(q) ||
          (client.region || '').toLowerCase().includes(q) ||
          (client.address || '').toLowerCase().includes(q) ||
          (client.agent_name || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [clientsInManagerScope, selectedCities, selectedBrandIds, selectedAgentIds, searchQuery, hasActiveFilters]);

  // Handlers
  const handleClientClick = (client: WarRoomClient) => {
    setSelectedClient(client);
    setIsPopupOpen(true);
  };

  const handleManagerChange = (val: string) => {
    setSelectedManagerId(val);
    setSelectedCities([]); // Reset cities when changing manager context
  };

  const handleCityToggle = (city: string, checked: boolean) => {
    setSelectedCities(prev => {
      if (checked) {
        return prev.includes(city) ? prev : [...prev, city];
      } else {
        return prev.filter(c => c !== city);
      }
    });
  };

  const handleSelectAllCities = (checked: boolean) => {
    if (checked) {
      setSelectedCities(cityOptions.map(o => o.city));
    } else {
      setSelectedCities([]);
    }
  };

  // Company filter handlers (for executive accounts)
  const handleCompanyToggle = (companyId: string, checked: boolean) => {
    setSelectedCompanyIds(prev => {
      if (checked) {
        return prev.includes(companyId) ? prev : [...prev, companyId];
      } else {
        return prev.filter(id => id !== companyId);
      }
    });
  };

  const handleSelectAllCompanies = (checked: boolean) => {
    if (checked && allCompanyIds) {
      setSelectedCompanyIds(allCompanyIds);
    } else {
      setSelectedCompanyIds([]);
    }
  };

  // Agent filter handlers
  const handleAgentToggle = (agentId: string, checked: boolean) => {
    setSelectedAgentIds(prev => {
      if (checked) {
        return prev.includes(agentId) ? prev : [...prev, agentId];
      } else {
        return prev.filter(id => id !== agentId);
      }
    });
  };

  const handleSelectAllAgents = (checked: boolean) => {
    if (checked) {
      setSelectedAgentIds(agents.map(a => a.id));
    } else {
      setSelectedAgentIds([]);
    }
  };

  const loading = clientsLoading || hierarchyLoading || (isExecutive && executiveCompaniesLoading);

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <LoadingState message="Loading War Room data..." />
      </div>
    );
  }

  if (clientsError) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <ErrorState message={clientsError} />
      </div>
    );
  }

  const managerOptions = hierarchy?.map(h => ({ id: h.id, name: h.name })) || [];

  const filtersContent = (
    <WarRoomFilters
      managers={managerOptions}
      selectedManagerId={selectedManagerId}
      onManagerChange={handleManagerChange}
      cityOptions={cityOptions}
      selectedCities={selectedCities}
      onCityToggle={handleCityToggle}
      onSelectAllCities={handleSelectAllCities}
      brands={brands}
      selectedBrandIds={selectedBrandIds}
      onBrandToggle={(id, checked) => 
        setSelectedBrandIds(prev => checked ? [...prev, id] : prev.filter(b => b !== id))
      }
      agents={agents}
      selectedAgentIds={selectedAgentIds}
      onAgentToggle={handleAgentToggle}
      onSelectAllAgents={handleSelectAllAgents}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      // Executive company filter
      isExecutive={isExecutive}
      companies={executiveCompanies?.companies || []}
      selectedCompanyIds={selectedCompanyIds}
      onCompanyToggle={handleCompanyToggle}
      onSelectAllCompanies={handleSelectAllCompanies}
    />
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Responsive Header */}
      <div className="px-4 py-4 md:p-6 md:pb-4 border-b bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold">War Room</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 hidden sm:block">
              Interactive map of client locations and territory management
            </p>
          </div>
          
          {/* Mobile Filter Button */}
          {isMobile && (
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] sm:w-[400px] p-0 overflow-hidden">
                <div className="h-full overflow-y-auto">
                  {filtersContent}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-muted/20">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-0">
          {/* Desktop Filters Sidebar */}
          {!isMobile && (
            <div className="hidden lg:block lg:col-span-3 border-r bg-background overflow-hidden">
              {filtersContent}
            </div>
          )}

          {/* Map Area */}
          <div className="col-span-1 lg:col-span-9 h-full relative p-4 lg:p-6">
            <div className="h-full w-full rounded-lg overflow-hidden shadow-lg border border-border/50 bg-background">
              <WarRoomMap
                clients={finalFilteredClients}
                cityHolders={cityHolderMap}
                onClientClick={handleClientClick}
                onCityStatusChange={handleCityToggle}
              />
              
              {/* Professional Info Card */}
              {!(isMobile && filtersOpen) && (
                <div className="absolute top-4 right-4 bg-background/98 backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg border border-border/50 z-[5] min-w-[200px]">
                  {hasActiveFilters ? (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-2xl font-bold text-foreground">
                          {finalFilteredClients.length}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {finalFilteredClients.length === 1 ? 'Client' : 'Clients'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {isExecutive && (
                          <>
                            <span className="font-medium text-foreground/80">
                              {selectedCompanyIds.length === 0 
                                ? 'All Companies' 
                                : `${selectedCompanyIds.length} Company${selectedCompanyIds.length === 1 ? '' : 'ies'}`}
                            </span>
                            <span className="text-muted-foreground/50">•</span>
                          </>
                        )}
                        <span className="font-medium text-foreground/80">
                          {selectedManagerId === 'all' 
                            ? 'All Teams' 
                            : managerOptions.find(m => m.id === selectedManagerId)?.name}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="font-medium text-foreground/80">
                          {selectedCities.length === 0 
                            ? 'All Cities' 
                            : `${selectedCities.length} Cities`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">No filters applied</p>
                      <p className="text-xs">Use filters to display clients on the map</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ClientMapPopup
        client={selectedClient}
        open={isPopupOpen}
        onOpenChange={setIsPopupOpen}
      />
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <div className="p-8 rounded-full bg-muted/50 animate-pulse">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
      <p className="text-lg font-medium text-muted-foreground">{message}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <Card className="p-8 flex flex-col items-center gap-4 max-w-md bg-destructive/5 border-destructive/20">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h3 className="text-lg font-bold text-destructive">Data Error</h3>
        <p className="text-sm text-center text-muted-foreground">{message}</p>
      </Card>
    </div>
  );
}

