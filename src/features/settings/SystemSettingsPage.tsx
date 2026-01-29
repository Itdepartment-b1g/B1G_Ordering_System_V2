import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Settings, DollarSign, Info, Save, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks';
import type { PricingColumn, Company } from '@/types/database.types';
import { PRICING_OPTIONS } from '@/types/database.types';

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyData, setCompanyData] = useState<Company | null>(null);
  
  // Pricing permissions state
  const [teamLeaderPricing, setTeamLeaderPricing] = useState<PricingColumn[]>(['rsp_price']);
  const [mobileSalesPricing, setMobileSalesPricing] = useState<PricingColumn[]>(['rsp_price']);

  // Load company settings
  useEffect(() => {
    if (user?.company_id) {
      fetchCompanySettings();
    }
  }, [user?.company_id]);

  const fetchCompanySettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', user?.company_id)
        .single();

      if (error) throw error;

      console.log('📊 [SystemSettings] Fetched company data:', {
        team_leader_allowed_pricing: data.team_leader_allowed_pricing,
        mobile_sales_allowed_pricing: data.mobile_sales_allowed_pricing,
        type_team_leader: typeof data.team_leader_allowed_pricing,
        type_mobile_sales: typeof data.mobile_sales_allowed_pricing
      });

      setCompanyData(data);
      
      // Parse if string, use as-is if already array
      const teamLeaderPricing = typeof data.team_leader_allowed_pricing === 'string' 
        ? JSON.parse(data.team_leader_allowed_pricing)
        : (data.team_leader_allowed_pricing || ['rsp_price']);
        
      const mobileSalesPricing = typeof data.mobile_sales_allowed_pricing === 'string'
        ? JSON.parse(data.mobile_sales_allowed_pricing) 
        : (data.mobile_sales_allowed_pricing || ['rsp_price']);

      console.log('📊 [SystemSettings] Parsed pricing:', {
        teamLeaderPricing,
        mobileSalesPricing
      });

      setTeamLeaderPricing(teamLeaderPricing);
      setMobileSalesPricing(mobileSalesPricing);
    } catch (error) {
      console.error('Error fetching company settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load system settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTeamLeaderChange = (pricing: PricingColumn, checked: boolean) => {
    if (checked) {
      setTeamLeaderPricing(prev => [...prev, pricing]);
    } else {
      // Ensure at least one option is selected
      if (teamLeaderPricing.length > 1) {
        setTeamLeaderPricing(prev => prev.filter(p => p !== pricing));
      } else {
        toast({
          title: 'Validation Error',
          description: 'At least one pricing option must be enabled for Team Leaders',
          variant: 'destructive'
        });
      }
    }
  };

  const handleMobileSalesChange = (pricing: PricingColumn, checked: boolean) => {
    if (checked) {
      setMobileSalesPricing(prev => [...prev, pricing]);
    } else {
      // Ensure at least one option is selected
      if (mobileSalesPricing.length > 1) {
        setMobileSalesPricing(prev => prev.filter(p => p !== pricing));
      } else {
        toast({
          title: 'Validation Error',
          description: 'At least one pricing option must be enabled for Mobile Sales',
          variant: 'destructive'
        });
      }
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      console.log('💾 [SystemSettings] Saving pricing config...', {
        company_id: user?.company_id,
        team_leader_allowed_pricing: teamLeaderPricing,
        mobile_sales_allowed_pricing: mobileSalesPricing
      });

      // Use secure RPC function that ONLY updates pricing columns
      const { data, error } = await supabase
        .rpc('update_company_pricing_permissions', {
          p_team_leader_pricing: teamLeaderPricing,
          p_mobile_sales_pricing: mobileSalesPricing
        });

      if (error) {
        console.error('❌ [SystemSettings] RPC error:', error);
        throw new Error(error.message);
      }

      // Check if the function returned an error
      if (data && !data.success) {
        console.error('❌ [SystemSettings] Function error:', data.message);
        throw new Error(data.message);
      }

      console.log('✅ [SystemSettings] Save successful:', data);

      toast({
        title: 'Success',
        description: 'Pricing permissions updated successfully',
      });

      // Refresh data
      await fetchCompanySettings();
    } catch (error: any) {
      console.error('❌ [SystemSettings] Error saving settings:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save system settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure system-wide settings for {companyData?.name}
          </p>
        </div>
      </div>

      <Separator />

      {/* Pricing Permissions Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Pricing Permissions</CardTitle>
          </div>
          <CardDescription>
            Configure which pricing options are available to each role when creating orders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Information Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Unit Price (cost) is never shown to sales roles and is only visible to Admin and Finance for security purposes.
            </AlertDescription>
          </Alert>

          {/* Team Leader Permissions */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-base font-semibold">Team Leader Permissions</Label>
              <Badge variant="secondary">Manager & Team Leader</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Select which pricing strategies team leaders can use when creating orders
            </p>
            
            <div className="grid gap-4">
              {(Object.keys(PRICING_OPTIONS) as PricingColumn[]).map((pricingCol) => {
                const option = PRICING_OPTIONS[pricingCol];
                return (
                  <div key={pricingCol} className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                    <Checkbox
                      id={`team-leader-${pricingCol}`}
                      checked={teamLeaderPricing.includes(pricingCol)}
                      onCheckedChange={(checked) => handleTeamLeaderChange(pricingCol, checked as boolean)}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`team-leader-${pricingCol}`}
                          className="font-medium cursor-pointer"
                        >
                          {option.label}
                        </Label>
                        <Badge variant="outline" className="text-xs">
                          {option.badge}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Mobile Sales Permissions */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-base font-semibold">Mobile Sales Permissions</Label>
              <Badge variant="secondary">Mobile Sales & Sales Agent</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Select which pricing strategies mobile sales agents can use when creating orders
            </p>
            
            <div className="grid gap-4">
              {(Object.keys(PRICING_OPTIONS) as PricingColumn[]).map((pricingCol) => {
                const option = PRICING_OPTIONS[pricingCol];
                return (
                  <div key={pricingCol} className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                    <Checkbox
                      id={`mobile-sales-${pricingCol}`}
                      checked={mobileSalesPricing.includes(pricingCol)}
                      onCheckedChange={(checked) => handleMobileSalesChange(pricingCol, checked as boolean)}
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`mobile-sales-${pricingCol}`}
                          className="font-medium cursor-pointer"
                        >
                          {option.label}
                        </Label>
                        <Badge variant="outline" className="text-xs">
                          {option.badge}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="lg"
              className="min-w-[150px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Configuration</CardTitle>
          <CardDescription>Preview of enabled pricing options by role</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Team Leader Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Team Leaders can use:</Label>
              <div className="flex flex-wrap gap-2">
                {teamLeaderPricing.map(pricing => (
                  <Badge key={pricing} variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {PRICING_OPTIONS[pricing].label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Mobile Sales Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mobile Sales can use:</Label>
              <div className="flex flex-wrap gap-2">
                {mobileSalesPricing.map(pricing => (
                  <Badge key={pricing} variant="secondary" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {PRICING_OPTIONS[pricing].label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
