import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, MapPin, BadgeCheck, Users, Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface CityOption {
  city: string;
  count: number;
  // Agents known to have clients in this city (deduplicated)
  holderNames: string[]; 
}

interface Company {
  id: string;
  company_name: string;
}

interface WarRoomFiltersProps {
  // Manager / Hierarchy
  managers: { id: string; name: string }[];
  selectedManagerId: string;
  onManagerChange: (value: string) => void;

  // Cities
  cityOptions: CityOption[];
  selectedCities: string[];
  onCityToggle: (city: string, checked: boolean) => void;
  onSelectAllCities: (checked: boolean) => void;

  // Brands
  brands: { id: string; name: string }[];
  selectedBrandIds: string[];
  onBrandToggle: (brandId: string, checked: boolean) => void;

  // Search
  searchQuery: string;
  onSearchChange: (value: string) => void;

  // Executive Company Filter
  isExecutive?: boolean;
  companies?: Company[];
  selectedCompanyIds?: string[];
  onCompanyToggle?: (companyId: string, checked: boolean) => void;
  onSelectAllCompanies?: (checked: boolean) => void;
}

export function WarRoomFilters({
  managers,
  selectedManagerId,
  onManagerChange,
  cityOptions,
  selectedCities,
  onCityToggle,
  onSelectAllCities,
  brands,
  selectedBrandIds,
  onBrandToggle,
  searchQuery,
  onSearchChange,
  isExecutive = false,
  companies = [],
  selectedCompanyIds = [],
  onCompanyToggle,
  onSelectAllCompanies,
}: WarRoomFiltersProps) {
  const allCitiesSelected = cityOptions.length > 0 && selectedCities.length === cityOptions.length;
  const isIndeterminate = selectedCities.length > 0 && selectedCities.length < cityOptions.length;
  const allCompaniesSelected = companies.length > 0 && selectedCompanyIds.length === companies.length;

  return (
    <Card className="flex flex-col h-full bg-background border-border shadow-sm">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Map Filters
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* 1. Search */}
          <div className="space-y-2">
            <Label>Search Clients</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name, shop, or address..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          <Separator />

          {/* Executive Company Filter */}
          {isExecutive && companies.length > 0 && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <Label className="font-medium">
                      Companies ({selectedCompanyIds.length}/{companies.length})
                    </Label>
                  </div>
                  {companies.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="select-all-companies"
                        checked={allCompaniesSelected}
                        onCheckedChange={(checked) => onSelectAllCompanies?.(!!checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="select-all-companies" className="text-xs font-normal cursor-pointer text-muted-foreground">
                        All
                      </Label>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pl-1">
                  {companies.map((company) => (
                    <div key={company.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`company-${company.id}`}
                        checked={selectedCompanyIds.includes(company.id)}
                        onCheckedChange={(checked) => onCompanyToggle?.(company.id, !!checked)}
                      />
                      <Label
                        htmlFor={`company-${company.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {company.company_name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />
            </>
          )}

          {/* 2. Manager Team Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Manager Team</Label>
            </div>
            <Select value={selectedManagerId} onValueChange={onManagerChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    Team {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* 3. City Showcase */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">
                  Cities ({selectedCities.length}/{cityOptions.length})
                </Label>
              </div>
              {cityOptions.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all-cities"
                    checked={allCitiesSelected}
                    onCheckedChange={(checked) => onSelectAllCities(!!checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="select-all-cities" className="text-xs font-normal cursor-pointer text-muted-foreground">
                    All
                  </Label>
                </div>
              )}
            </div>

            {cityOptions.length === 0 ? (
              <div className="text-sm text-muted-foreground italic px-2">
                No cities found for selected team.
              </div>
            ) : (
              <div className="space-y-3 pl-1">
                {cityOptions.map((option) => (
                  <div key={option.city} className="flex flex-col gap-1.5 relative border-l-2 border-muted pl-3 hover:border-primary/50 transition-colors">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`city-${option.city}`}
                        checked={selectedCities.includes(option.city)}
                        onCheckedChange={(checked) => onCityToggle(option.city, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`city-${option.city}`}
                          className="text-sm font-medium cursor-pointer block leading-none mb-1"
                        >
                          {option.city}
                        </Label>
                        {/* Holder Names */}
                        {option.holderNames.length > 0 && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                             Held by: <span className="text-foreground/80">{option.holderNames.join(', ')}</span>
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {option.count} {option.count === 1 ? 'Client' : 'Clients'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* 4. Brand Filter */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Brands Held</Label>
            </div>
            
            {brands.length === 0 ? (
              <p className="text-sm text-muted-foreground">No brands available.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 pl-1">
                {brands.map((brand) => (
                  <div key={brand.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`brand-${brand.id}`}
                      checked={selectedBrandIds.includes(brand.id)}
                      onCheckedChange={(checked) => onBrandToggle(brand.id, !!checked)}
                    />
                    <Label
                      htmlFor={`brand-${brand.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {brand.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}

