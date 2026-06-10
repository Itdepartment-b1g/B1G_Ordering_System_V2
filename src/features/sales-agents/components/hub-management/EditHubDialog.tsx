import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { fetchHubDetails } from './fetchHubDetails';
import { HubLocationMap } from './HubLocationMap';
import type { HubPinUpdate } from './types';
import type { HubRow } from './types';

const hubFormSchema = z
  .object({
    name: z.string().min(1, 'Hub name is required'),
    addressLine: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .refine(
    data =>
      data.latitude != null &&
      data.longitude != null &&
      Number.isFinite(data.latitude) &&
      Number.isFinite(data.longitude),
    {
      message: 'Set a location using the map search or drag the pin after searching.',
      path: ['latitude'],
    }
  );

type HubFormValues = z.infer<typeof hubFormSchema>;

type EditHubDialogProps = {
  hub: HubRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
};

function formatCoord(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 5,
    maximumFractionDigits: 7,
  });
}

export function EditHubDialog({ hub, open, onOpenChange, onUpdated }: EditHubDialogProps) {
  const [flyToTrigger, setFlyToTrigger] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const { data: hubDetails, isLoading } = useQuery({
    queryKey: ['hub_details', hub?.id],
    queryFn: () => fetchHubDetails(hub!.id),
    enabled: open && !!hub?.id,
  });

  const form = useForm<HubFormValues>({
    resolver: zodResolver(hubFormSchema),
    defaultValues: {
      name: '',
      addressLine: '',
      latitude: undefined,
      longitude: undefined,
    },
  });

  useEffect(() => {
    if (!open || !hubDetails) return;
    form.reset({
      name: hubDetails.hub_name,
      addressLine: hubDetails.hub_location ?? '',
      latitude: hubDetails.latitude,
      longitude: hubDetails.longitude,
    });
    setFlyToTrigger(n => n + 1);
  }, [open, hubDetails, form]);

  useEffect(() => {
    if (!open) {
      setFlyToTrigger(0);
    }
  }, [open]);

  const lat = form.watch('latitude');
  const lng = form.watch('longitude');

  const handlePinChange = (update: HubPinUpdate) => {
    form.setValue('latitude', update.latitude, { shouldValidate: true, shouldDirty: true });
    form.setValue('longitude', update.longitude, { shouldValidate: true, shouldDirty: true });
    if (update.source === 'geocode' && update.resolvedLabel) {
      form.setValue('addressLine', update.resolvedLabel, { shouldDirty: true });
      setFlyToTrigger(n => n + 1);
    }
  };

  const submit = form.handleSubmit(async values => {
    if (!hub) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('hubs')
        .update({
          hub_name: values.name,
          hub_location: values.addressLine?.trim() ? values.addressLine.trim() : null,
          latitude: values.latitude!,
          longitude: values.longitude!,
        })
        .eq('id', hub.id);

      if (error) throw error;

      toast.success('Hub updated', {
        description: `${values.name} — ${formatCoord(values.latitude!)}°, ${formatCoord(values.longitude!)}°`,
      });
      onUpdated?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not update hub';
      toast.error('Could not update hub', { description: message });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,880px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit hub</DialogTitle>
          <DialogDescription>
            Update the hub name, address, or map pin. Drag the marker or search to adjust coordinates.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={submit} className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hub name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. North Warehouse Hub" autoComplete="organization" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="addressLine"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resolved address</FormLabel>
                        <FormControl>
                          <Input placeholder="Address label" {...field} />
                        </FormControl>
                        <FormDescription>Editable display address for this hub.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitude</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="—"
                              name={field.name}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              value={field.value === undefined ? '' : field.value}
                              onChange={e => {
                                const v = e.target.value;
                                if (v === '') {
                                  field.onChange(undefined);
                                  return;
                                }
                                const n = parseFloat(v);
                                field.onChange(Number.isFinite(n) ? n : undefined);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitude</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="—"
                              name={field.name}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              value={field.value === undefined ? '' : field.value}
                              onChange={e => {
                                const v = e.target.value;
                                if (v === '') {
                                  field.onChange(undefined);
                                  return;
                                }
                                const n = parseFloat(v);
                                field.onChange(Number.isFinite(n) ? n : undefined);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex min-h-[320px] flex-col gap-2">
                  <Label className="text-base font-semibold">Map</Label>
                  <HubLocationMap
                    className="min-h-[320px] flex-1"
                    latitude={lat ?? null}
                    longitude={lng ?? null}
                    radiusMeter={hubDetails?.radius_meter ?? 100}
                    onPinChange={handlePinChange}
                    active={open}
                    flyToTrigger={flyToTrigger}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
