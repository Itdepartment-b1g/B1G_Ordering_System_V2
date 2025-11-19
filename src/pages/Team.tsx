import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Mail, Phone, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  ordersThisMonth: number;
  revenueThisMonth: number;
  targetRevenue: number;
  clientsManaged: number;
}

const DEMO_TEAM: TeamMember[] = [
  {
    id: '1',
    name: 'Charlie Sales',
    email: 'sales@acme.com',
    phone: '+1 234 567 8900',
    role: 'Mobile Sales',
    ordersThisMonth: 15,
    revenueThisMonth: 45000,
    targetRevenue: 50000,
    clientsManaged: 12,
  },
  {
    id: '2',
    name: 'David Agent',
    email: 'dagent@acme.com',
    phone: '+1 234 567 8901',
    role: 'Mobile Sales',
    ordersThisMonth: 12,
    revenueThisMonth: 38000,
    targetRevenue: 50000,
    clientsManaged: 10,
  },
  {
    id: '3',
    name: 'Emma Seller',
    email: 'eseller@acme.com',
    phone: '+1 234 567 8902',
    role: 'Mobile Sales',
    ordersThisMonth: 18,
    revenueThisMonth: 52000,
    targetRevenue: 50000,
    clientsManaged: 14,
  },
];

export default function Team() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Users className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Team</h1>
            <p className="text-muted-foreground">
              Manage your sales team and track performance
            </p>
          </div>
        </div>

        <div className="grid gap-6">
          {DEMO_TEAM.map((member) => {
            const targetProgress = (member.revenueThisMonth / member.targetRevenue) * 100;
            const isOnTarget = targetProgress >= 100;

            return (
              <Card key={member.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{member.name}</CardTitle>
                      <Badge variant="secondary" className="mt-2">{member.role}</Badge>
                    </div>
                    <Badge variant={isOnTarget ? 'default' : 'secondary'}>
                      {isOnTarget ? 'Target Met' : 'In Progress'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{member.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{member.phone}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Orders This Month</p>
                      <p className="text-2xl font-bold">{member.ordersThisMonth}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Clients Managed</p>
                      <p className="text-2xl font-bold">{member.clientsManaged}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="text-2xl font-bold">${member.revenueThisMonth.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Monthly Target Progress</span>
                      </div>
                      <span className="font-medium">
                        ${member.revenueThisMonth.toLocaleString()} / ${member.targetRevenue.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={targetProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {targetProgress.toFixed(1)}% of monthly target
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
