import { useState, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Building2,
    TrendingUp,
    ShoppingCart,
    Users,
    UserCheck,
    Loader2,
    DollarSign,
    Activity,
    Award,
    RefreshCw,
    Calendar,
    ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/features/auth';
import {
    useExecutiveCompanies,
    useExecutiveStats,
    useExecutiveCompanyBreakdown,
    useExecutiveRevenueTrends,
    useExecutiveTopPerformers,
    useExecutiveRecentActivity,
    useExecutiveBrandPerformance
} from './executiveHooks';
import { useExecutiveRealtime } from './useExecutiveRealtime';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';

// Date range presets
type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_year' | 'custom';

const getDateRange = (preset: DatePreset, customStart?: Date, customEnd?: Date): { start?: Date; end?: Date } => {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch (preset) {
        case 'this_month':
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };

        case 'last_month':
            start.setMonth(now.getMonth() - 1);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setMonth(now.getMonth());
            end.setDate(0); // Last day of previous month
            end.setHours(23, 59, 59, 999);
            return { start, end };

        case 'last_3_months':
            start.setMonth(now.getMonth() - 3);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };

        case 'last_6_months':
            start.setMonth(now.getMonth() - 6);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };

        case 'this_year':
            start.setMonth(0); // January
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };

        case 'last_year':
            start.setFullYear(now.getFullYear() - 1);
            start.setMonth(0);
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setFullYear(now.getFullYear() - 1);
            end.setMonth(11); // December
            end.setDate(31);
            end.setHours(23, 59, 59, 999);
            return { start, end };

        case 'custom':
            return { start: customStart, end: customEnd };

        case 'all':
        default:
            return { start: undefined, end: undefined };
    }
};

export default function ExecutiveDashboardPage() {
    const { user } = useAuth();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
    const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [selectedBrandFilter, setSelectedBrandFilter] = useState<string | null>(null);

    // Get date range from preset
    const dateRange = getDateRange(datePreset, customStartDate, customEndDate);
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    // Handle preset change
    const handlePresetChange = (value: DatePreset) => {
        setDatePreset(value);
        if (value === 'custom') {
            setShowCustomPicker(true);
        } else {
            setShowCustomPicker(false);
        }
    };

    // Format date for input (YYYY-MM-DD)
    const formatDateForInput = (date?: Date) => {
        if (!date) return '';
        return date.toISOString().split('T')[0];
    };

    // Parse date from input
    const parseDateFromInput = (dateString: string): Date | undefined => {
        if (!dateString) return undefined;
        const date = new Date(dateString);
        date.setHours(0, 0, 0, 0);
        return date;
    };

    const { data: companiesData, isLoading: companiesLoading, refetch: refetchCompanies } = useExecutiveCompanies();

    // 🔴 LIVE TRACKING: Auto-refresh when orders/sales happen in assigned companies
    const companyIds = companiesData?.companyIds || [];
    useExecutiveRealtime(companyIds);

    // Filter by selected company or use all companies
    const filteredCompanyIds = selectedCompanyId ? [selectedCompanyId] : companyIds;

    const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useExecutiveStats(startDate, endDate, filteredCompanyIds);
    const { data: breakdown, isLoading: breakdownLoading, refetch: refetchBreakdown } = useExecutiveCompanyBreakdown(startDate, endDate, filteredCompanyIds);
    const { data: trends, isLoading: trendsLoading, refetch: refetchTrends } = useExecutiveRevenueTrends(startDate, endDate, filteredCompanyIds, 30);
    const { data: topPerformers, isLoading: performersLoading, refetch: refetchPerformers } = useExecutiveTopPerformers(startDate, endDate, filteredCompanyIds, 10);
    const { data: activity, isLoading: activityLoading, refetch: refetchActivity } = useExecutiveRecentActivity(startDate, endDate, filteredCompanyIds, 15);
    const { data: brandPerformance, isLoading: brandPerformanceLoading, refetch: refetchBrandPerformance } = useExecutiveBrandPerformance(startDate, endDate, filteredCompanyIds, selectedBrandFilter);

    // Calculate pie chart data
    const pieData = stats ? [
        { name: 'Approved', value: stats.totalRevenue, color: '#16a34a' }, // green-600
        { name: 'Pending', value: stats.pendingRevenue, color: '#f97316' }  // orange-500
    ] : [];

    // Calculate Brand Distribution data for Summary
    const brandDistributionData = (() => {
        if (!brandPerformance?.brands || brandPerformance.brands.length === 0) return [];

        // Take top 4 brands, group rest as "Others"
        const topBrands = brandPerformance.brands.slice(0, 4);
        const others = brandPerformance.brands.slice(4);

        const palette = [
            '#06b6d4', // Cyan
            '#8b5cf6', // Violet
            '#f59e0b', // Amber
            '#10b981', // Emerald
            '#f43f5e'  // Rose
        ];

        const data = topBrands.map((brand, index) => ({
            name: brand.brandName,
            value: brand.totalRevenue,
            quantity: brand.totalQuantity,
            color: palette[index]
        }));

        if (others.length > 0) {
            const othersRevenue = others.reduce((sum, b) => sum + b.totalRevenue, 0);
            const othersQty = others.reduce((sum, b) => sum + b.totalQuantity, 0);
            data.push({
                name: 'Others',
                value: othersRevenue,
                quantity: othersQty,
                color: '#94a3b8' // Slate 400
            });
        }

        return data;
    })();

    const formatCurrency = (val: number) =>
        `₱${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Process data for the new "Total Brand Performance" section
    const detailedBrandData = (() => {
        if (!brandPerformance) return [];

        const aggregated: any[] = [];

        // Brand-specific type mapping to match image
        const getTypeLabel = (brandName: string, type: string) => {
            const b = brandName?.toUpperCase();
            if (b?.includes('FORGE') || b?.includes('XFORGE')) {
                return type === 'flavor' ? 'Pods' : 'Device';
            }
            if (b?.includes('CHILLAX') || b?.includes('AMZ')) {
                return 'Set';
            }
            return type === 'flavor' ? 'Flavor' : 'Battery';
        };

        const getPieLabel = (brandName: string, type: string) => {
            const b = brandName?.toUpperCase();
            if (b?.includes('FORGE') || b?.includes('XFORGE')) {
                return type === 'flavor' ? 'FORGE PODS' : 'FORGE BATT';
            }
            return brandName; // Just brand name for others as per image
        };

        const brands = new Set([
            ...brandPerformance.flavors.map(f => f.brandId),
            ...brandPerformance.batteries.map(b => b.brandId)
        ]);

        brands.forEach(brandId => {
            const brandFlavors = brandPerformance.flavors.filter(f => f.brandId === brandId);
            const brandBatteries = brandPerformance.batteries.filter(b => b.brandId === brandId);

            const brandName = brandFlavors[0]?.brandName || brandBatteries[0]?.brandName || 'Unknown';

            const types: any[] = [];

            if (brandFlavors.length > 0) {
                const qty = brandFlavors.reduce((sum, f) => sum + f.totalQuantity, 0);
                const rev = brandFlavors.reduce((sum, f) => sum + f.totalRevenue, 0);
                types.push({
                    type: 'flavor',
                    label: getTypeLabel(brandName, 'flavor'),
                    pieLabel: getPieLabel(brandName, 'flavor'),
                    qty,
                    rev,
                    unitCost: qty > 0 ? rev / qty : 0
                });
            }

            if (brandBatteries.length > 0) {
                const qty = brandBatteries.reduce((sum, b) => sum + b.totalQuantity, 0);
                const rev = brandBatteries.reduce((sum, b) => sum + b.totalRevenue, 0);
                types.push({
                    type: 'battery',
                    label: getTypeLabel(brandName, 'battery'),
                    pieLabel: getPieLabel(brandName, 'battery'),
                    qty,
                    rev,
                    unitCost: qty > 0 ? rev / qty : 0
                });
            }

            if (types.length > 0) {
                aggregated.push({
                    brandId,
                    brandName: brandName.toUpperCase().includes('XFORGE') ? 'XFORGE' : brandName,
                    types
                });
            }
        });

        return aggregated;
    })();

    const getPieColor = (label: string) => {
        const l = label.toUpperCase();

        // Completely distinct colors from different parts of the spectrum
        // Each color is from a different hue family to avoid confusion
        if (l.includes('FORGE PODS')) return '#3B82F6'; // Blue
        if (l.includes('FORGE BATT')) return '#10B981'; // Green
        if (l.includes('CHILLAX INFINITE')) return '#F59E0B'; // Orange
        if (l.includes('CHILLAX') && !l.includes('INFINITE')) return '#FBBF24'; // Yellow
        if (l.includes('AMZ')) return '#8B5CF6'; // Purple
        if (l.includes('ONE BAR V1')) return '#EC4899'; // Pink
        if (l.includes('X-ULTRA LITE') || l.includes('X ULTRA LITE')) return '#06B6D4'; // Cyan
        if (l.includes('FORGE') && !l.includes('PODS') && !l.includes('BATT')) return '#14B8A6'; // Teal

        // Fallback colors - all from completely different hue families
        const fallbackColors = [
            '#EF4444', // Red
            '#6366F1', // Indigo  
            '#84CC16', // Lime
            '#F97316', // Deep Orange
            '#A855F7', // Violet
            '#22D3EE', // Light Cyan
            '#FB923C', // Amber
            '#D946EF', // Fuchsia
            '#059669', // Emerald
            '#7C3AED', // Purple
            '#F472B6', // Rose
            '#0EA5E9', // Sky Blue
        ];

        // Use label hash to pick a consistent color
        const hash = label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return fallbackColors[hash % fallbackColors.length];
    };

    // Manual refresh function
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                refetchCompanies(),
                refetchStats(),
                refetchBreakdown(),
                refetchTrends(),
                refetchPerformers(),
                refetchActivity(),
                refetchBrandPerformance()
            ]);
        } finally {
            setIsRefreshing(false);
        }
    };

    if (!user || user.role !== 'executive') {
        return (
            <div className="p-8 text-center text-red-500 font-bold">
                Access Denied: Executive Accounts Only
            </div>
        );
    }

    if (companiesLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const companies = companiesData?.companies || [];
    const companyCount = companies.length;

    if (companyCount === 0) {
        return (
            <div className="container mx-auto p-8">
                <div className="text-center py-12">
                    <Building2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h2 className="text-2xl font-bold mb-2">No Companies Assigned</h2>
                    <p className="text-muted-foreground">
                        Contact your system administrator to assign companies to your account.
                    </p>
                </div>
            </div>
        );
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return <Badge variant="default" className="bg-green-600">Approved</Badge>;
            case 'pending':
                return <Badge variant="secondary">Pending</Badge>;
            case 'rejected':
                return <Badge variant="destructive">Rejected</Badge>;
            default:
                return <Badge>{status}</Badge>;
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-8">
            {/* Header */}
            <div className="space-y-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    {/* Title Section */}
                    <div className="space-y-4 flex-1">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                            <TrendingUp className="h-3 w-3" />
                            Executive Overview
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic">
                            Executive <span className="text-primary not-italic">Dashboard</span>
                        </h1>
                        <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
                            Aggregated view across {companyCount} {companyCount === 1 ? 'company' : 'companies'}. Read-only access to comprehensive business metrics.
                        </p>
                    </div>

                    {/* Actions Section */}
                    <div className="flex items-center gap-3 lg:pt-8">
                        {/* Date Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="lg" className="min-w-[220px] justify-between">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        <span className="text-sm">
                                            {datePreset === 'custom'
                                                ? customStartDate && customEndDate
                                                    ? `${formatDateForInput(customStartDate)} to ${formatDateForInput(customEndDate)}`
                                                    : 'Select dates...'
                                                : datePreset === 'all' ? 'All Time'
                                                    : datePreset === 'this_month' ? 'This Month'
                                                        : datePreset === 'last_month' ? 'Last Month'
                                                            : datePreset === 'last_3_months' ? 'Last 3 Months'
                                                                : datePreset === 'last_6_months' ? 'Last 6 Months'
                                                                    : datePreset === 'this_year' ? 'This Year'
                                                                        : datePreset === 'last_year' ? 'Last Year'
                                                                            : 'Select period'
                                            }
                                        </span>
                                    </div>
                                    <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[360px] p-0" align="end">
                                <div className="p-4 space-y-4">
                                    {/* Preset Options */}
                                    <div className="space-y-3">
                                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Filters</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant={datePreset === 'this_month' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('this_month')}
                                                className="justify-center h-9"
                                            >
                                                This Month
                                            </Button>
                                            <Button
                                                variant={datePreset === 'last_month' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('last_month')}
                                                className="justify-center h-9"
                                            >
                                                Last Month
                                            </Button>
                                            <Button
                                                variant={datePreset === 'last_3_months' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('last_3_months')}
                                                className="justify-center h-9"
                                            >
                                                Last 3 Months
                                            </Button>
                                            <Button
                                                variant={datePreset === 'last_6_months' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('last_6_months')}
                                                className="justify-center h-9"
                                            >
                                                Last 6 Months
                                            </Button>
                                            <Button
                                                variant={datePreset === 'this_year' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('this_year')}
                                                className="justify-center h-9"
                                            >
                                                This Year
                                            </Button>
                                            <Button
                                                variant={datePreset === 'last_year' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('last_year')}
                                                className="justify-center h-9"
                                            >
                                                Last Year
                                            </Button>
                                            <Button
                                                variant={datePreset === 'all' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('all')}
                                                className="justify-center col-span-2 h-9"
                                            >
                                                All Time
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Custom Date Range */}
                                    <div className="space-y-3 pt-3 border-t">
                                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Range</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="start-date" className="text-xs text-muted-foreground">From</Label>
                                                <Input
                                                    id="start-date"
                                                    type="date"
                                                    value={formatDateForInput(customStartDate)}
                                                    onChange={(e) => {
                                                        const date = parseDateFromInput(e.target.value);
                                                        setCustomStartDate(date);
                                                        if (date && customEndDate) {
                                                            handlePresetChange('custom');
                                                        }
                                                    }}
                                                    className="h-9"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="end-date" className="text-xs text-muted-foreground">To</Label>
                                                <Input
                                                    id="end-date"
                                                    type="date"
                                                    value={formatDateForInput(customEndDate)}
                                                    onChange={(e) => {
                                                        const date = parseDateFromInput(e.target.value);
                                                        setCustomEndDate(date);
                                                        if (customStartDate && date) {
                                                            handlePresetChange('custom');
                                                        }
                                                    }}
                                                    className="h-9"
                                                />
                                            </div>
                                        </div>
                                        {customStartDate && customEndDate && (
                                            <Button
                                                variant={datePreset === 'custom' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handlePresetChange('custom')}
                                                className="w-full h-9"
                                            >
                                                <Calendar className="h-4 w-4 mr-2" />
                                                Apply Custom Range
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Refresh Button */}
                        <Button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            variant="outline"
                            size="lg"
                            className="flex items-center gap-2"
                        >
                            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Assigned Companies - Clickable Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Your Assigned Companies
                        </div>
                        {selectedCompanyId && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedCompanyId(null)}
                                className="text-xs"
                            >
                                Clear Filter
                            </Button>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {selectedCompanyId
                                ? 'Showing data for selected company only. Click another company or "Clear Filter" to view all.'
                                : 'Click any company to filter dashboard data. Showing all companies by default.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {/* All Companies Badge */}
                            <Badge
                                variant={selectedCompanyId === null ? 'default' : 'outline'}
                                className={`text-sm py-2 px-4 cursor-pointer transition-all hover:scale-105 ${selectedCompanyId === null
                                        ? 'shadow-md'
                                        : 'hover:bg-secondary'
                                    }`}
                                onClick={() => setSelectedCompanyId(null)}
                            >
                                <Building2 className="h-3 w-3 mr-1.5" />
                                All Companies ({companyCount})
                            </Badge>

                            {/* Individual Company Badges */}
                            {companies.map((company) => (
                                <Badge
                                    key={company.id}
                                    variant={selectedCompanyId === company.id ? 'default' : 'secondary'}
                                    className={`text-sm py-2 px-4 cursor-pointer transition-all hover:scale-105 ${selectedCompanyId === company.id
                                            ? 'shadow-md ring-2 ring-primary ring-offset-2'
                                            : 'hover:bg-primary/20'
                                        }`}
                                    onClick={() => setSelectedCompanyId(company.id)}
                                >
                                    {company.company_name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* KPI Cards (Quick Stats) */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {statsLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {stats?.approvedOrders || 0} approved, {stats?.pendingOrders || 0} pending
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {statsLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{stats?.totalAgents || 0}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Active sales agents
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {statsLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Active client accounts
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Analysis (Charts) */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Revenue Overview - Pie Chart */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Revenue Breakdown
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {statsLoading ? (
                            <div className="flex justify-center items-center h-[300px]">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-6 pt-4">
                                {/* Pie Chart */}
                                <div className="w-[200px] h-[200px] relative flex-shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={65}
                                                outerRadius={90}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Center Text */}
                                    <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Projected</span>
                                        <span className="font-bold text-sm text-blue-600">
                                            {formatCurrency(stats?.projectedRevenue || 0)}
                                        </span>
                                    </div>
                                </div>

                                {/* Legend / Stats */}
                                <div className="w-full space-y-3">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                                            <div>
                                                <div className="text-xs font-semibold text-green-900">Approved</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-green-700">{formatCurrency(stats?.totalRevenue || 0)}</div>
                                            <div className="text-[10px] text-green-600 font-medium">
                                                {stats?.projectedRevenue ? ((stats.totalRevenue / stats.projectedRevenue) * 100).toFixed(1) : 0}%
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border border-orange-100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                                            <div>
                                                <div className="text-xs font-semibold text-orange-900">Pending</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-orange-700">{formatCurrency(stats?.pendingRevenue || 0)}</div>
                                            <div className="text-[10px] text-orange-600 font-medium">
                                                {stats?.projectedRevenue ? ((stats.pendingRevenue / stats.projectedRevenue) * 100).toFixed(1) : 0}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Revenue Trends Chart */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Revenue Trends ({
                                datePreset === 'custom'
                                    ? customStartDate && customEndDate
                                        ? `${new Date(customStartDate).toLocaleDateString()} - ${new Date(customEndDate).toLocaleDateString()}`
                                        : 'Custom Range'
                                    : datePreset === 'all' ? 'All Time'
                                        : datePreset === 'this_month' ? 'This Month'
                                            : datePreset === 'last_month' ? 'Last Month'
                                                : datePreset === 'last_3_months' ? 'Last 3 Months'
                                                    : datePreset === 'last_6_months' ? 'Last 6 Months'
                                                        : datePreset === 'this_year' ? 'This Year'
                                                            : datePreset === 'last_year' ? 'Last Year'
                                                                : 'Last 30 Days'
                            })
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {trendsLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : trends && trends.length > 0 ? (
                            <div className="h-[250px] md:h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                                        <XAxis
                                            dataKey="date"
                                            className="text-[10px] md:text-xs"
                                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                            tickFormatter={(value) => {
                                                const date = new Date(value);
                                                return `${date.getDate()}/${date.getMonth() + 1}`;
                                            }}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            className="text-[10px] md:text-xs"
                                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                            tickFormatter={(value) => {
                                                if (value >= 1000000) return `₱${(value / 1000000).toFixed(1)}M`;
                                                if (value >= 1000) return `₱${(value / 1000).toFixed(1)}k`;
                                                return `₱${value}`;
                                            }}
                                            width={45}
                                        />
                                        <Tooltip
                                            formatter={(value: any) => [`₱${value.toLocaleString()}`, 'Revenue']}
                                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--background))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="hsl(var(--primary))"
                                            fillOpacity={1}
                                            fill="url(#colorRevenue)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                No revenue data available for the selected period
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Total Brand Performance Section - New Unified View */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <Award className="h-5 w-5" />
                        Total Brand Performance
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {selectedBrandFilter && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBrandFilter(null)}
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                            >
                                Clear
                            </Button>
                        )}
                        <Select value={selectedBrandFilter || 'all'} onValueChange={(value) => setSelectedBrandFilter(value === 'all' ? null : value)}>
                            <SelectTrigger className="w-[180px] h-8 text-xs font-medium">
                                <SelectValue placeholder="All Brands" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Brands</SelectItem>
                                {brandPerformance?.brands.map((brand) => (
                                    <SelectItem key={brand.brandId} value={brand.brandId}>
                                        {brand.brandName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {brandPerformanceLoading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid lg:grid-cols-12 gap-0">
                            {/* Left: Detailed Performance Table */}
                            <div className="lg:col-span-7 p-6">
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[200px]">Brand / Variant</TableHead>
                                                <TableHead className="text-center">Qty Sold</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(() => {
                                                const brandColors: Record<string, string> = {
                                                    'XFORGE': 'bg-cyan-500',
                                                    'CHILLAX': 'bg-orange-500',
                                                    'AMZ': 'bg-purple-500'
                                                };

                                                let grandTotalQty = 0;
                                                let grandTotalAmount = 0;

                                                return (
                                                    <Fragment>
                                                        {detailedBrandData.map((brand) => {
                                                            const brandTotalAmount = brand.types.reduce((sum: number, t: any) => sum + t.rev, 0);
                                                            grandTotalQty += brand.types.reduce((sum: number, t: any) => sum + t.qty, 0);
                                                            grandTotalAmount += brandTotalAmount;

                                                            return (
                                                                <Fragment key={brand.brandId}>
                                                                    <TableRow className="bg-muted/30">
                                                                        <TableCell className="font-bold py-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className={`w-1.5 h-1.5 rounded-full ${brandColors[brand.brandName] || 'bg-muted-foreground'}`} />
                                                                                {brand.brandName}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="bg-muted/30" />
                                                                        <TableCell className="text-right font-bold py-2">
                                                                            {formatCurrency(brandTotalAmount)}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                    {brand.types.map((type: any, idx: number) => (
                                                                        <TableRow key={`${brand.brandId}-${idx}`}>
                                                                            <TableCell className="pl-6 text-xs text-muted-foreground font-medium">
                                                                                {type.label}
                                                                            </TableCell>
                                                                            <TableCell className="text-center text-xs">
                                                                                {type.qty.toLocaleString()}
                                                                            </TableCell>
                                                                            <TableCell className="text-right text-xs font-semibold">
                                                                                {formatCurrency(type.rev)}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </Fragment>
                                                            );
                                                        })}
                                                        <TableRow className="border-t-2 font-bold bg-muted/10">
                                                            <TableCell>Total</TableCell>
                                                            <TableCell className="text-center">{grandTotalQty.toLocaleString()}</TableCell>
                                                            <TableCell className="text-right text-primary">
                                                                {formatCurrency(grandTotalAmount)}
                                                            </TableCell>
                                                        </TableRow>
                                                    </Fragment>
                                                );
                                            })()}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            {/* Right: Pie Chart Section */}
                            <div className="lg:col-span-5 p-6 border-l flex flex-col items-center justify-center">
                                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-6 self-start">
                                    Brand Revenue Distribution
                                </h4>

                                <div className="w-full h-[350px] relative">
                                    {(() => {
                                        const pieChartData = detailedBrandData.flatMap(brand =>
                                            brand.types.map((type: any) => ({
                                                name: type.pieLabel,
                                                value: type.qty,
                                                revenue: type.rev,
                                                color: getPieColor(type.pieLabel)
                                            }))
                                        );

                                        return (
                                            <>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={pieChartData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={60}
                                                            outerRadius={100}
                                                            paddingAngle={3}
                                                            dataKey="value"
                                                            stroke="none"
                                                            isAnimationActive={true}
                                                            activeShape={false}
                                                        >
                                                            {pieChartData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.color} style={{ outline: 'none' }} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip
                                                            content={({ active, payload }) => {
                                                                if (active && payload && payload.length) {
                                                                    const data = payload[0].payload;
                                                                    const total = pieChartData.reduce((sum, item) => sum + item.value, 0);
                                                                    const percentage = ((data.value / total) * 100).toFixed(1);

                                                                    return (
                                                                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                                                                            <p className="font-bold text-sm mb-1">{data.name}</p>
                                                                            <p className="text-xs text-muted-foreground">
                                                                                {data.value.toLocaleString()} units ({percentage}%)
                                                                            </p>
                                                                            <p className="text-xs font-semibold text-primary mt-1">
                                                                                {formatCurrency(data.revenue)}
                                                                            </p>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            }}
                                                        />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                {/* Center Label */}
                                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Total Units</span>
                                                    <span className="text-2xl font-bold">{pieChartData.reduce((sum, item) => sum + item.value, 0).toLocaleString()}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Custom Legend Below Chart */}
                                <div className="w-full mt-4 grid grid-cols-2 gap-x-4 gap-y-2 max-h-[200px] overflow-y-auto px-2">
                                    {(() => {
                                        const pieChartData = detailedBrandData.flatMap(brand =>
                                            brand.types.map((type: any) => ({
                                                name: type.pieLabel,
                                                value: type.qty,
                                                revenue: type.rev,
                                                color: getPieColor(type.pieLabel)
                                            }))
                                        );
                                        const total = pieChartData.reduce((sum, item) => sum + item.value, 0);

                                        return pieChartData.map((item, index) => {
                                            const percentage = ((item.value / total) * 100).toFixed(0);
                                            return (
                                                <div key={index} className="flex items-center gap-2 text-xs">
                                                    <div
                                                        className="w-3 h-3 rounded-sm flex-shrink-0"
                                                        style={{ backgroundColor: item.color }}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold truncate text-[11px]">{item.name}</p>
                                                        <p className="text-[10px] text-muted-foreground">{percentage}% share</p>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Product Performance Insight - Minimalist Refined */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Product Performance Breakdown
                        {selectedBrandFilter && (
                            <span className="text-muted-foreground font-normal text-base">
                                — {brandPerformance?.brands.find(b => b.brandId === selectedBrandFilter)?.brandName}
                            </span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {brandPerformanceLoading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : brandPerformance ? (
                        <div className="space-y-4 md:space-y-6">
                            {/* The Main Chart Area */}
                            <div className="h-[280px] md:h-[360px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={[...brandPerformance.flavors, ...brandPerformance.batteries]
                                            .sort((a, b) => b.totalQuantity - a.totalQuantity)
                                            .slice(0, window.innerWidth < 768 ? 10 : 15)
                                        }
                                        margin={{ top: 10, right: 5, left: 5, bottom: 70 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                                        <XAxis
                                            dataKey="variantName"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={(props) => {
                                                const { x, y, payload } = props;
                                                const item = [...brandPerformance.flavors, ...brandPerformance.batteries]
                                                    .sort((a, b) => b.totalQuantity - a.totalQuantity)
                                                    .slice(0, window.innerWidth < 768 ? 10 : 15)
                                                    .find(d => d.variantName === payload.value);

                                                return (
                                                    <g transform={`translate(${x},${y})`}>
                                                        <text
                                                            x={0}
                                                            y={0}
                                                            dy={8}
                                                            textAnchor="end"
                                                            fill="hsl(var(--muted-foreground))"
                                                            fontSize={window.innerWidth < 768 ? 11 : 12}
                                                            fontWeight={600}
                                                            transform="rotate(-45)"
                                                        >
                                                            {`${payload.value} (${item?.totalQuantity.toLocaleString() || 0})`}
                                                        </text>
                                                    </g>
                                                );
                                            }}
                                            height={70}
                                            interval={0}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                                            width={25}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--background))',
                                                border: '1px solid hsl(var(--border))',
                                                borderRadius: '8px',
                                                fontSize: '11px'
                                            }}
                                        />
                                        <Bar
                                            dataKey="totalQuantity"
                                            fill="hsl(var(--primary))"
                                            barSize={32}
                                            radius={[4, 4, 0, 0]}
                                            opacity={0.85}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Minimalist Summary */}
                            <div className="flex justify-center md:justify-end mt-2">
                                <div className="rounded-lg border bg-background overflow-hidden shadow-sm w-full max-w-[280px] md:max-w-none md:min-w-[220px]">
                                    <div className="px-4 py-2 bg-muted/40 border-b">
                                        <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                                            {selectedBrandFilter ? brandPerformance?.brands.find(b => b.brandId === selectedBrandFilter)?.brandName : 'Total'} Summary
                                        </span>
                                    </div>
                                    <div className="divide-y divide-border/50">
                                        <div className="flex items-center justify-between px-4 py-3 gap-6 md:gap-8">
                                            <span className="text-xs font-medium text-muted-foreground">Pods</span>
                                            <span className="text-base font-bold tabular-nums">
                                                {brandPerformance.flavors.reduce((sum, f) => sum + f.totalQuantity, 0).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-3 gap-6 md:gap-8">
                                            <span className="text-xs font-medium text-muted-foreground">Devices</span>
                                            <span className="text-base font-bold tabular-nums">
                                                {brandPerformance.batteries.reduce((sum, b) => sum + b.totalQuantity, 0).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-20 text-muted-foreground">
                            No product performance data available
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Company Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Performance by Company
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {breakdownLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : breakdown && breakdown.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Company</TableHead>
                                        <TableHead className="text-right">Revenue</TableHead>
                                        <TableHead className="text-right">Orders</TableHead>
                                        <TableHead className="text-right">Agents</TableHead>
                                        <TableHead className="text-right">Clients</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {breakdown.map((item) => (
                                        <TableRow key={item.company.id}>
                                            <TableCell className="font-medium">
                                                <div>
                                                    <div className="font-semibold">{item.company.company_name}</div>
                                                    <div className="text-xs text-muted-foreground">{item.company.company_email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                ₱{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div>{item.ordersCount}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {item.approvedOrders} approved
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">{item.agentsCount}</TableCell>
                                            <TableCell className="text-right">{item.clientsCount}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            No company data available
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Top Performers and Recent Activity */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Top Performers */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Award className="h-5 w-5" />
                            Top Performers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {performersLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : topPerformers && topPerformers.length > 0 ? (
                            <div className="space-y-4">
                                {topPerformers.map((performer, index) => (
                                    <div key={performer.agentId} className="flex items-center gap-3">
                                        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                                index === 1 ? 'bg-gray-100 text-gray-700' :
                                                    index === 2 ? 'bg-orange-100 text-orange-700' :
                                                        'bg-muted text-muted-foreground'
                                            }`}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-semibold">{performer.agentName}</div>
                                            <div className="text-xs text-muted-foreground">{performer.companyName}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-semibold">₱{performer.totalRevenue.toLocaleString()}</div>
                                            <div className="text-xs text-muted-foreground">{performer.ordersCount} orders</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                No performance data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {activityLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : activity && activity.length > 0 ? (
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                                {activity.map((item) => (
                                    <div key={item.id} className="flex gap-3 items-start pb-3 border-b last:border-0">
                                        <div className="mt-1">
                                            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm">{item.title}</span>
                                                {getStatusBadge(item.status)}
                                            </div>
                                            <p className="text-xs text-muted-foreground">{item.description}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Building2 className="h-3 w-3" />
                                                {item.companyName}
                                                <span>•</span>
                                                <span>{new Date(item.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-semibold">₱{item.amount.toLocaleString()}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                No recent activity
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Read-Only Notice */}
            <Card className="bg-muted/50 border-muted">
                <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground text-center">
                        <strong>Read-Only Access:</strong> This dashboard provides view-only access to data.
                        You cannot make changes or perform actions on behalf of these companies.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
