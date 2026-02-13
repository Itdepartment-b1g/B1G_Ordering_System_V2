import { useState, useMemo, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { WarRoomMap } from './components/WarRoomMap';
import { WarRoomFilters } from './components/WarRoomFilters';
import { ClientMapPopup } from './components/ClientMapPopup';
import { useWarRoomClients, WarRoomClient } from './hooks/useWarRoomClients';
import { useWarRoomHierarchy } from './hooks/useWarRoomHierarchy';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useExecutiveCompanies } from '@/features/dashboard/executiveHooks';

export function WarRoomPage() {
  const { user } = useAuth();
  
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
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
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

  // 4. Final Filtered Clients (Manager + Cities + Brands + Search)
  const finalFilteredClients = useMemo(() => {
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

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = 
          client.name.toLowerCase().includes(q) ||
          client.company.toLowerCase().includes(q) ||
          (client.city || '').toLowerCase().includes(q) ||
          (client.region || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [clientsInManagerScope, selectedCities, selectedBrandIds, searchQuery]);

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

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="p-6 pb-4">
        <h1 className="text-3xl font-bold">War Room</h1>
        <p className="text-muted-foreground mt-1">
          Interactive map of client locations and territory management
        </p>
      </div>

      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full flex flex-col gap-4">

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* Filters Sidebar */}
            <div className="lg:col-span-3 overflow-y-auto">
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
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                // Executive company filter
                isExecutive={isExecutive}
                companies={executiveCompanies?.companies || []}
                selectedCompanyIds={selectedCompanyIds}
                onCompanyToggle={handleCompanyToggle}
                onSelectAllCompanies={handleSelectAllCompanies}
              />
            </div>

            {/* Map Area */}
            <div className="lg:col-span-9 h-[750px] lg:h-[calc(100vh-180px)] flex flex-col gap-4">
              <div className="flex-1 relative rounded-xl overflow-hidden border">
                <WarRoomMap
                  clients={finalFilteredClients}
                  cityHolders={cityHolderMap} // Pass the color/boundary mapping
                  onClientClick={handleClientClick}
                  onCityStatusChange={handleCityToggle}
                />
                
                {/* Floating Info Overlay */}
                <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border text-sm max-w-xs z-[400]">
                  <p className="font-semibold mb-1">
                    Showing {finalFilteredClients.length} Clients
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {isExecutive && (
                      <>
                        {selectedCompanyIds.length === 0 
                          ? 'All Companies' 
                          : `${selectedCompanyIds.length} Company${selectedCompanyIds.length === 1 ? '' : 'ies'} Selected`}
                        {' • '}
                      </>
                    )}
                    {selectedManagerId === 'all' 
                      ? 'All Teams' 
                      : `Team ${managerOptions.find(m => m.id === selectedManagerId)?.name}`}
                   {' • '}
                   {selectedCities.length === 0 
                     ? 'All Cities' 
                     : `${selectedCities.length} Cities Selected`}
                  </p>
                </div>
              </div>
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

