import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, MapPin, BadgeCheck, Users, Building2, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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

  // Mobile Sales Agents
  agents: { id: string; name: string }[];
  selectedAgentIds: string[];
  onAgentToggle: (agentId: string, checked: boolean) => void;
  onSelectAllAgents: (checked: boolean) => void;

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
  agents = [],
  selectedAgentIds = [],
  onAgentToggle,
  onSelectAllAgents,
  searchQuery,
  onSearchChange,
  isExecutive = false,
  companies = [],
  selectedCompanyIds = [],
  onCompanyToggle,
  onSelectAllCompanies,
}: WarRoomFiltersProps) {
  const allCitiesSelected = cityOptions.length > 0 && selectedCities.length === cityOptions.length;
  const allCompaniesSelected = companies.length > 0 && selectedCompanyIds.length === companies.length;
  const allAgentsSelected = agents.length > 0 && selectedAgentIds.length === agents.length;
  
  // Collapsible states - start with only essential filters open
  const [isCitiesOpen, setIsCitiesOpen] = useState(false);
  const [isAgentsOpen, setIsAgentsOpen] = useState(false);
  const [isBrandsOpen, setIsBrandsOpen] = useState(false);
  const [isCompaniesOpen, setIsCompaniesOpen] = useState(false);

  return (
    <div className="flex flex-col h-full bg-background border-r">
      {/* Compact Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground/90 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Filters
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Search - Always visible */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Name, shop, or address..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* Manager Team - Always visible */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Team
            </Label>
            <Select value={selectedManagerId} onValueChange={onManagerChange}>
              <SelectTrigger className="w-full h-8 text-sm">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Executive Company Filter - Collapsible */}
          {isExecutive && companies.length > 0 && (
            <Collapsible open={isCompaniesOpen} onOpenChange={setIsCompaniesOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-muted/50 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">
                    Companies
                    {selectedCompanyIds.length > 0 && (
                      <span className="ml-1.5 text-primary">({selectedCompanyIds.length})</span>
                    )}
                  </span>
                </div>
                {isCompaniesOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2 px-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Select all</span>
                  <Checkbox
                    id="select-all-companies"
                    checked={allCompaniesSelected}
                    onCheckedChange={(checked) => onSelectAllCompanies?.(!!checked)}
                    className="h-3.5 w-3.5"
                  />
                </div>
                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {companies.map((company) => (
                    <div key={company.id} className="flex items-center space-x-2 py-0.5">
                      <Checkbox
                        id={`company-${company.id}`}
                        checked={selectedCompanyIds.includes(company.id)}
                        onCheckedChange={(checked) => onCompanyToggle?.(company.id, !!checked)}
                        className="h-3.5 w-3.5"
                      />
                      <Label
                        htmlFor={`company-${company.id}`}
                        className="text-xs font-normal cursor-pointer flex-1"
                      >
                        {company.company_name}
                      </Label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Cities - Collapsible */}
          <Collapsible open={isCitiesOpen} onOpenChange={setIsCitiesOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-muted/50 rounded transition-colors">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">
                  Cities
                  {selectedCities.length > 0 && (
                    <span className="ml-1.5 text-primary">({selectedCities.length})</span>
                  )}
                </span>
              </div>
              {isCitiesOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2 px-2">
              {cityOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No cities found.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Select all</span>
                    <Checkbox
                      id="select-all-cities"
                      checked={allCitiesSelected}
                      onCheckedChange={(checked) => onSelectAllCities(!!checked)}
                      className="h-3.5 w-3.5"
                    />
                  </div>
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {cityOptions.map((option) => (
                      <div key={option.city} className="flex items-start gap-2 py-1 hover:bg-muted/30 rounded px-1 -mx-1">
                        <Checkbox
                          id={`city-${option.city}`}
                          checked={selectedCities.includes(option.city)}
                          onCheckedChange={(checked) => onCityToggle(option.city, !!checked)}
                          className="mt-0.5 h-3.5 w-3.5"
                        />
                        <div className="flex-1 min-w-0">
                          <Label
                            htmlFor={`city-${option.city}`}
                            className="text-xs font-medium cursor-pointer block leading-tight"
                          >
                            {option.city}
                          </Label>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {option.count} {option.count === 1 ? 'client' : 'clients'}
                            </span>
                            {option.holderNames.length > 0 && (
                              <>
                                <span className="text-[10px] text-muted-foreground">•</span>
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {option.holderNames.slice(0, 1).join(', ')}
                                  {option.holderNames.length > 1 && '...'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Mobile Sales Agents - Collapsible */}
          <Collapsible open={isAgentsOpen} onOpenChange={setIsAgentsOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-muted/50 rounded transition-colors">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">
                  Agents
                  {selectedAgentIds.length > 0 && (
                    <span className="ml-1.5 text-primary">({selectedAgentIds.length})</span>
                  )}
                </span>
              </div>
              {isAgentsOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2 px-2">
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No agents available.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Select all</span>
                    <Checkbox
                      id="select-all-agents"
                      checked={allAgentsSelected}
                      onCheckedChange={(checked) => onSelectAllAgents(!!checked)}
                      className="h-3.5 w-3.5"
                    />
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {agents.map((agent) => (
                      <div key={agent.id} className="flex items-center space-x-2 py-0.5">
                        <Checkbox
                          id={`agent-${agent.id}`}
                          checked={selectedAgentIds.includes(agent.id)}
                          onCheckedChange={(checked) => onAgentToggle(agent.id, !!checked)}
                          className="h-3.5 w-3.5"
                        />
                        <Label
                          htmlFor={`agent-${agent.id}`}
                          className="text-xs font-normal cursor-pointer flex-1"
                        >
                          {agent.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Brands - Collapsible */}
          <Collapsible open={isBrandsOpen} onOpenChange={setIsBrandsOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-2 -mx-2 hover:bg-muted/50 rounded transition-colors">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">
                  Brands
                  {selectedBrandIds.length > 0 && (
                    <span className="ml-1.5 text-primary">({selectedBrandIds.length})</span>
                  )}
                </span>
              </div>
              {isBrandsOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2 px-2">
              {brands.length === 0 ? (
                <p className="text-xs text-muted-foreground">No brands available.</p>
              ) : (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {brands.map((brand) => (
                    <div key={brand.id} className="flex items-center space-x-2 py-0.5">
                      <Checkbox
                        id={`brand-${brand.id}`}
                        checked={selectedBrandIds.includes(brand.id)}
                        onCheckedChange={(checked) => onBrandToggle(brand.id, !!checked)}
                        className="h-3.5 w-3.5"
                      />
                      <Label
                        htmlFor={`brand-${brand.id}`}
                        className="text-xs font-normal cursor-pointer flex-1"
                      >
                        {brand.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  );
}

