import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Calendar } from 'lucide-react';

export default function Reports() {
  const reports = [
    {
      title: 'Sales Report',
      description: 'Comprehensive sales data and trends',
      period: 'March 2024',
      size: '2.4 MB',
    },
    {
      title: 'Inventory Report',
      description: 'Stock levels and inventory movements',
      period: 'March 2024',
      size: '1.8 MB',
    },
    {
      title: 'Client Activity Report',
      description: 'Client orders and engagement metrics',
      period: 'March 2024',
      size: '1.2 MB',
    },
    {
      title: 'Team Performance Report',
      description: 'Sales team KPIs and achievements',
      period: 'Q1 2024',
      size: '3.1 MB',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground">
              Download and view generated reports
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <Card key={report.title}>
              <CardHeader>
                <CardTitle>{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{report.period}</span>
                    </div>
                    <span className="text-muted-foreground">{report.size}</span>
                  </div>
                  <Button className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Download Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
