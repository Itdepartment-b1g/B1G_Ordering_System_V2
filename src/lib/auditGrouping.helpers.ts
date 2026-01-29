import { SystemAuditLog } from '@/types/database.types';

/**
 * Groups related audit log entries into single business activities
 * Example: Stock allocation touches agent_inventory, main_inventory, and inventory_transactions
 * Result: ONE grouped entry instead of 3 separate cards
 */

export interface GroupedAuditLog {
  id: string; // ID of the primary log entry
  groupKey: string; // Unique key for this group
  action_description: string; // Human-readable description
  user_name?: string;
  user_email?: string;
  user_role?: string;
  created_at: string;
  action_type: string; // 'stock_allocation', 'inventory_return', 'order_approval', etc.
  logs: SystemAuditLog[]; // All related log entries
  metadata: {
    tables_affected: string[];
    total_operations: number;
    summary?: string;
  };
}

/**
 * Group audit logs that belong to the same business action
 * Criteria:
 * - Same user
 * - Same timestamp (within 2 seconds)
 * - Related tables (e.g., agent_inventory + main_inventory + inventory_transactions)
 */
export function groupAuditLogs(logs: SystemAuditLog[]): GroupedAuditLog[] {
  const grouped: GroupedAuditLog[] = [];
  const processed = new Set<string>();

  // Sort by timestamp descending (newest first)
  const sortedLogs = [...logs].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  for (const log of sortedLogs) {
    if (processed.has(log.id)) continue;

    // Find related logs (same user, within 5 seconds, related tables)
    const relatedLogs = sortedLogs.filter(l => {
      if (processed.has(l.id)) return false;
      if (l.user_id !== log.user_id) return false;
      
      const timeDiff = Math.abs(
        new Date(l.created_at).getTime() - new Date(log.created_at).getTime()
      );
      
      return timeDiff <= 5000; // Within 5 seconds (increased from 2)
    });

    // Check if this is a groupable action
    const groupType = identifyGroupType(relatedLogs);
    
    if (groupType) {
      // This is a multi-table business action - group it
      const groupedLog = createGroupedLog(relatedLogs, groupType);
      grouped.push(groupedLog);
      relatedLogs.forEach(l => processed.add(l.id));
    } else {
      // Single operation - create individual entry
      const groupedLog = createSingleLog(log);
      grouped.push(groupedLog);
      processed.add(log.id);
    }
  }

  return grouped;
}

/**
 * Identify the type of business action based on tables touched
 */
function identifyGroupType(logs: SystemAuditLog[]): string | null {
  const tables = new Set(logs.map(l => l.table_name));
  
  // Multiple inventory_transactions (batch allocation/return)
  const invTransLogs = logs.filter(l => l.table_name === 'inventory_transactions');
  if (invTransLogs.length > 1) {
    const firstTransData = invTransLogs[0].new_data as any;
    const transType = firstTransData?.transaction_type;
    
    if (transType === 'allocated_to_agent' || transType === 'allocated_to_leader') {
      return 'stock_allocation_batch';
    } else if (transType === 'return' || transType === 'returned_to_leader') {
      return 'inventory_return_batch';
    }
  }
  
  // Check single inventory_transactions for transaction type
  const invTransLog = logs.find(l => l.table_name === 'inventory_transactions');
  if (invTransLog) {
    const transData = invTransLog.new_data as any;
    const transType = transData?.transaction_type;
    
    if (transType === 'allocated_to_agent' || transType === 'allocated_to_leader') {
      return 'stock_allocation';
    } else if (transType === 'return' || transType === 'returned_to_leader') {
      return 'inventory_return';
    } else if (transType === 'order_fulfilled') {
      return 'order_fulfilled';
    }
  }
  
  // Stock allocation/return: agent_inventory + main_inventory + inventory_transactions
  if (tables.has('agent_inventory') && tables.has('main_inventory') && tables.has('inventory_transactions')) {
    // Check if it's allocation or return based on operation
    const agentInvLog = logs.find(l => l.table_name === 'agent_inventory');
    if (agentInvLog?.new_data && agentInvLog?.old_data) {
      const oldStock = (agentInvLog.old_data as any).stock || 0;
      const newStock = (agentInvLog.new_data as any).stock || 0;
      return newStock > oldStock ? 'stock_allocation' : 'inventory_return';
    }
  }
  
  // Single inventory_transactions log
  if (tables.size === 1 && tables.has('inventory_transactions')) {
    return 'inventory_transaction_single';
  }

  // Remittance: multiple inventory updates + remittances_log
  if (tables.has('remittances_log') && (tables.has('agent_inventory') || tables.has('main_inventory'))) {
    return 'remittance';
  }

  // Order with items: client_orders + client_order_items (and possibly agent_inventory)
  if (tables.has('client_orders')) {
    // Orders can have order items and inventory updates
    return 'order_with_items';
  }

  // Purchase order with items: purchase_orders + purchase_order_items
  if (tables.has('purchase_orders') && tables.has('purchase_order_items')) {
    return 'purchase_order_with_items';
  }

  // Cash deposit with proof: cash_deposits (might have multiple related operations)
  if (tables.has('cash_deposits')) {
    return 'cash_deposit';
  }

  // Stock request with items: stock_requests + multiple inventory operations
  if (tables.has('stock_requests') && logs.length > 2) {
    return 'stock_request';
  }

  // Team assignment: leader_teams + profile updates
  if (tables.has('leader_teams') && tables.has('profiles')) {
    return 'team_assignment';
  }

  return null; // Not a groupable action
}

/**
 * Create a grouped log entry from multiple related logs
 */
function createGroupedLog(logs: SystemAuditLog[], groupType: string): GroupedAuditLog {
  const primaryLog = logs[0]; // Use first log as primary
  const tables = [...new Set(logs.map(l => l.table_name))];
  
  return {
    id: primaryLog.id,
    groupKey: `${groupType}_${primaryLog.user_id}_${primaryLog.created_at}`,
    action_description: generateGroupDescription(logs, groupType),
    user_name: primaryLog.user_name,
    user_email: primaryLog.user_email,
    user_role: primaryLog.user_role,
    created_at: primaryLog.created_at,
    action_type: groupType,
    logs: logs,
    metadata: {
      tables_affected: tables,
      total_operations: logs.length,
      summary: generateGroupSummary(logs, groupType)
    }
  };
}

/**
 * Create a single log entry (not grouped)
 */
function createSingleLog(log: SystemAuditLog): GroupedAuditLog {
  return {
    id: log.id,
    groupKey: log.id,
    action_description: generateSingleDescription(log),
    user_name: log.user_name,
    user_email: log.user_email,
    user_role: log.user_role,
    created_at: log.created_at,
    action_type: 'single_operation',
    logs: [log],
    metadata: {
      tables_affected: [log.table_name],
      total_operations: 1
    }
  };
}

/**
 * Generate human-readable description for grouped actions
 */
function generateGroupDescription(logs: SystemAuditLog[], groupType: string): string {
  const userName = logs[0].user_name || logs[0].user_email?.split('@')[0] || 'Someone';
  const userRole = logs[0].user_role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'User';

  switch (groupType) {
    case 'stock_allocation_batch':
    case 'inventory_return_batch': {
      const invLogs = logs.filter(l => l.table_name === 'inventory_transactions');
      const items = extractInventoryItemsDetailed(logs);
      const firstTransData = invLogs[0].new_data as any;
      
      // Get the actual agent name from enriched data
      let targetName = firstTransData?.target_agent_name || 'Mobile Sales';
      
      // Also check agent_inventory logs
      const agentInvLog = logs.find(l => l.table_name === 'agent_inventory');
      if (agentInvLog) {
        const agentData = agentInvLog.new_data as any;
        if (agentData?.agent_name) {
          targetName = agentData.agent_name;
        }
      }
      
      if (groupType === 'stock_allocation_batch') {
        return `${userRole} ${userName} allocated ${items.totalStock} stock to ${targetName} (${items.details})`;
      } else {
        const reason = firstTransData?.reason || '';
        const reasonText = reason ? `. Reason: ${reason}` : '';
        return `${userRole} ${userName} returned ${items.totalStock} stock (${items.details})${reasonText}`;
      }
    }

    case 'inventory_transaction_single': {
      const invLog = logs.find(l => l.table_name === 'inventory_transactions');
      const transData = invLog?.new_data as any;
      const transType = transData?.transaction_type;
      const quantity = Math.abs(transData?.quantity || 0);
      const variantName = transData?.variant_name || 'stock';
      
      // Get agent name from enriched data
      let targetName = transData?.target_agent_name || 'Mobile Sales';
      
      // Also check agent_inventory if available
      const agentInvLog = logs.find(l => l.table_name === 'agent_inventory');
      if (agentInvLog) {
        const agentData = agentInvLog.new_data as any;
        if (agentData?.agent_name) {
          targetName = agentData.agent_name;
        }
      }
      
      if (transType === 'allocated_to_agent') {
        return `${userRole} ${userName} allocated ${quantity} ${variantName} to ${targetName}`;
      } else if (transType === 'allocated_to_leader') {
        return `${userRole} ${userName} allocated ${quantity} ${variantName} to team leader`;
      } else if (transType === 'return' || transType === 'returned_to_leader') {
        return `${userRole} ${userName} returned ${quantity} ${variantName}`;
      } else if (transType === 'order_fulfilled') {
        return `${userRole} ${userName} fulfilled order (${quantity} ${variantName})`;
      }
      
      return `${userRole} ${userName} performed inventory transaction (${quantity} ${variantName})`;
    }

    case 'stock_allocation': {
      const invLog = logs.find(l => l.table_name === 'inventory_transactions');
      const agentInvLog = logs.find(l => l.table_name === 'agent_inventory');
      const items = extractInventoryItemsDetailed(logs);
      
      // Get actual agent name
      let targetName = 'Mobile Sales';
      if (agentInvLog) {
        const agentData = agentInvLog.new_data as any;
        targetName = agentData?.agent_name || agentData?.user_name || 'Mobile Sales';
      }
      
      return `${userRole} ${userName} allocated ${items.totalStock} stock to ${targetName} (${items.details})`;
    }

    case 'inventory_return': {
      const items = extractInventoryItemsDetailed(logs);
      const agentInvLog = logs.find(l => l.table_name === 'agent_inventory');
      const invTransLog = logs.find(l => l.table_name === 'inventory_transactions');
      const transData = invTransLog?.new_data as any;
      
      const returnedTo = (agentInvLog?.new_data as any)?.leader_name || 'team leader';
      const reason = transData?.reason || '';
      const reasonText = reason ? `. Reason: ${reason}` : '';
      
      return `${userRole} ${userName} returned ${items.totalStock} stock to ${returnedTo} (${items.details})${reasonText}`;
    }

    case 'remittance': {
      const remittanceLog = logs.find(l => l.table_name === 'remittances_log');
      const items = extractInventoryItems(logs);
      const remittanceData = remittanceLog?.new_data as any;
      const soldOrders = remittanceData?.sold_orders_count || items.totalUnits;
      
      return `${userRole} ${userName} remitted ${soldOrders} sold orders (${items.summary})`;
    }

    case 'order_with_items': {
      const orderLog = logs.find(l => l.table_name === 'client_orders');
      const itemsLog = logs.filter(l => l.table_name === 'client_order_items');
      const orderData = orderLog?.new_data as any;
      const oldOrderData = orderLog?.old_data as any;
      
      // Get client name from enriched data
      const clientName = orderData?.client_name || 'client';
      const orderNumber = orderData?.order_number || `ORD-${orderData?.id?.slice(0, 8) || ''}`;
      
      // Check if it's an update or creation
      if (orderLog?.operation === 'UPDATE') {
        // Check what was updated
        if (orderLog.changed_fields?.includes('status')) {
          const oldStatus = oldOrderData?.status || 'pending';
          const newStatus = orderData?.status || 'unknown';
          return `${userRole} ${userName} ${newStatus} Order #${orderNumber} for ${clientName}`;
        }
        return `${userRole} ${userName} updated Order #${orderNumber} for ${clientName}`;
      }
      
      // Creation
      return `${userRole} ${userName} created Order #${orderNumber} for ${clientName}`;
    }

    case 'purchase_order_with_items': {
      const poLog = logs.find(l => l.table_name === 'purchase_orders');
      const itemsLog = logs.filter(l => l.table_name === 'purchase_order_items');
      const poData = poLog?.new_data as any;
      const poNumber = poData?.po_number || poData?.id?.slice(0, 8);
      const amount = poData?.total_amount;
      
      return `${userRole} ${userName} created Purchase Order #${poNumber} (${itemsLog.length} items${amount ? `, ₱${amount.toLocaleString()}` : ''})`;
    }

    case 'cash_deposit': {
      const depositLog = logs.find(l => l.table_name === 'cash_deposits');
      const depositData = depositLog?.new_data as any;
      const amount = depositData?.amount;
      const bank = depositData?.bank;
      const hasProof = !!depositData?.proof_url;
      
      return `${userRole} ${userName} deposited ₱${amount?.toLocaleString() || '0'}${bank ? ` to ${bank}` : ''}${hasProof ? ' with proof' : ''}`;
    }

    case 'team_assignment': {
      const teamLog = logs.find(l => l.table_name === 'leader_teams');
      const teamData = teamLog?.new_data as any;
      const agentName = teamData?.agent_name || 'an agent';
      const leaderName = teamData?.leader_name || 'team leader';
      
      return `${userRole} ${userName} assigned ${agentName} to ${leaderName}'s team`;
    }

    default: {
      // Fallback - try to extract meaningful info from the logs
      if (logs.length === 1 && logs[0].table_name === 'inventory_transactions') {
        const transData = logs[0].new_data as any;
        const quantity = Math.abs(transData?.quantity || 0);
        return `${userRole} ${userName} performed inventory transaction (${quantity} units)`;
      }
      return `${userRole} ${userName} performed ${logs.length} operations`;
    }
  }
}

/**
 * Helper to format "units" as "stock" throughout
 */
function formatStockCount(count: number): string {
  return `${count} stock`;
}

/**
 * Generate single operation description
 */
function generateSingleDescription(log: SystemAuditLog): string {
  const userName = log.user_name || log.user_email?.split('@')[0] || 'Someone';
  const userRole = log.user_role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'User';
  const tableName = log.table_name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const operation = log.operation === 'INSERT' ? 'created' : log.operation === 'UPDATE' ? 'updated' : 'deleted';
  
  // Add specific context based on table
  const data = log.new_data || log.old_data as any;
  const oldData = log.old_data as any;
  let context = '';
  
  // Special handling for inventory_transactions
  if (log.table_name === 'inventory_transactions') {
    const transType = data?.transaction_type;
    const quantity = Math.abs(data?.quantity || 0);
    
    if (transType === 'allocated_to_agent') {
      return `${userRole} ${userName} allocated ${quantity} stock to Mobile Sales`;
    } else if (transType === 'allocated_to_leader') {
      return `${userRole} ${userName} allocated ${quantity} stock to team leader`;
    } else if (transType === 'return' || transType === 'returned_to_leader') {
      return `${userRole} ${userName} returned ${quantity} stock`;
    } else if (transType === 'order_fulfilled') {
      return `${userRole} ${userName} fulfilled order (${quantity} stock)`;
    }
  }
  
  // Special handling for client_orders
  if (log.table_name === 'client_orders') {
    const clientName = data?.client_name || 'client';
    const orderNumber = data?.order_number || `ORD-${data?.id?.slice(0, 8) || ''}`;
    
    if (log.operation === 'INSERT') {
      return `${userRole} ${userName} created Order #${orderNumber} for ${clientName}`;
    } else if (log.operation === 'UPDATE') {
      if (log.changed_fields?.includes('status')) {
        const newStatus = data?.status || 'updated';
        return `${userRole} ${userName} ${newStatus} Order #${orderNumber} for ${clientName}`;
      }
      return `${userRole} ${userName} updated Order #${orderNumber} for ${clientName}`;
    } else if (log.operation === 'DELETE') {
      return `${userRole} ${userName} deleted Order #${orderNumber} for ${clientName}`;
    }
  }
  
  // Special handling for profiles - show WHAT changed
  if (log.table_name === 'profiles' && log.operation === 'UPDATE') {
    const profileName = data?.full_name || oldData?.full_name || 'user';
    const changes: string[] = [];
    
    // Check common fields that change
    if (log.changed_fields?.includes('status') && oldData?.status !== data?.status) {
      changes.push(`status from ${oldData?.status || 'unknown'} to ${data?.status || 'unknown'}`);
    }
    if (log.changed_fields?.includes('role') && oldData?.role !== data?.role) {
      changes.push(`role from ${oldData?.role || 'unknown'} to ${data?.role || 'unknown'}`);
    }
    if (log.changed_fields?.includes('full_name') && oldData?.full_name !== data?.full_name) {
      changes.push(`name from "${oldData?.full_name}" to "${data?.full_name}"`);
    }
    if (log.changed_fields?.includes('password')) {
      changes.push('password');
    }
    
    if (changes.length > 0) {
      return `${userRole} ${userName} updated ${profileName}'s ${changes.join(', ')}`;
    }
    
    return `${userRole} ${userName} updated ${profileName}'s profile`;
  }
  
  if (log.table_name === 'clients' && data?.name) {
    context = `: ${data.name}`;
  } else if (log.table_name === 'profiles' && data?.full_name) {
    context = `: ${data.full_name}`;
  } else if (data?.name) {
    context = `: ${data.name}`;
  }
  
  return `${userRole} ${userName} ${operation} ${tableName}${context}`;
}

/**
 * Generate summary for grouped actions
 */
function generateGroupSummary(logs: SystemAuditLog[], groupType: string): string {
  switch (groupType) {
    case 'stock_allocation_batch':
    case 'inventory_return_batch':
    case 'stock_allocation':
    case 'inventory_return':
    case 'remittance': {
      const items = extractInventoryItems(logs);
      return items.summary;
    }
    
    case 'order_with_items': {
      const orderLog = logs.find(l => l.table_name === 'client_orders');
      const orderData = orderLog?.new_data as any;
      const itemsCount = logs.filter(l => l.table_name === 'client_order_items').length;
      const totalAmount = orderData?.total_amount;
      if (totalAmount) {
        return `${itemsCount} items, Total: ₱${totalAmount.toLocaleString()}`;
      }
      return `${itemsCount} items`;
    }
    
    case 'purchase_order_with_items': {
      const itemsCount = logs.filter(l => l.table_name.includes('_items')).length;
      return `${itemsCount} items`;
    }
    
    default:
      return `${logs.length} operations`;
  }
}

/**
 * Extract detailed inventory items with variant names from enriched logs
 */
function extractInventoryItemsDetailed(logs: SystemAuditLog[]): { 
  details: string; 
  totalStock: number;
  variants: Array<{name: string; quantity: number; price?: number}>;
} {
  const variantsMap = new Map<string, {quantity: number; price?: number}>(); 
  let totalStock = 0;

  logs.forEach(log => {
    if (log.table_name === 'inventory_transactions') {
      const data = log.new_data as any;
      const quantity = Math.abs(data?.quantity || 0);
      
      // Use enriched variant_name if available
      let variantName = data?.variant_name || 'stock';
      let price = undefined;
      
      // Try to parse price from notes if available
      const notes = data?.notes || '';
      if (notes) {
        const priceMatch = notes.match(/at price\s+P?([\d,]+)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(',', ''));
        }
      }
      
      // Add to map
      if (quantity > 0) {
        const current = variantsMap.get(variantName) || {quantity: 0, price};
        variantsMap.set(variantName, {
          quantity: current.quantity + quantity,
          price: price || current.price
        });
        totalStock += quantity;
      }
    }
  });

  const variants = Array.from(variantsMap.entries()).map(([name, data]) => ({
    name,
    quantity: data.quantity,
    price: data.price
  }));

  let details = '';
  if (variants.length > 0) {
    if (variants.length === 1) {
      details = `${variants[0].quantity} ${variants[0].name}`;
    } else {
      details = `${variants.length} variants: ${variants.map(v => `${v.quantity} ${v.name}`).join(', ')}`;
    }
  } else {
    details = `${totalStock} stock`;
  }

  return { details, totalStock, variants };
}

/**
 * Extract inventory items from logs (legacy function for backward compatibility)
 */
function extractInventoryItems(logs: SystemAuditLog[]): { summary: string; totalUnits: number } {
  const detailed = extractInventoryItemsDetailed(logs);
  return {
    summary: detailed.details,
    totalUnits: detailed.totalStock
  };
}
