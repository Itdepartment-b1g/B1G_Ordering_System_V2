import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin, Mail, Phone, Package, DollarSign, Flame } from 'lucide-react';
import { WarRoomClient } from '../hooks/useWarRoomClients';

interface ClientMapPopupProps {
  client: WarRoomClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientMapPopup({ client, open, onOpenChange }: ClientMapPopupProps) {
  if (!client) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{client.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Company and Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{client.company}</span>
            <Badge
              variant={client.account_type === 'Key Accounts' ? 'default' : 'secondary'}
              className="ml-2"
            >
              {client.account_type}
            </Badge>
            <Badge
              variant={client.has_forge ? 'default' : 'outline'}
              className={client.has_forge ? 'bg-orange-500 hover:bg-orange-600' : ''}
            >
              <Flame className="h-3 w-3 mr-1" />
              {client.has_forge ? 'Has Forge' : 'No Forge'}
            </Badge>
          </div>

          {/* Location Details */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </h3>
            <div className="text-sm space-y-1 ml-6">
              <p>{client.address}</p>
              <p>{client.city}, {client.region}</p>
            </div>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm">{client.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm">{client.phone}</p>
              </div>
            </div>
          </div>

          {/* Statistics */}
          {(client.total_orders !== undefined || client.total_spent !== undefined) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {client.total_orders !== undefined && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Package className="h-5 w-5" />
                    <div>
                      <p className="text-2xl font-bold">{client.total_orders}</p>
                      <p className="text-sm">Total Orders</p>
                    </div>
                  </div>
                </div>
              )}
              {client.total_spent !== undefined && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700">
                    <DollarSign className="h-5 w-5" />
                    <div>
                      <p className="text-2xl font-bold">{formatCurrency(client.total_spent)}</p>
                      <p className="text-sm">Total Spent</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Coordinates (for debugging) */}
          <div className="text-xs text-muted-foreground border-t pt-4">
            <p>Coordinates: {client.location_latitude.toFixed(4)}, {client.location_longitude.toFixed(4)}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

