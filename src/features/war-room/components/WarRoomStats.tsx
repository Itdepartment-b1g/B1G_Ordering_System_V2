import { Card } from '@/components/ui/card';
import { Building2, Users, Flame, TrendingUp } from 'lucide-react';
import { WarRoomClient } from '../hooks/useWarRoomClients';

interface WarRoomStatsProps {
  clients: WarRoomClient[];
}

export function WarRoomStats({ clients }: WarRoomStatsProps) {
  const keyAccounts = clients.filter(c => c.account_type === 'Key Accounts').length;
  const standardAccounts = clients.filter(c => c.account_type === 'Standard Accounts').length;
  const withForge = clients.filter(c => c.has_forge).length;
  const totalOrders = clients.reduce((sum, c) => sum + (c.total_orders || 0), 0);

  const stats = [
    {
      label: 'Total Clients',
      value: clients.length,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      label: 'Key Accounts',
      value: keyAccounts,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
    {
      label: 'With Forge',
      value: withForge,
      icon: Flame,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      label: 'Total Orders',
      value: totalOrders,
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <Icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

