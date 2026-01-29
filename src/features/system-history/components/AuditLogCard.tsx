import { useState } from 'react';
import { SystemAuditLog } from '@/types/database.types';
import { GroupedAuditLog } from '@/lib/auditGrouping.helpers';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, User, Calendar, Database, Edit, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface AuditLogCardProps {
  groupedLog: GroupedAuditLog;
}

export function AuditLogCard({ groupedLog }: AuditLogCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const log = groupedLog.logs[0]; // Primary log for display
  const isGrouped = groupedLog.logs.length > 1;

  const operationConfig = {
    INSERT: {
      color: 'bg-green-100 text-green-800 border-green-200',
      icon: Plus,
      label: 'Created'
    },
    UPDATE: {
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: Edit,
      label: 'Updated'
    },
    DELETE: {
      color: 'bg-red-100 text-red-800 border-red-200',
      icon: Trash2,
      label: 'Deleted'
    }
  };

  // Determine the primary operation for the badge
  const getPrimaryOperation = (): 'INSERT' | 'UPDATE' | 'DELETE' => {
    // For grouped logs, determine based on action type or key tables
    if (isGrouped) {
      // Order operations
      if (groupedLog.action_type === 'order_with_items') {
        const orderLog = groupedLog.logs.find(l => l.table_name === 'client_orders');
        if (orderLog?.operation === 'INSERT') return 'INSERT';
        if (orderLog?.operation === 'UPDATE') return 'UPDATE';
        if (orderLog?.operation === 'DELETE') return 'DELETE';
      }
      
      // Purchase order operations
      if (groupedLog.action_type === 'purchase_order_with_items') {
        const poLog = groupedLog.logs.find(l => l.table_name === 'purchase_orders');
        if (poLog) return poLog.operation;
      }
      
      // Stock allocation/return are updates
      if (groupedLog.action_type.includes('stock_allocation') || 
          groupedLog.action_type.includes('inventory_return') ||
          groupedLog.action_type === 'remittance') {
        return 'UPDATE';
      }
      
      // Cash deposit is a creation
      if (groupedLog.action_type === 'cash_deposit') {
        const depositLog = groupedLog.logs.find(l => l.table_name === 'cash_deposits');
        if (depositLog?.operation === 'INSERT') return 'INSERT';
      }
      
      // Team assignment is typically a creation
      if (groupedLog.action_type === 'team_assignment') {
        const teamLog = groupedLog.logs.find(l => l.table_name === 'leader_teams');
        if (teamLog?.operation === 'INSERT') return 'INSERT';
      }
      
      // Check if there's a primary table operation
      const primaryTables = ['client_orders', 'clients', 'profiles', 'purchase_orders', 'cash_deposits', 'tasks'];
      for (const table of primaryTables) {
        const primaryLog = groupedLog.logs.find(l => l.table_name === table);
        if (primaryLog) return primaryLog.operation;
      }
    }
    
    // For single inventory_transactions, they are typically created
    if (log.table_name === 'inventory_transactions' && log.operation === 'INSERT') {
      return 'INSERT';
    }
    
    return log.operation;
  };

  const primaryOperation = getPrimaryOperation();
  const config = operationConfig[primaryOperation];
  const OperationIcon = config.icon;

  // Map database table names to business-friendly names
  const getBusinessName = (tableName: string): string => {
    const businessNames: Record<string, string> = {
      'clients': 'Client',
      'client_orders': 'Order',
      'profiles': 'User Profile',
      'main_inventory': 'Main Inventory',
      'agent_inventory': 'Agent Inventory',
      'purchase_orders': 'Purchase Order',
      'cash_deposits': 'Cash Deposit',
      'stock_requests': 'Stock Request',
      'remittances_log': 'Remittance',
      'financial_transactions': 'Financial Transaction',
      'brands': 'Brand',
      'variants': 'Product Variant',
      'suppliers': 'Supplier',
      'leader_teams': 'Team Assignment',
      'companies': 'Company',
      'inventory_transactions': 'Inventory Transaction',
      'client_order_items': 'Order Item',
      'purchase_order_items': 'Purchase Order Item',
      'tasks': 'Task',
      'notifications': 'Notification',
      'visit_logs': 'Client Visit'
    };
    
    return businessNames[tableName] || tableName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Get role badge color
  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-indigo-100 text-indigo-800';
      case 'finance':
        return 'bg-yellow-100 text-yellow-800';
      case 'manager':
        return 'bg-orange-100 text-orange-800';
      case 'team_leader':
        return 'bg-cyan-100 text-cyan-800';
      case 'mobile_sales':
      case 'sales_agent':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Generate human-readable description
  const generateDescription = (): string => {
    const userName = log.user_name || log.user_email?.split('@')[0] || 'Someone';
    const userRole = log.user_role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'User';
    const itemType = getBusinessName(log.table_name);
    
    // Get relevant data for context
    const oldData = log.old_data as any;
    const newData = log.new_data as any;
    
    switch (log.operation) {
      case 'INSERT':
        // Created something
        if (log.table_name === 'clients') {
          const clientName = newData?.name || 'a client';
          return `${userRole} ${userName} created a new client: ${clientName}`;
        } else if (log.table_name === 'client_orders') {
          const orderNum = newData?.order_number || log.record_id.slice(0, 8);
          const clientName = newData?.client?.name || 'a client';
          return `${userRole} ${userName} created Order #${orderNum} for ${clientName}`;
        } else if (log.table_name === 'profiles') {
          const profileName = newData?.full_name || newData?.email || 'a user';
          const profileRole = newData?.role?.replace('_', ' ') || 'user';
          return `${userRole} ${userName} created a new ${profileRole} profile: ${profileName}`;
        } else if (log.table_name === 'cash_deposits') {
          const amount = newData?.amount ? `₱${newData.amount.toLocaleString()}` : 'a deposit';
          return `${userRole} ${userName} recorded a cash deposit of ${amount}`;
        } else if (log.table_name === 'purchase_orders') {
          const poNumber = newData?.po_number || log.record_id.slice(0, 8);
          return `${userRole} ${userName} created Purchase Order #${poNumber}`;
        } else if (log.table_name === 'stock_requests') {
          return `${userRole} ${userName} submitted a stock request`;
        } else if (log.table_name === 'remittances_log') {
          return `${userRole} ${userName} submitted a remittance`;
        }
        return `${userRole} ${userName} created a new ${itemType}`;
      
      case 'UPDATE':
        // Updated something
        if (log.table_name === 'profiles') {
          const profileName = newData?.full_name || oldData?.full_name || newData?.email || 'a user';
          
          // Check specific field changes
          if (log.changed_fields?.includes('status')) {
            const oldStatus = oldData?.status;
            const newStatus = newData?.status;
            return `${userRole} ${userName} updated ${profileName}'s status from ${oldStatus} to ${newStatus}`;
          } else if (log.changed_fields?.includes('role')) {
            const oldRole = oldData?.role?.replace('_', ' ');
            const newRole = newData?.role?.replace('_', ' ');
            return `${userRole} ${userName} changed ${profileName}'s role from ${oldRole} to ${newRole}`;
          }
          return `${userRole} ${userName} updated ${profileName}'s profile`;
        } else if (log.table_name === 'clients') {
          const clientName = newData?.name || oldData?.name || 'a client';
          if (log.changed_fields?.includes('status')) {
            const newStatus = newData?.status;
            return `${userRole} ${userName} updated ${clientName}'s status to ${newStatus}`;
          } else if (log.changed_fields?.includes('approval_status')) {
            const newApproval = newData?.approval_status;
            return `${userRole} ${userName} ${newApproval} client ${clientName}`;
          }
          return `${userRole} ${userName} updated client ${clientName}`;
        } else if (log.table_name === 'client_orders') {
          const orderNum = newData?.order_number || oldData?.order_number || log.record_id.slice(0, 8);
          if (log.changed_fields?.includes('status')) {
            const newStatus = newData?.status;
            return `${userRole} ${userName} ${newStatus} Order #${orderNum}`;
          }
          return `${userRole} ${userName} updated Order #${orderNum}`;
        } else if (log.table_name === 'purchase_orders') {
          const poNumber = newData?.po_number || oldData?.po_number || log.record_id.slice(0, 8);
          if (log.changed_fields?.includes('status')) {
            const newStatus = newData?.status;
            return `${userRole} ${userName} ${newStatus} Purchase Order #${poNumber}`;
          }
          return `${userRole} ${userName} updated Purchase Order #${poNumber}`;
        } else if (log.table_name === 'stock_requests') {
          if (log.changed_fields?.includes('status')) {
            const newStatus = newData?.status?.replace('_', ' ');
            return `${userRole} ${userName} ${newStatus} a stock request`;
          }
          return `${userRole} ${userName} updated a stock request`;
        }
        return `${userRole} ${userName} updated ${itemType}`;
      
      case 'DELETE':
        // Deleted something
        if (log.table_name === 'clients') {
          const clientName = oldData?.name || 'a client';
          return `${userRole} ${userName} deleted client ${clientName}`;
        } else if (log.table_name === 'profiles') {
          const profileName = oldData?.full_name || oldData?.email || 'a user';
          return `${userRole} ${userName} deleted user profile ${profileName}`;
        } else if (log.table_name === 'client_orders') {
          const orderNum = oldData?.order_number || log.record_id.slice(0, 8);
          return `${userRole} ${userName} deleted Order #${orderNum}`;
        }
        return `${userRole} ${userName} deleted ${itemType}`;
      
      default:
        return `${userRole} ${userName} performed an action on ${itemType}`;
    }
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Operation Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${config.color} flex items-center justify-center`}>
          <OperationIcon className="h-5 w-5" />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header - Human Readable Description */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              {/* Main Activity Description */}
              <p className="text-base font-medium text-foreground mb-2 leading-relaxed">
                {groupedLog.action_description}
              </p>

              {/* Metadata */}
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(groupedLog.created_at), 'PPp')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge className={`${config.color} text-xs py-0`} variant="outline">
                    {config.label}
                  </Badge>
                </div>
                {isGrouped && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="secondary" className="text-xs">
                      {groupedLog.metadata.total_operations} operations
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">•</span>
                  <span>{groupedLog.metadata.tables_affected.join(', ')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Technical Details */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground mt-2">
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" />
                    Hide Technical Details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    Show Technical Details
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                {/* Group Summary */}
                {isGrouped && (
                  <div className="mb-3 pb-3 border-b">
                    <span className="text-xs font-medium text-muted-foreground">Activity Summary:</span>
                    <p className="text-sm mt-1">{groupedLog.metadata.summary}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This activity affected {groupedLog.metadata.total_operations} database records across {groupedLog.metadata.tables_affected.length} table(s)
                    </p>
                  </div>
                )}

                {/* Technical Info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-muted-foreground">User:</span>
                    <p className="mt-0.5">{groupedLog.user_name || groupedLog.user_email || 'System'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Email:</span>
                    <p className="mt-0.5">{groupedLog.user_email || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Role:</span>
                    <p className="mt-0.5">{groupedLog.user_role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                  </div>
                </div>

                {/* Individual Operations */}
                {isGrouped && (
                  <div className="mt-4">
                    <span className="text-xs font-semibold text-muted-foreground mb-2 block">
                      {groupedLog.logs.length} Database Operations:
                    </span>
                    <div className="space-y-2">
                      {groupedLog.logs.map((individualLog, idx) => (
                        <div key={individualLog.id} className="pl-3 border-l-2 border-muted">
                          <div className="text-xs">
                            <span className="font-medium">{individualLog.operation}</span>
                            {' on '}
                            <span className="font-mono">{individualLog.table_name}</span>
                            {individualLog.changed_fields && individualLog.changed_fields.length > 0 && (
                              <span className="text-muted-foreground">
                                {' - '}Changed: {individualLog.changed_fields.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Comparison (for single operations or primary log) */}
                {!isGrouped && (log.old_data || log.new_data) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Before Changes */}
                    {log.old_data && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">Before Changes</span>
                        </div>
                        <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-64 font-mono">
                          {JSON.stringify(log.old_data, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* After Changes */}
                    {log.new_data && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">
                            {log.operation === 'UPDATE' ? 'After Changes' : 'Data Added'}
                          </span>
                        </div>
                        <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-64 font-mono">
                          {JSON.stringify(log.new_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </Card>
  );
}
