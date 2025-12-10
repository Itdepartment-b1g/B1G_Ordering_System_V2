import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface WarRoomFiltersProps {
  accountTypeFilter: 'all' | 'Key Accounts' | 'Standard Accounts';
  hasForgeFilter: 'all' | 'yes' | 'no';
  searchQuery: string;
  onAccountTypeChange: (value: 'all' | 'Key Accounts' | 'Standard Accounts') => void;
  onHasForgeChange: (value: 'all' | 'yes' | 'no') => void;
  onSearchChange: (value: string) => void;
}

export function WarRoomFilters({
  accountTypeFilter,
  hasForgeFilter,
  searchQuery,
  onAccountTypeChange,
  onHasForgeChange,
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
            placeholder="Search by name or company..."
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

      {/* Has Forge Filter */}
      <div>
        <Label className="mb-2 block">Forge Status</Label>
        <RadioGroup value={hasForgeFilter} onValueChange={onHasForgeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="forge-all" />
            <Label htmlFor="forge-all" className="font-normal cursor-pointer">
              All Status
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="forge-yes" />
            <Label htmlFor="forge-yes" className="font-normal cursor-pointer">
              Has Forge
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="forge-no" />
            <Label htmlFor="forge-no" className="font-normal cursor-pointer">
              No Forge
            </Label>
          </div>
        </RadioGroup>
      </div>
    </Card>
  );
}

