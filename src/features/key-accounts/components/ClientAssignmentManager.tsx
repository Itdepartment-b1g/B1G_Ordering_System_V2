import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Building2, UserCheck, Link2, Loader2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { KeyAccountClient } from '@/types/database.types';

interface KAM {
  id: string;
  full_name: string;
  email: string;
  director_id?: string;
}

interface DirectorWithKAMs {
  id: string;
  full_name: string;
  email: string;
  kams: KAM[];
}

interface ClientWithKAM extends KeyAccountClient {
  kam_id?: string;
  kam_name?: string;
  assignment_id?: string;
}

const CLIENTS_PER_PAGE = 10;

export function ClientAssignmentManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSalesDirector = user?.role === 'sales_director';
  const isSalesLead = user?.role === 'sales_admin' || user?.role === 'sales_head';
  const [directors, setDirectors] = useState<DirectorWithKAMs[]>([]);
  const [myKAMs, setMyKAMs] = useState<KAM[]>([]);
  const [clients, setClients] = useState<ClientWithKAM[]>([]);
  const [unassignedClients, setUnassignedClients] = useState<ClientWithKAM[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientPage, setClientPage] = useState(1);
  
  // Assignment form state
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedDirector, setSelectedDirector] = useState('');
  const [selectedKAM, setSelectedKAM] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (user?.company_id) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id, user?.id, user?.role]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all users with Key Account roles
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', user?.company_id)
        .in('role', ['sales_director', 'key_account_manager']);

      if (usersError) throw usersError;

      // Fetch KAM-Director assignments
      const { data: assignments, error: assignError } = await supabase
        .from('kam_director_assignments')
        .select('kam_id, director_id')
        .eq('company_id', user?.company_id);

      if (assignError) throw assignError;

      // Build director-KAM hierarchy
      const directorsList: DirectorWithKAMs[] = [];
      const kamsList: KAM[] = [];

      users?.forEach(u => {
        if (u.role === 'sales_director') {
          directorsList.push({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            kams: []
          });
        } else {
          const directorAssignment = assignments?.find(a => a.kam_id === u.id);
          kamsList.push({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            director_id: directorAssignment?.director_id
          });
        }
      });

      // Assign KAMs to directors
      kamsList.forEach(kam => {
        if (kam.director_id) {
          const director = directorsList.find(d => d.id === kam.director_id);
          if (director) {
            director.kams.push(kam);
          }
        }
      });

      if (isSalesDirector && user?.id) {
        const directorRow = directorsList.find((d) => d.id === user.id);
        setDirectors(directorRow ? [directorRow] : []);
        setMyKAMs(directorRow?.kams ?? kamsList.filter((k) => k.director_id === user.id));
      } else {
        setDirectors(directorsList);
        setMyKAMs([]);
      }

      // Fetch clients with their KAM assignments
      const { data: clientsData, error: clientsError } = await supabase
        .from('key_account_clients')
        .select('*')
        .eq('company_id', user?.company_id)
        .eq('status', 'active')
        .order('client_name');

      if (clientsError) throw clientsError;

      // Fetch KAM-Client assignments with KAM names
      const { data: clientAssignments, error: clientAssignError } = await supabase
        .from('kam_client_assignments')
        .select(`
          id, 
          kam_id, 
          client_id,
          kam:profiles!kam_client_assignments_kam_id_fkey(full_name)
        `)
        .eq('company_id', user?.company_id);

      if (clientAssignError) throw clientAssignError;

      // Map clients with their KAMs
      const clientsWithKAM: ClientWithKAM[] = clientsData?.map(client => {
        const assignment = clientAssignments?.find(a => a.client_id === client.id);
        const kamData = assignment?.kam as any;
        return {
          ...client,
          kam_id: assignment?.kam_id,
          kam_name: kamData?.full_name,
          assignment_id: assignment?.id
        };
      }) || [];

      setClients(clientsWithKAM);
      setUnassignedClients(clientsWithKAM.filter(c => !c.kam_id));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignClient = async () => {
    if (!selectedClient || !selectedKAM) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select both a client and KAM' });
      return;
    }

    if (isSalesDirector && !myKAMs.some((k) => k.id === selectedKAM)) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You can only assign clients to KAMs on your team',
      });
      return;
    }

    setIsAssigning(true);
    try {
      const { error } = await supabase
        .from('kam_client_assignments')
        .insert({
          client_id: selectedClient,
          kam_id: selectedKAM,
          company_id: user?.company_id,
          assigned_by: user?.id,
          assigned_at: new Date().toISOString()
        });

      if (error) {
        if (error.code === '23505') {
          toast({ variant: 'destructive', title: 'Error', description: 'This client is already assigned to a KAM' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Success', description: 'Client assigned to KAM successfully' });
        setSelectedClient('');
        setSelectedDirector('');
        setSelectedKAM('');
        fetchData();
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignClient = async (assignmentId: string, kamId?: string) => {
    if (isSalesDirector && kamId && !myKAMs.some((k) => k.id === kamId)) {
      toast({
        variant: 'destructive',
        title: 'Not allowed',
        description: 'You can only unassign clients from KAMs on your team',
      });
      return;
    }
    try {
      const { error } = await supabase
        .from('kam_client_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Client unassigned successfully' });
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const availableKAMs = isSalesDirector
    ? myKAMs
    : selectedDirector
      ? directors.find((d) => d.id === selectedDirector)?.kams || []
      : directors.flatMap((d) => d.kams);

  const canUnassignClient = (client: ClientWithKAM) =>
    isSalesLead || (!!client.kam_id && myKAMs.some((k) => k.id === client.kam_id));

  const scopedClients = isSalesDirector
    ? clients.filter((c) => !c.kam_id || myKAMs.some((k) => k.id === c.kam_id))
    : clients;

  const filteredClients = useMemo(
    () =>
      scopedClients.filter(
        (client) =>
          client.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          client.client_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (client.kam_name || '').toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [scopedClients, searchTerm]
  );

  useEffect(() => {
    setClientPage(1);
  }, [searchTerm]);

  const clientTotalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENTS_PER_PAGE));
  const clientCurrentPage = Math.min(Math.max(1, clientPage), clientTotalPages);
  const paginatedClients = filteredClients.slice(
    (clientCurrentPage - 1) * CLIENTS_PER_PAGE,
    clientCurrentPage * CLIENTS_PER_PAGE
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}


      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scopedClients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {scopedClients.filter((c) => c.kam_id).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unassigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {unassignedClients.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {scopedClients.length > 0
                ? Math.round((scopedClients.filter((c) => c.kam_id).length / scopedClients.length) * 100)
                : 0}
              %
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="h-5 w-5" />
            Assign Client to KAM
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSalesDirector && myKAMs.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">
              No Key Account Managers are assigned to you yet. Ask Sales Admin to link KAMs to your director profile in Team Management.
            </p>
          ) : null}
          <div className={`grid gap-4 ${isSalesDirector ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            <div className="space-y-2">
              <Label>Select Client *</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose unassigned client" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.client_name} ({client.client_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isSalesDirector ? (
              <div className="space-y-2">
                <Label>Filter by Director (Optional)</Label>
                <Select
                  value={selectedDirector}
                  onValueChange={(value) => {
                    setSelectedDirector(value);
                    setSelectedKAM('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Directors" />
                  </SelectTrigger>
                  <SelectContent>
                    {directors.map((director) => (
                      <SelectItem key={director.id} value={director.id}>
                        {director.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Select KAM *</Label>
              <Select value={selectedKAM} onValueChange={setSelectedKAM} disabled={availableKAMs.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      availableKAMs.length === 0
                        ? isSalesDirector
                          ? 'No KAMs on your team'
                          : 'No KAMs available'
                        : 'Choose KAM'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableKAMs.map((kam) => (
                    <SelectItem key={kam.id} value={kam.id}>
                      {kam.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button 
            onClick={handleAssignClient} 
            disabled={!selectedClient || !selectedKAM || isAssigning}
            className="mt-4"
          >
            {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
            Assign Client to KAM
          </Button>
        </CardContent>
      </Card>

      {/* Client List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Client Assignments
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {paginatedClients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No clients match your search.</p>
            ) : null}
            {paginatedClients.map((client) => (
              <div 
                key={client.id} 
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  client.kam_id ? 'bg-muted/50' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{client.client_name}</p>
                    <p className="text-sm text-muted-foreground">{client.client_code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {client.kam_id ? (
                    <>
                      <div className="text-right">
                        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                          Assigned to: {client.kam_name}
                        </Badge>
                      </div>
                      {canUnassignClient(client) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnassignClient(client.assignment_id!, client.kam_id)}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Unassigned
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredClients.length > CLIENTS_PER_PAGE && (
            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <p className="text-xs text-muted-foreground">
                Showing{' '}
                <span className="font-medium">
                  {(clientCurrentPage - 1) * CLIENTS_PER_PAGE + 1}-
                  {Math.min(clientCurrentPage * CLIENTS_PER_PAGE, filteredClients.length)}
                </span>{' '}
                of <span className="font-medium">{filteredClients.length}</span> clients
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClientPage((p) => Math.max(1, p - 1))}
                  disabled={clientCurrentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {clientCurrentPage} of {clientTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClientPage((p) => Math.min(clientTotalPages, p + 1))}
                  disabled={clientCurrentPage === clientTotalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignment summary */}
      {isSalesDirector ? (
        myKAMs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your team — clients by KAM</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {myKAMs.map((kam) => {
                  const kamClients = scopedClients.filter((c) => c.kam_id === kam.id);
                  return (
                    <AccordionItem
                      key={kam.id}
                      value={kam.id}
                      className="border rounded-lg px-4 mb-2 last:mb-0"
                    >
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex flex-1 items-center justify-between pr-2 text-sm">
                          <span className="font-medium">{kam.full_name}</span>
                          <Badge variant="outline">{kamClients.length} clients</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {kamClients.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No clients assigned.</p>
                        ) : (
                          <ul className="space-y-1">
                            {kamClients.map((c) => (
                              <li
                                key={c.id}
                                className="flex items-center gap-2 text-sm py-2 px-2 rounded-md bg-muted/40"
                              >
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="font-medium">{c.client_name}</span>
                                <span className="text-muted-foreground">({c.client_code})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )
      ) : (
        directors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assignment Summary by Director</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full space-y-2">
                {directors.map((director) => {
                  const directorKAMIds = director.kams.map((k) => k.id);
                  const assignedClients = clients.filter(
                    (c) => c.kam_id && directorKAMIds.includes(c.kam_id)
                  );

                  return (
                    <AccordionItem
                      key={director.id}
                      value={director.id}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex flex-1 items-center justify-between pr-2">
                          <span className="font-semibold text-left">{director.full_name}</span>
                          <Badge variant="secondary">{assignedClients.length} clients</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {director.kams.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No KAMs under this director.</p>
                        ) : (
                          <Accordion type="multiple" className="w-full">
                            {director.kams.map((kam) => {
                              const kamClients = clients.filter((c) => c.kam_id === kam.id);
                              return (
                                <AccordionItem
                                  key={kam.id}
                                  value={`${director.id}-${kam.id}`}
                                  className="border-b last:border-0"
                                >
                                  <AccordionTrigger className="py-3 hover:no-underline">
                                    <div className="flex flex-1 items-center justify-between pr-2 text-sm">
                                      <span className="font-medium">{kam.full_name}</span>
                                      <Badge variant="outline">{kamClients.length} clients</Badge>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent>
                                    {kamClients.length === 0 ? (
                                      <p className="text-xs text-muted-foreground">No clients assigned.</p>
                                    ) : (
                                      <ul className="space-y-1">
                                        {kamClients.map((c) => (
                                          <li
                                            key={c.id}
                                            className="flex items-center gap-2 text-sm py-2 px-2 rounded-md bg-muted/40"
                                          >
                                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="font-medium">{c.client_name}</span>
                                            <span className="text-muted-foreground">({c.client_code})</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
