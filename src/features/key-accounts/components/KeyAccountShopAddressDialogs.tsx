import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import type { KeyAccountDeliveryAddress, KeyAccountShop } from '@/types/database.types';
import { generateKeyAccountShopCode } from '@/features/key-accounts/keyAccountCodes';

const EMPTY_SHOP = {
  shop_name: '',
  city: '',
  region: '',
  province: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  notes: '',
};

const EMPTY_ADDRESS = {
  address_label: '',
  full_address: '',
  city: '',
  region: '',
  province: '',
  zip_code: '',
  contact_name: '',
  contact_phone: '',
  delivery_instructions: '',
  is_default: false,
};

type KeyAccountAddShopDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName?: string;
  createdBy?: string;
  onCreated: (shop: KeyAccountShop) => void;
};

export function KeyAccountAddShopDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  createdBy,
  onCreated,
}: KeyAccountAddShopDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_SHOP);
  const [corPdfFile, setCorPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_SHOP);
      setCorPdfFile(null);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!clientId || !form.shop_name.trim() || !user?.company_id || !user?.id) return;
    setSaving(true);
    try {
      const shopCode = await generateKeyAccountShopCode(clientId);
      const { data, error } = await supabase
        .from('key_account_shops')
        .insert({
          client_id: clientId,
          shop_code: shopCode,
          shop_name: form.shop_name.trim(),
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          province: form.province.trim() || null,
          contact_person: form.contact_person.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          contact_email: form.contact_email.trim() || null,
          operating_hours: null,
          notes: form.notes.trim() || null,
          created_by: createdBy ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      if (corPdfFile) {
        if (corPdfFile.size > 15 * 1024 * 1024) {
          throw new Error('COR PDF must be 15MB or smaller');
        }
        if (corPdfFile.type !== 'application/pdf') {
          throw new Error('COR must be a PDF file');
        }
        const timestamp = Date.now();
        const path = `${user.id}/company_${user.company_id}_client_${clientId}_shop_${data.id}_cor_${timestamp}.pdf`;
        const { error: upErr } = await supabase.storage.from('ka-shop-cor').upload(path, corPdfFile, {
          contentType: 'application/pdf',
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        const { error: corErr } = await supabase
          .from('key_account_shops')
          .update({ cor_pdf_path: path })
          .eq('id', data.id);
        if (corErr) throw corErr;
      }

      toast({
        title: 'Shop created',
        description: `${data.shop_name} (${data.shop_code}) was added to this client.`,
      });
      onCreated(data as KeyAccountShop);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not create shop',
        description: e?.message || 'Failed to save shop',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add shop</DialogTitle>
          {clientName ? (
            <p className="text-sm text-muted-foreground">Client: {clientName}</p>
          ) : null}
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <p className="text-xs text-muted-foreground sm:col-span-2">
            A shop code (e.g. SH-2026-0001) is assigned automatically when you save.
          </p>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ka-po-shop_name">Shop name *</Label>
              <Input
                id="ka-po-shop_name"
                value={form.shop_name}
                onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
                placeholder="Juan Shop"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ka-po-shop_city">City</Label>
              <Input
                id="ka-po-shop_city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ka-po-shop_province">Province</Label>
              <Input
                id="ka-po-shop_province"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ka-po-shop_region">Region</Label>
              <Input
                id="ka-po-shop_region"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ka-po-shop_contact">Contact person</Label>
              <Input
                id="ka-po-shop_contact"
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ka-po-shop_phone">Contact phone</Label>
              <Input
                id="ka-po-shop_phone"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ka-po-shop_email">Contact email</Label>
            <Input
              id="ka-po-shop_email"
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ka-po-shop-cor">COR (Certificate of Registration) — PDF</Label>
            <Input
              id="ka-po-shop-cor"
              type="file"
              accept="application/pdf,.pdf"
              className="cursor-pointer"
              onChange={(e) => setCorPdfFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">Optional. Max 15MB.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || !form.shop_name.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create shop'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type KeyAccountAddAddressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopId: string;
  shopName?: string;
  onCreated: (address: KeyAccountDeliveryAddress) => void;
};

export function KeyAccountAddAddressDialog({
  open,
  onOpenChange,
  shopId,
  shopName,
  onCreated,
}: KeyAccountAddAddressDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setForm(EMPTY_ADDRESS);
  }, [open]);

  const handleCreate = async () => {
    if (!shopId || !form.address_label.trim() || !form.full_address.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('key_account_delivery_addresses')
        .insert({
          shop_id: shopId,
          address_label: form.address_label.trim(),
          full_address: form.full_address.trim(),
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          province: form.province.trim() || null,
          zip_code: form.zip_code.trim() || null,
          contact_name: form.contact_name.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          delivery_instructions: form.delivery_instructions.trim() || null,
          receiving_hours: null,
          is_default: form.is_default,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Address created', description: `${data.address_label} was added.` });
      onCreated(data as KeyAccountDeliveryAddress);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not create address',
        description: e?.message || 'Failed to save address',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add delivery address</DialogTitle>
          {shopName ? <p className="text-sm text-muted-foreground">Shop: {shopName}</p> : null}
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ka-po-addr_label">Address label *</Label>
            <Input
              id="ka-po-addr_label"
              value={form.address_label}
              onChange={(e) => setForm({ ...form, address_label: e.target.value })}
              placeholder="Main receiving, warehouse dock…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ka-po-full_address">Full address *</Label>
            <Input
              id="ka-po-full_address"
              value={form.full_address}
              onChange={(e) => setForm({ ...form, full_address: e.target.value })}
              placeholder="Street, building, floor"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ka-po-addr_city">City</Label>
              <Input
                id="ka-po-addr_city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ka-po-addr_province">Province</Label>
              <Input
                id="ka-po-addr_province"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ka-po-zip">Zip code</Label>
              <Input
                id="ka-po-zip"
                value={form.zip_code}
                onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ka-po-addr_contact">Receiving contact</Label>
              <Input
                id="ka-po-addr_contact"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ka-po-addr_phone">Contact phone</Label>
              <Input
                id="ka-po-addr_phone"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ka-po-instructions">Delivery instructions</Label>
            <Input
              id="ka-po-instructions"
              value={form.delivery_instructions}
              onChange={(e) => setForm({ ...form, delivery_instructions: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ka-po-is_default"
              checked={form.is_default}
              onCheckedChange={(checked) => setForm({ ...form, is_default: checked === true })}
            />
            <Label htmlFor="ka-po-is_default" className="font-normal cursor-pointer">
              Set as default delivery address
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving || !form.address_label.trim() || !form.full_address.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create address'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
