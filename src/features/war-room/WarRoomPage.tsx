import { useState, useMemo, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { WarRoomMap } from './components/WarRoomMap';
import { WarRoomFilters } from './components/WarRoomFilters';
import { WarRoomLegend } from './components/WarRoomLegend';
import { WarRoomStats } from './components/WarRoomStats';
import { ClientMapPopup } from './components/ClientMapPopup';
import { useWarRoomClients, WarRoomClient } from './hooks/useWarRoomClients';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

export function WarRoomPage() {
  const { clients, loading, error } = useWarRoomClients();
  const { user } = useAuth();
  const [selectedClient, setSelectedClient] = useState<WarRoomClient | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  
  // Filter states
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'Key Accounts' | 'Standard Accounts'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'mobile_sales' | 'team_leader' | 'manager'>('all');
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all brands for this company for the brands filter
  useEffect(() => {
    if (!user?.company_id) return;

    let cancelled = false;

    const fetchBrands = async () => {
      try {
        const { data, error } = await supabase
          .from('brands')
          .select('id, name')
          .eq('company_id', user.company_id)
          .order('name');

        if (error) throw error;
        if (!cancelled) {
          setBrands(data || []);
        }
      } catch (err) {
        console.error('Error fetching brands for War Room filter:', err);
        if (!cancelled) {
          setBrands([]);
        }
      }
    };

    fetchBrands();

    return () => {
      cancelled = true;
    };
  }, [user?.company_id]);

  // Filter clients based on all filters
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Account type filter
      if (accountTypeFilter !== 'all' && client.account_type !== accountTypeFilter) {
        return false;
      }

      // Team role filter (based on owning agent's role)
      if (roleFilter !== 'all') {
        const role = (client.agent_role || '').toLowerCase();
        if (role !== roleFilter) {
          return false;
        }
      }

      // Brands filter: client must carry at least one of the selected brands
      if (selectedBrandIds.length > 0) {
        const clientBrands = client.brand_ids || [];
        const hasAnySelectedBrand = clientBrands.some((id) =>
          selectedBrandIds.includes(id)
        );
        if (!hasAnySelectedBrand) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = client.name.toLowerCase().includes(query);
        const matchesCompany = client.company.toLowerCase().includes(query);
        const matchesCity = client.city.toLowerCase().includes(query);
        const matchesRegion = client.region.toLowerCase().includes(query);
        
        if (!matchesName && !matchesCompany && !matchesCity && !matchesRegion) {
          return false;
        }
      }

      return true;
    });
  }, [clients, accountTypeFilter, roleFilter, selectedBrandIds, searchQuery]);

  const handleClientClick = (client: WarRoomClient) => {
    setSelectedClient(client);
    setIsPopupOpen(true);
  };

  // Loading State
  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="p-6 pb-4">
          <h1 className="text-3xl font-bold">War Room</h1>
          <p className="text-muted-foreground mt-1">
            Interactive map of client locations with forge status
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Loading client locations...</p>
          </Card>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="p-6 pb-4">
          <h1 className="text-3xl font-bold">War Room</h1>
          <p className="text-muted-foreground mt-1">
            Interactive map of client locations with forge status
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 flex flex-col items-center gap-4 max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-medium">Failed to load clients</p>
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </Card>
        </div>
      </div>
    );
  }

  // Empty State
  if (clients.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="p-6 pb-4">
          <h1 className="text-3xl font-bold">War Room</h1>
          <p className="text-muted-foreground mt-1">
            Interactive map of client locations with forge status
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 flex flex-col items-center gap-4 max-w-md">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No Clients with Locations</p>
            <p className="text-sm text-muted-foreground text-center">
              No clients have location data available. Add location information to clients to see them on the map.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="p-6 pb-4">
        <h1 className="text-3xl font-bold">War Room</h1>
        <p className="text-muted-foreground mt-1">
          Interactive map of client locations with forge status
        </p>
      </div>

      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full flex flex-col gap-4">
          {/* Statistics Cards */}
          <WarRoomStats clients={filteredClients} />

          {/* Main Content: Filters, Map, and Legend */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* Left Sidebar: Filters */}
            <div className="lg:col-span-3 overflow-y-auto">
              <WarRoomFilters
                accountTypeFilter={accountTypeFilter}
                roleFilter={roleFilter}
                brands={brands}
                selectedBrandIds={selectedBrandIds}
                searchQuery={searchQuery}
                onAccountTypeChange={setAccountTypeFilter}
                onRoleChange={setRoleFilter}
                onBrandToggle={(brandId, checked) => {
                  setSelectedBrandIds((prev) =>
                    checked ? [...prev, brandId] : prev.filter((id) => id !== brandId)
                  );
                }}
                onSearchChange={setSearchQuery}
              />
            </div>

            {/* Center: Map */}
            <div className="lg:col-span-7 h-[500px] lg:h-full">
              <WarRoomMap
                clients={filteredClients}
                onClientClick={handleClientClick}
              />
            </div>

            {/* Right Sidebar: Legend */}
            <div className="lg:col-span-2">
              <WarRoomLegend />
              
              {/* Client Count */}
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-bold text-foreground">{filteredClients.length}</span> of{' '}
                  <span className="font-bold text-foreground">{clients.length}</span> clients
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Client Details Popup */}
      <ClientMapPopup
        client={selectedClient}
        open={isPopupOpen}
        onOpenChange={setIsPopupOpen}
      />
    </div>
  );
}

