import { Card } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { WarRoomClient } from '../hooks/useWarRoomClients';

interface WarRoomStatsProps {
  clients: WarRoomClient[];
  cityFilter?: string;
}

export function WarRoomStats({ clients, cityFilter }: WarRoomStatsProps) {
  const label =
    cityFilter && cityFilter !== 'all'
      ? `Clients in ${cityFilter}`
      : 'Total Clients';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-blue-50">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{clients.length}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

