import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History as HistoryIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface HistoryEntry {
  id: string;
  user: string;
  action: string;
  details: string;
  timestamp: string;
  type: 'create' | 'update' | 'delete' | 'approve' | 'reject';
}

const DEMO_HISTORY: HistoryEntry[] = [
  {
    id: '1',
    user: 'John Doe (Super Admin)',
    action: 'Approved Order',
    details: 'Approved order #ORD-001 for ACME Corporation',
    timestamp: '2024-01-18 10:30 AM',
    type: 'approve',
  },
  {
    id: '2',
    user: 'Jane Smith (Admin)',
    action: 'Created Purchase Order',
    details: 'Created PO-003 for XFORGE Grape Fusion (200 units)',
    timestamp: '2024-01-18 09:15 AM',
    type: 'create',
  },
  {
    id: '3',
    user: 'Bob Manager',
    action: 'Updated Inventory',
    details: 'Updated stock allocation for Sales East team',
    timestamp: '2024-01-17 04:45 PM',
    type: 'update',
  },
  {
    id: '4',
    user: 'Alice Leader',
    action: 'Approved Stock Request',
    details: 'Approved inventory request from Charlie Sales (50 units)',
    timestamp: '2024-01-17 02:20 PM',
    type: 'approve',
  },
  {
    id: '5',
    user: 'Charlie Sales',
    action: 'Created Client',
    details: 'Added new client: Wilson Retail (Boston)',
    timestamp: '2024-01-17 11:00 AM',
    type: 'create',
  },
  {
    id: '6',
    user: 'John Doe (Super Admin)',
    action: 'Rejected Client',
    details: 'Rejected pending client: Anderson Shop (Outside territory)',
    timestamp: '2024-01-16 03:30 PM',
    type: 'reject',
  },
  {
    id: '7',
    user: 'Jane Smith (Admin)',
    action: 'Created User',
    details: 'Created new user account: Emma Sales (Mobile Sales)',
    timestamp: '2024-01-16 10:00 AM',
    type: 'create',
  },
  {
    id: '8',
    user: 'Bob Manager',
    action: 'Updated Team',
    details: 'Promoted David Sales to Team Leader',
    timestamp: '2024-01-15 02:00 PM',
    type: 'update',
  },
  {
    id: '9',
    user: 'John Doe (Super Admin)',
    action: 'Voided Client',
    details: 'Moved client Chen Trading to voided clients',
    timestamp: '2024-01-15 09:30 AM',
    type: 'delete',
  },
  {
    id: '10',
    user: 'Jane Smith (Admin)',
    action: 'Updated Pricing',
    details: 'Updated pricing methods for XFORGE Blueberry Ice',
    timestamp: '2024-01-14 04:00 PM',
    type: 'update',
  },
];

export default function History() {
  const [history] = useState<HistoryEntry[]>(DEMO_HISTORY);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHistory = history.filter(
    (entry) =>
      entry.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.details.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeBadge = (type: string) => {
    const colors: Record<string, any> = {
      create: 'default',
      update: 'secondary',
      delete: 'destructive',
      approve: 'default',
      reject: 'destructive',
    };
    return <Badge variant={colors[type]}>{type}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <HistoryIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">History</h1>
              <p className="text-muted-foreground">
                Audit log of all user actions
              </p>
            </div>
          </div>
          <div className="w-64">
            <Input
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3">
          {filteredHistory.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-base">{entry.action}</CardTitle>
                      {getTypeBadge(entry.type)}
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.user}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.timestamp}</p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm">{entry.details}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
