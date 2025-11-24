import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { UserCircle, Mail, Phone, MapPin, Save, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatPhoneNumber } from '@/lib/utils';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    region: '',
    position: '',
    role: '',
  });
  const [assignedCities, setAssignedCities] = useState<string[]>([]);
  const [isAgentOrLeader, setIsAgentOrLeader] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchProfile(); 
    }
  }, [user?.id]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfile({
          full_name: data.full_name || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          city: data.city || '',
          country: data.country || '',
          region: data.region || '',
          position: data.position || '',
          role: data.role || '',
        });
        
        // Parse assigned cities from comma-separated string
        const cities = data.city 
          ? data.city.split(',').map(c => c.trim()).filter(c => c.length > 0)
          : [];
        setAssignedCities(cities);
        
        // Check if user is agent or leader (not admin)
        const isAgentOrLeaderUser = data.role !== 'admin';
        setIsAgentOrLeader(isAgentOrLeaderUser);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profile',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Prepare update data - exclude city if user is agent or leader
      const updateData: any = {
        full_name: profile.full_name,
        phone: profile.phone,
        address: profile.address,
        country: profile.country,
        region: profile.region,
      };
      
      // Only allow city update for admins
      if (!isAgentOrLeader) {
        updateData.city = profile.city;
      }
      
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user?.id);

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: 'Profile updated successfully' 
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Profile Settings</h1>
        <p className="text-sm md:text-base text-muted-foreground">Manage your account information</p>
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Account Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
                <UserCircle className="h-16 w-16 text-primary" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-base md:text-lg">{profile.full_name}</p>
              <Badge variant="secondary" className="mt-2 text-xs">
                {(() => {
                  const role = user?.role || profile.role;
                  switch (role) {
                    case 'system_administrator':
                      return 'SYSTEM ADMINISTRATOR';
                    case 'super_admin':
                      return 'SUPER ADMIN';
                    case 'admin':
                      return 'ADMIN';
                    case 'finance':
                      return 'FINANCE';
                    case 'manager':
                      return 'MANAGER';
                    case 'team_leader':
                      return 'TEAM LEADER';
                    case 'mobile_sales':
                      return 'SALES AGENT';
                    default:
                      // Fallback: check position for leader
                      if ((profile.position || '').toLowerCase().includes('leader')) {
                        return 'LEADER';
                      }
                      return 'SALES AGENT';
                  }
                })()}
              </Badge>
            </div>
            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{profile.email}</span>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {assignedCities.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Assigned Cities:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {assignedCities.map((city, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {city}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {profile.country && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.country}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setProfile({ ...profile, phone: formatted });
                  }}
                  placeholder="+63 917 555 0101"
                  maxLength={17}
                />
              </div>
              {user?.role === 'sales_agent' && (
                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    value={profile.region}
                    onChange={(e) => setProfile({ ...profile, region: e.target.value })}
                    placeholder="Metro Manila"
                  />
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="city">
                  Assigned Cities
                  {isAgentOrLeader && (
                    <span className="text-xs text-muted-foreground ml-2">(Read-only - Contact admin to change)</span>
                  )}
                </Label>
                {assignedCities.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/50">
                    {assignedCities.map((city, index) => (
                      <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                        {city}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                    No cities assigned
                  </div>
                )}
                {!isAgentOrLeader && (
                  <Input
                    id="city"
                    value={profile.city}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    placeholder="Manila, Cebu, Davao (comma-separated)"
                    className="mt-2"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={profile.country}
                  onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                  placeholder="Philippines"
                />
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input 
                    id="current-password" 
                    type={showCurrent ? 'text' : 'password'}
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrent(v => !v)}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input 
                    id="new-password" 
                    type={showNew ? 'text' : 'password'}
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNew(v => !v)}
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Input 
                    id="confirm-password" 
                    type={showConfirm ? 'text' : 'password'}
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm(v => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                className="w-full sm:w-auto"
                onClick={() => {
                  // Validate passwords
                  if (!passwords.current) {
                    toast({
                      title: 'Error',
                      description: 'Please enter your current password',
                      variant: 'destructive'
                    });
                    return;
                  }
                  if (!passwords.new) {
                    toast({
                      title: 'Error',
                      description: 'Please enter a new password',
                      variant: 'destructive'
                    });
                    return;
                  }
                  if (passwords.new.length < 6) {
                    toast({
                      title: 'Error',
                      description: 'New password must be at least 6 characters',
                      variant: 'destructive'
                    });
                    return;
                  }
                  if (passwords.new !== passwords.confirm) {
                    toast({
                      title: 'Error',
                      description: 'New passwords do not match',
                      variant: 'destructive'
                    });
                    return;
                  }
                  setPasswordConfirmOpen(true);
                }}
                disabled={updatingPassword}
              >
                {updatingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Password Update Confirmation Dialog */}
      <AlertDialog open={passwordConfirmOpen} onOpenChange={setPasswordConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Password Update</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update your password? You will need to log in again with your new password after this change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingPassword}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  setUpdatingPassword(true);
                  
                  // First, verify current password by attempting to sign in
                  const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: user?.email || '',
                    password: passwords.current
                  });

                  if (signInError) {
                    throw new Error('Current password is incorrect');
                  }

                  // Update password
                  const { error: updateError } = await supabase.auth.updateUser({
                    password: passwords.new
                  });

                  if (updateError) {
                    throw updateError;
                  }

                  // Clear password fields
                  setPasswords({ current: '', new: '', confirm: '' });
                  setPasswordConfirmOpen(false);

                  toast({
                    title: 'Success',
                    description: 'Password updated successfully. Please log in again with your new password.'
                  });

                  // Sign out after a short delay to allow the toast to show
                  setTimeout(() => {
                    supabase.auth.signOut();
                  }, 2000);
                } catch (error: any) {
                  console.error('Error updating password:', error);
                  toast({
                    title: 'Error',
                    description: error.message || 'Failed to update password',
                    variant: 'destructive'
                  });
                } finally {
                  setUpdatingPassword(false);
                }
              }}
              disabled={updatingPassword}
            >
              {updatingPassword ? 'Updating...' : 'Confirm Update'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
