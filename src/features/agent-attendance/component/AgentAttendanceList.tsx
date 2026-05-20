import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEventHandler } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  AlertTriangle,
} from 'lucide-react';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  computeTotalHours,
  formatAttendanceTotalHours,
} from '@/lib/agentAttendanceTotalHours';
import { haversineDistanceMeters } from '@/lib/haversineMeters';
import { reverseGeocodeLabel } from '@/features/agent-attendance/lib/reverseGeocode';
import type { AgentAttendance, AgentAttendanceStatus, Hub } from '@/types/database.types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgentAttendanceLocationMap } from '@/features/agent-attendance/component/AgentAttendanceLocationMap';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const HISTORY_PAGE_SIZES = [5, 10, 15, 25, 50, 100] as const;
type HistoryPageSize = (typeof HISTORY_PAGE_SIZES)[number];

type AgentAttendanceHistoryLayout = 'rows' | 'cards';

type HistoryStatusFilter = 'all' | AgentAttendanceStatus;

function manilaCalendarDateString(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** `business_date` is a Manila calendar day (YYYY-MM-DD); noon PH avoids UTC boundary display bugs. */
function formatManilaBusinessDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function attendanceBadgeVariant(status: AgentAttendanceStatus): 'destructive' | 'secondary' | 'outline' {
  if (status === 'absent') return 'destructive';
  if (status === 'non_working') return 'outline';
  return 'secondary';
}

function attendanceStatusLabel(status: AgentAttendanceStatus): string {
  if (status === 'absent') return 'Absent';
  if (status === 'non_working') return 'Non-working';
  return 'Present';
}

function AttendanceHistoryCardRow({
  row,
  manilaTodayDate,
}: {
  row: AgentAttendance;
  manilaTodayDate: string;
}) {
  const isToday = row.business_date === manilaTodayDate;
  return (
    <li className="rounded-lg border bg-card px-3 py-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{formatManilaBusinessDateLabel(row.business_date)}</span>
          {isToday ? (
            <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
              Today
            </Badge>
          ) : null}
        </div>
        <Badge variant={attendanceBadgeVariant(row.status)} className="shrink-0">
          {attendanceStatusLabel(row.status)}
        </Badge>
      </div>
      {row.status === 'present' ? (
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:text-sm">
          <div>
            <span className="text-muted-foreground">In </span>
            <span className="text-foreground">{formatManilaDateTime(row.time_in)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Out </span>
            <span className="text-foreground">{formatManilaDateTime(row.time_out)}</span>
          </div>
          {row.time_out ? (
            <div>
              <span className="text-muted-foreground">Total hours </span>
              <span className="text-foreground">{formatAttendanceTotalHours(row)}</span>
            </div>
          ) : null}
        </div>
      ) : row.status === 'non_working' ? (
        <p className="mt-2 text-xs text-muted-foreground">Recorded as a non-working day (no check-in required).</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No check-in recorded for this day.</p>
      )}
    </li>
  );
}

function AttendanceHistoryTableRow({
  row,
  manilaTodayDate,
}: {
  row: AgentAttendance;
  manilaTodayDate: string;
}) {
  const isToday = row.business_date === manilaTodayDate;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium leading-snug">{formatManilaBusinessDateLabel(row.business_date)}</span>
          {isToday ? (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Today
            </Badge>
          ) : null}
        </div>
      </td>
      <td className="max-w-[140px] px-2 py-2.5 align-top text-xs text-muted-foreground sm:max-w-none sm:text-sm">
        <span className="break-words">{row.status === 'present' ? formatManilaDateTime(row.time_in) : '—'}</span>
      </td>
      <td className="max-w-[140px] px-2 py-2.5 align-top text-xs text-muted-foreground sm:max-w-none sm:text-sm">
        <span className="break-words">{row.status === 'present' ? formatManilaDateTime(row.time_out) : '—'}</span>
      </td>
      <td className="px-2 py-2.5 align-top text-xs tabular-nums sm:text-sm">
        {row.status === 'present' && row.time_out ? formatAttendanceTotalHours(row) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <Badge variant={attendanceBadgeVariant(row.status)} className="shrink-0">
          {attendanceStatusLabel(row.status)}
        </Badge>
      </td>
    </tr>
  );
}

function readFileAsJpegBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not read image'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          blob => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error('Could not encode image'));
          },
          'image/jpeg',
          0.85
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e instanceof Error ? e : new Error('Could not process image'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image'));
    };
    img.src = url;
  });
}

export default function AgentAttendanceList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const businessDate = useMemo(() => manilaCalendarDateString(), []);

  const { data: hubs = [], isLoading: hubsLoading } = useQuery({
    queryKey: ['agent_attendance_hubs', user?.id],
    enabled: !!user?.id && user?.role === 'mobile_sales',
    queryFn: async (): Promise<Hub[]> => {
      const { data, error } = await supabase
        .from('hubs')
        .select(
          'id, hub_name, hub_location, created_by, assigned_team_leader_id, longitude, latitude, radius_meter, created_at, updated_at'
        )
        .order('hub_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Hub[];
    },
  });

  const { data: todayRow, isLoading: rowLoading } = useQuery({
    queryKey: ['agent_attendance_today', user?.id, businessDate],
    enabled: !!user?.id && user?.role === 'mobile_sales',
    queryFn: async (): Promise<AgentAttendance | null> => {
      const { data, error } = await supabase
        .from('agent_attendances')
        .select('*')
        .eq('user_id', user!.id)
        .eq('business_date', businessDate)
        .maybeSingle();
      if (error) throw error;
      return data as AgentAttendance | null;
    },
  });

  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState<HistoryPageSize>(25);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState('');

  useEffect(() => {
    setHistoryPage(0);
  }, [historyStatusFilter, historyDateFilter, historyPageSize]);

  const { data: historyPageData, isLoading: historyLoading } = useQuery({
    queryKey: [
      'agent_attendance_history',
      user?.id,
      historyPage,
      historyPageSize,
      historyStatusFilter,
      historyDateFilter,
    ],
    enabled: !!user?.id && user?.role === 'mobile_sales',
    queryFn: async (): Promise<{ rows: AgentAttendance[]; total: number }> => {
      const uid = user!.id;
      const from = historyPage * historyPageSize;
      const to = from + historyPageSize - 1;

      let countQuery = supabase
        .from('agent_attendances')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid);
      let dataQuery = supabase.from('agent_attendances').select('*').eq('user_id', uid);

      if (historyStatusFilter !== 'all') {
        countQuery = countQuery.eq('status', historyStatusFilter);
        dataQuery = dataQuery.eq('status', historyStatusFilter);
      }
      if (historyDateFilter.trim()) {
        countQuery = countQuery.eq('business_date', historyDateFilter.trim());
        dataQuery = dataQuery.eq('business_date', historyDateFilter.trim());
      }

      const [countRes, dataRes] = await Promise.all([
        countQuery,
        dataQuery.order('business_date', { ascending: false }).range(from, to),
      ]);

      if (countRes.error) throw countRes.error;
      if (dataRes.error) throw dataRes.error;

      return {
        rows: (dataRes.data ?? []) as AgentAttendance[],
        total: countRes.count ?? 0,
      };
    },
  });

  const historyRows = historyPageData?.rows ?? [];
  const historyTotal = historyPageData?.total ?? 0;
  const historyTotalPages = historyTotal === 0 ? 0 : Math.ceil(historyTotal / historyPageSize);
  const historyFiltersActive =
    historyStatusFilter !== 'all' || historyDateFilter.trim().length > 0;

  useEffect(() => {
    if (historyLoading || !historyPageData) return;
    const { total } = historyPageData;
    if (total === 0) return;
    const tp = Math.ceil(total / historyPageSize);
    if (historyPage >= tp) {
      setHistoryPage(Math.max(0, tp - 1));
    }
  }, [historyLoading, historyPageData, historyPage, historyPageSize]);

  const [historyLayout, setHistoryLayout] = useState<AgentAttendanceHistoryLayout>('cards');

  const [selectedHubId, setSelectedHubId] = useState<string>('');
  useEffect(() => {
    if (hubs.length && !selectedHubId) {
      setSelectedHubId(hubs[0].id);
    }
  }, [hubs, selectedHubId]);

  const selectedHub = useMemo(
    () => hubs.find(h => h.id === selectedHubId) ?? null,
    [hubs, selectedHubId]
  );

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [note, setNote] = useState('');
  const [distanceM, setDistanceM] = useState<number | null>(null);

  const loading = hubsLoading || rowLoading;

  const isTimeInForm = useMemo(
    () =>
      !loading &&
      hubs.length > 0 &&
      todayRow?.status !== 'absent' &&
      todayRow?.status !== 'non_working' &&
      !(todayRow?.status === 'present' && todayRow.time_in),
    [loading, hubs.length, todayRow?.status, todayRow?.time_in]
  );

  const resetFlow = useCallback(() => {
    setPhotoFile(null);
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCoords(null);
    setGeoError(null);
    setGeoLoading(false);
    setNote('');
    setDistanceM(null);
  }, []);

  const requestLocation = useCallback(() => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('This device does not support GPS location.');
      setGeoLoading(false);
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        setGeoLoading(false);
      },
      err => {
        setGeoError(err.message || 'Could not read your location.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (!isTimeInForm || !selectedHub || !photoPreview) return;
    if (coords) return;
    if (geoError) return;
    requestLocation();
    // Intentionally omit geoError from deps: clearing it on "Try again" must not re-trigger this effect
    // while the button handler is already calling requestLocation().
  }, [isTimeInForm, photoPreview, selectedHub?.id, coords, requestLocation]);

  useEffect(() => {
    if (coords && selectedHub) {
      setDistanceM(
        haversineDistanceMeters(
          coords.latitude,
          coords.longitude,
          selectedHub.latitude,
          selectedHub.longitude
        )
      );
    }
  }, [coords, selectedHub]);

  const outOfRange =
    selectedHub != null &&
    distanceM != null &&
    distanceM > selectedHub.radius_meter;

  const timeInMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedHub) throw new Error('Missing hub');
      if (!photoFile) throw new Error('Take a photo first');
      if (!coords) throw new Error('Location required');
      if (outOfRange && !note.trim()) throw new Error('Add a short note explaining why you are outside the hub area');

      let path = `${user.id}/${Date.now()}.jpg`;
      let body: Blob;
      let contentType = 'image/jpeg';

      try {
        body = await readFileAsJpegBlob(photoFile);
      } catch {
        const ext = photoFile.name.split('.').pop()?.toLowerCase();
        const safeExt = ext && /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
        path = `${user.id}/${Date.now()}.${safeExt}`;
        body = photoFile;
        contentType = photoFile.type || 'application/octet-stream';
      }

      const { error: upErr } = await supabase.storage
        .from('agent-attendance-photos')
        .upload(path, body, { contentType, upsert: false });
      if (upErr) throw upErr;

      const address = await reverseGeocodeLabel(coords.latitude, coords.longitude);
      const timeIn = new Date().toISOString();

      const { error: insErr } = await supabase.from('agent_attendances').insert({
        user_id: user.id,
        hub_id: selectedHub.id,
        photo: path,
        address: address ?? null,
        longitude: coords.longitude,
        latitude: coords.latitude,
        time_in: timeIn,
        status: 'present',
        note: note.trim() ? note.trim() : null,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success('Timed in successfully');
      resetFlow();
      queryClient.invalidateQueries({ queryKey: ['agent_attendance_today', user?.id, businessDate] });
      queryClient.invalidateQueries({ queryKey: ['agent_attendance_history', user?.id] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not record attendance';
      toast.error(msg);
    },
  });

  const timeOutMutation = useMutation({
    mutationFn: async (row: { id: string; business_date: string; time_in: string }) => {
      const timeOut = new Date().toISOString();
      const total_hours = computeTotalHours(row.business_date, row.time_in, timeOut);
      const { error } = await supabase
        .from('agent_attendances')
        .update({ time_out: timeOut, total_hours })
        .eq('id', row.id)
        .eq('user_id', user!.id)
        .is('time_out', null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Timed out');
      queryClient.invalidateQueries({ queryKey: ['agent_attendance_today', user?.id, businessDate] });
      queryClient.invalidateQueries({ queryKey: ['agent_attendance_history', user?.id] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not time out';
      toast.error(msg);
    },
  });

  const onPickPhoto: ChangeEventHandler<HTMLInputElement> = e => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image');
      return;
    }
    setPhotoFile(f);
    setPhotoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setCoords(null);
    setDistanceM(null);
    setGeoError(null);
    setGeoLoading(false);
  };

  const canSubmitTimeIn =
    !!photoFile &&
    !!coords &&
    !!selectedHub &&
    (!outOfRange || note.trim().length > 0) &&
    !timeInMutation.isPending &&
    !geoLoading;

  if (!user || user.role !== 'mobile_sales') {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
        <p className="text-sm text-muted-foreground">Attendance is only available for mobile sales accounts.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-10 pt-4 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Business days use Asia/Manila time. Check in on Today; review past days in History.
        </p>
      </div>

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">Today&rsquo;s date: {businessDate}</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : todayRow?.status === 'absent' || todayRow?.status === 'non_working' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {todayRow.status === 'absent' ? 'Marked absent' : 'Non-working day'}
            </CardTitle>
            <CardDescription>
              {todayRow.status === 'absent'
                ? 'There is no time-in on file for today. If this is a mistake, contact your team leader.'
                : 'This calendar day is recorded as non-working (for example Sunday). No check-in was expected.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : todayRow?.status === 'present' && todayRow.time_in ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {todayRow.time_out ? 'Completed' : 'Checked in'}
            </CardTitle>
            <CardDescription>
              {todayRow.time_out
                ? 'You have timed out for today.'
                : 'You are timed in. Remember to time out when you finish.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-1">
              <span className="text-muted-foreground">Time in</span>
              <span>{formatManilaDateTime(todayRow.time_in)}</span>
            </div>
            {todayRow.time_out ? (
              <>
                <div className="grid gap-1">
                  <span className="text-muted-foreground">Time out</span>
                  <span>{formatManilaDateTime(todayRow.time_out)}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-muted-foreground">Total hours</span>
                  <span className="font-medium tabular-nums">{formatAttendanceTotalHours(todayRow)}</span>
                </div>
              </>
            ) : null}
            {todayRow.note ? (
              <div className="grid gap-1">
                <span className="text-muted-foreground">Note</span>
                <span>{todayRow.note}</span>
              </div>
            ) : null}
            {!todayRow.time_out ? (
              <Button
                className="w-full"
                variant="secondary"
                disabled={timeOutMutation.isPending}
                onClick={() =>
                  timeOutMutation.mutate({
                    id: todayRow.id,
                    business_date: todayRow.business_date,
                    time_in: todayRow.time_in!,
                  })
                }
              >
                {timeOutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <LogOut className="h-4 w-4 mr-2" />
                )}
                Time Out
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : hubs.length === 0 ? (
        <Alert variant="destructive">
          <AlertTitle>No hub assigned</AlertTitle>
          <AlertDescription>
            Your team leader is not linked to a hub yet. Ask your administrator to assign a hub before you can time
            in.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Time in
            </CardTitle>
            <CardDescription>
              Take your time-in photo first. Your GPS position and hub map load right after—no extra tap needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hubs.length > 1 ? (
              <div className="space-y-2">
                <Label>Hub</Label>
                <Select value={selectedHubId} onValueChange={setSelectedHubId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select hub" />
                  </SelectTrigger>
                  <SelectContent>
                    {hubs.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.hub_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPickPhoto}
            />

            {!photoPreview ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" />
                Take time-in photo
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border overflow-hidden bg-muted aspect-video flex items-center justify-center">
                  <img src={photoPreview} alt="Preview" className="max-h-56 object-contain" />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Retake photo
                </Button>
              </div>
            )}

            {photoPreview ? (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Your position and hub</Label>
                {geoLoading && selectedHub && !coords ? (
                  <div className="flex h-[220px] w-full flex-col items-center justify-center gap-2 rounded-lg border bg-muted/40 text-sm text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin opacity-70" />
                    <span>Getting your location for the map…</span>
                  </div>
                ) : coords && selectedHub ? (
                  <>
                    {distanceM != null ? (
                      <p className="text-sm text-muted-foreground">
                        About <strong>{Math.round(distanceM)} m</strong> from <strong>{selectedHub.hub_name}</strong>
                        {outOfRange ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            {' '}
                            (outside {selectedHub.radius_meter} m radius)
                          </span>
                        ) : (
                          <span className="text-green-700 dark:text-green-400"> (within hub radius)</span>
                        )}
                      </p>
                    ) : null}
                    <AgentAttendanceLocationMap
                      agentLatitude={coords.latitude}
                      agentLongitude={coords.longitude}
                      hubLatitude={selectedHub.latitude}
                      hubLongitude={selectedHub.longitude}
                      hubRadiusMeter={selectedHub.radius_meter}
                      hubName={selectedHub.hub_name}
                    />
                  </>
                ) : geoError ? (
                  <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm text-destructive">{geoError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={geoLoading}
                      onClick={requestLocation}
                    >
                      {geoLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <MapPin className="h-4 w-4 mr-2" />
                          Try location again
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {outOfRange ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Outside hub area</AlertTitle>
                <AlertDescription>
                  You can still time in for today. Please add a short note (for example, visiting another hub for a
                  meeting).
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="att-note">Note {outOfRange ? '(required)' : '(optional)'}</Label>
              <Textarea
                id="att-note"
                placeholder={outOfRange ? 'Reason for checking in outside the hub radius…' : 'Optional context…'}
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
              />
            </div>

            <Button
              className="w-full"
              disabled={!canSubmitTimeIn}
              onClick={() => timeInMutation.mutate()}
            >
              {timeInMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <LogIn className="h-4 w-4 mr-2" />
              )}
              Submit time in
            </Button>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {historyLoading
                ? 'Loading your attendance history…'
                : historyTotal === 0
                  ? historyFiltersActive
                    ? 'No records match your filters.'
                    : 'No attendance days on file yet.'
                  : historyFiltersActive
                    ? `${historyTotal} matching record${historyTotal === 1 ? '' : 's'}. Newest dates first.`
                    : `${historyTotal} attendance day${historyTotal === 1 ? '' : 's'} on file. Newest dates first.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">View as</span>
              <ToggleGroup
                type="single"
                value={historyLayout}
                onValueChange={v => {
                  if (v === 'rows' || v === 'cards') setHistoryLayout(v);
                }}
                variant="outline"
                size="sm"
                className="justify-start"
              >
                <ToggleGroupItem value="rows" aria-label="Table rows" className="gap-1.5 px-2.5">
                  <List className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Rows
                </ToggleGroupItem>
                <ToggleGroupItem value="cards" aria-label="Cards" className="gap-1.5 px-2.5">
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Cards
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor="att-history-status" className="text-xs">
                Status
              </Label>
              <Select
                value={historyStatusFilter}
                onValueChange={v => {
                  if (v === 'all' || v === 'present' || v === 'absent' || v === 'non_working') {
                    setHistoryStatusFilter(v as HistoryStatusFilter);
                  }
                }}
              >
                <SelectTrigger id="att-history-status" className="h-9 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="non_working">Non-working</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor="att-history-date" className="text-xs">
                Business date (Manila)
              </Label>
              <Input
                id="att-history-date"
                type="date"
                className="h-9 text-sm bg-background"
                value={historyDateFilter}
                onChange={e => setHistoryDateFilter(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={!historyFiltersActive}
              onClick={() => {
                setHistoryStatusFilter('all');
                setHistoryDateFilter('');
              }}
            >
              Clear filters
            </Button>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : historyTotal === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {historyFiltersActive ? 'No matching records' : 'No records yet'}
                </CardTitle>
                <CardDescription>
                  {historyFiltersActive ? (
                    <>
                      Try different status or date filters, or{' '}
                      <button
                        type="button"
                        className="underline underline-offset-2 text-foreground"
                        onClick={() => {
                          setHistoryStatusFilter('all');
                          setHistoryDateFilter('');
                        }}
                      >
                        clear filters
                      </button>
                      .
                    </>
                  ) : (
                    <>
                      Your attendance will appear here after your first day is recorded (present, absent, or
                      non-working).
                    </>
                  )}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              {historyLayout === 'rows' ? (
            <div className="overflow-x-auto rounded-md border bg-card shadow-sm">
              <table className="w-full min-w-[20rem] caption-bottom text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-2 py-2.5 font-medium">
                      Time in
                    </th>
                    <th scope="col" className="px-2 py-2.5 font-medium">
                      Time out
                    </th>
                    <th scope="col" className="px-2 py-2.5 font-medium">
                      Total hours
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(row => (
                    <AttendanceHistoryTableRow
                      key={row.id}
                      row={row}
                      manilaTodayDate={businessDate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
              ) : (
            <ul className="space-y-2">
              {historyRows.map(row => (
                <AttendanceHistoryCardRow key={row.id} row={row} manilaTodayDate={businessDate} />
              ))}
            </ul>
              )}
              <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="att-history-page-size" className="text-xs text-muted-foreground whitespace-nowrap">
                    Rows per page
                  </Label>
                  <Select
                    value={String(historyPageSize)}
                    onValueChange={v => {
                      const n = Number(v);
                      if ((HISTORY_PAGE_SIZES as readonly number[]).includes(n)) {
                        setHistoryPageSize(n as HistoryPageSize);
                        setHistoryPage(0);
                      }
                    }}
                  >
                    <SelectTrigger id="att-history-page-size" className="h-8 w-[4.5rem] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HISTORY_PAGE_SIZES.map(s => (
                        <SelectItem key={s} value={String(s)}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    Page {historyPage + 1} of {historyTotalPages}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-0.5"
                    disabled={historyLoading || historyPage <= 0}
                    onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-0.5"
                    disabled={
                      historyLoading ||
                      historyTotalPages === 0 ||
                      historyPage >= historyTotalPages - 1
                    }
                    onClick={() => setHistoryPage(p => p + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
