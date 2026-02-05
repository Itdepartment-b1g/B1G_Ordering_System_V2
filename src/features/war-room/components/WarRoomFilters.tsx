import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search } from 'lucide-react';

interface WarRoomFiltersProps {
  accountTypeFilter: 'all' | 'Key Accounts' | 'Standard Accounts';
  roleFilter: 'all' | 'mobile_sales' | 'team_leader' | 'manager';
  brands: { id: string; name: string }[];
  selectedBrandIds: string[];
  searchQuery: string;
  onAccountTypeChange: (value: 'all' | 'Key Accounts' | 'Standard Accounts') => void;
  onRoleChange: (value: 'all' | 'mobile_sales' | 'team_leader' | 'manager') => void;
  onBrandToggle: (brandId: string, checked: boolean) => void;
  onSearchChange: (value: string) => void;
}

export function WarRoomFilters({
  accountTypeFilter,
  roleFilter,
  brands,
  selectedBrandIds,
  searchQuery,
  onAccountTypeChange,
  onRoleChange,
  onBrandToggle,
  onSearchChange
}: WarRoomFiltersProps) {
  return (
    <Card className="p-4 space-y-4">
      {/* Search */}
      <div>
        <Label className="mb-2 block">Search Client</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or shop name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Account Type Filter */}
      <div>
        <Label className="mb-2 block">Account Type</Label>
        <RadioGroup value={accountTypeFilter} onValueChange={onAccountTypeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="account-all" />
            <Label htmlFor="account-all" className="font-normal cursor-pointer">
              All Accounts
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="Key Accounts" id="account-key" />
            <Label htmlFor="account-key" className="font-normal cursor-pointer">
              Key Accounts
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="Standard Accounts" id="account-standard" />
            <Label htmlFor="account-standard" className="font-normal cursor-pointer">
              Standard Accounts
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Brands Filter */}
      <div>
        <Label className="mb-2 block">Brands Client is Holding</Label>
        {brands.length === 0 ? (
          <p className="text-xs text-muted-foreground">No brands configured for this company.</p>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
            {brands.map((brand) => (
              <div key={brand.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`warroom-brand-${brand.id}`}
                  checked={selectedBrandIds.includes(brand.id)}
                  onCheckedChange={(checked) => onBrandToggle(brand.id, !!checked)}
                />
                <Label
                  htmlFor={`warroom-brand-${brand.id}`}
                  className="font-normal text-sm cursor-pointer"
                >
                  {brand.name}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Role Filter */}
      <div>
        <Label className="mb-2 block">Team Role</Label>
        <RadioGroup value={roleFilter} onValueChange={onRoleChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="role-all" />
            <Label htmlFor="role-all" className="font-normal cursor-pointer">
              All Roles
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="mobile_sales" id="role-mobile" />
            <Label htmlFor="role-mobile" className="font-normal cursor-pointer">
              Mobile Sales
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="team_leader" id="role-leader" />
            <Label htmlFor="role-leader" className="font-normal cursor-pointer">
              Team Leaders
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="manager" id="role-manager" />
            <Label htmlFor="role-manager" className="font-normal cursor-pointer">
              Managers
            </Label>
          </div>
        </RadioGroup>
      </div>
    </Card>
  );
}

