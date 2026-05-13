import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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

import { HubLocationMap } from './HubLocationMap';
import type { HubPinUpdate } from './types';

const hubFormSchema = z
  .object({
    name: z.string().min(1, 'Hub name is required'),
    addressLine: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .refine(
    (data) =>
      data.latitude != null &&
      data.longitude != null &&
      Number.isFinite(data.latitude) &&
      Number.isFinite(data.longitude),
    {
      message: 'Set a location using the map search or drag the pin after searching.',
      path: ['latitude'],
    },
  );

export type HubFormValues = z.infer<typeof hubFormSchema>;

type CreateHubDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful insert (e.g. refresh a list). */
  onCreated?: () => void;
};

function formatCoord(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 5,
    maximumFractionDigits: 7,
  });
}

export function CreateHubDialog({ open, onOpenChange, onCreated }: CreateHubDialogProps) {
  const [flyToTrigger, setFlyToTrigger] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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
    if (!open) {
      form.reset({
        name: '',
        addressLine: '',
        latitude: undefined,
        longitude: undefined,
      });
      setFlyToTrigger(0);
    }
  }, [open, form]);

  const lat = form.watch('latitude');
  const lng = form.watch('longitude');

  const handlePinChange = (update: HubPinUpdate) => {
    form.setValue('latitude', update.latitude, { shouldValidate: true, shouldDirty: true });
    form.setValue('longitude', update.longitude, { shouldValidate: true, shouldDirty: true });
    if (update.source === 'geocode' && update.resolvedLabel) {
      form.setValue('addressLine', update.resolvedLabel, { shouldDirty: true });
      setFlyToTrigger((n) => n + 1);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('hubs').insert({
        hub_name: values.name,
        hub_location: values.addressLine?.trim() ? values.addressLine.trim() : null,
        latitude: values.latitude!,
        longitude: values.longitude!,
      });

      if (error) {
        throw error;
      }

      toast.success('Hub created', {
        description: `${values.name} — ${formatCoord(values.latitude!)}°, ${formatCoord(values.longitude!)}°`,
      });
      onCreated?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not create hub';
      toast.error('Could not create hub', { description: message });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,880px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create hub</DialogTitle>
          <DialogDescription>
            Super admins only. Name your hub, search for an address in the Philippines using OpenStreetMap Nominatim, then drag the marker to capture an exact
            position. You can fine-tune coordinates in the fields below.
          </DialogDescription>
        </DialogHeader>

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
                        <Input
                          placeholder="Filled when you pick a search result — editable"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Comes from the geocoder; adjust if the line needs to match your records.
                      </FormDescription>
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
                            onChange={(e) => {
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
                            onChange={(e) => {
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
                <p className="text-xs text-muted-foreground">
                  Decimal degrees; drag the pin or edit these fields for survey-level placement.
                </p>
              </div>

              <div className="flex min-h-[320px] flex-col gap-2">
                <Label className="text-base font-semibold">Map</Label>
                <p className="text-xs text-muted-foreground">
                  Search uses OpenStreetMap: suite numbers and some building names are not always listed. Try{' '}
                  <span className="font-medium text-foreground">street + city</span>, pick a result, then drag the pin
                  to the exact spot.
                </p>
                <HubLocationMap
                  className="min-h-[320px] flex-1"
                  latitude={lat ?? null}
                  longitude={lng ?? null}
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
                {submitting ? 'Saving…' : 'Create hub'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
