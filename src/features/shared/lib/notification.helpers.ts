import { supabase } from '@/lib/supabase';
import { Notification, NotificationType, SystemAuditLog } from '@/types/database.types';

export interface SendNotificationParams {
    userId: string;
    companyId: string;
    type: NotificationType;
    title: string;
    message: string;
    referenceType?: string;
    referenceId?: string;
}

/**
 * Deep-link path for a notification, if any.
 * Used by the notifications dropdown so items navigate on click.
 */
export function getNotificationHref(
    notification: Pick<Notification, 'notification_type' | 'reference_type'>,
    role?: string | null
): string | null {
    const ref = notification.reference_type;
    if (!ref) return null;

    switch (ref) {
        case 'key_account_purchase_order':
            return '/key-accounts/purchase-orders';
        case 'purchase_order':
            if (
                notification.notification_type === 'key_account_order_created' ||
                notification.notification_type === 'key_account_order_director_approved' ||
                notification.notification_type === 'key_account_order_admin_approved' ||
                notification.notification_type === 'key_account_order_rejected'
            ) {
                return '/key-accounts/purchase-orders';
            }
            if (notification.notification_type === 'inventory_allocated') {
                return role === 'team_leader' ? '/my-inventory' : '/purchase-orders';
            }
            if (
                role === 'team_leader' &&
                (notification.notification_type === 'stock_request_created' ||
                    notification.notification_type === 'stock_request_approved' ||
                    notification.notification_type === 'stock_request_rejected')
            ) {
                return '/purchase-orders';
            }
            return role === 'team_leader' ? '/inventory/po-receive' : '/purchase-orders';
        case 'allocation':
        case 'agent_inventory':
            return '/my-inventory';
        case 'stock_request':
            if (role === 'team_leader') return '/inventory/pending-requests';
            if (role === 'admin' || role === 'super_admin') return '/inventory/admin-requests';
            return '/inventory/request';
        case 'client_order':
            return '/orders';
        case 'client':
            return '/clients';
        case 'cash_deposit':
            return '/inventory/cash-deposits';
        default:
            return null;
    }
}

/**
 * Creates a notification in the database for the specified user.
 * This will trigger real-time updates for the recipient.
 */
export async function sendNotification(params: SendNotificationParams) {
    try {
        const { error } = await supabase.from('notifications').insert({
            user_id: params.userId,
            company_id: params.companyId,
            notification_type: params.type,
            title: params.title,
            message: params.message,
            reference_type: params.referenceType,
            reference_id: params.referenceId,
            is_read: false
        });

        if (error) {
            console.error('Error sending notification:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to send notification:', err);
        return { success: false, error: err };
    }
}

/**
 * Notify all company users whose roles match the provided list.
 * Useful for events like "order created" that should reach admins/finance.
 */
export async function sendNotificationToCompanyRoles(params: Omit<SendNotificationParams, 'userId'> & { roles: string[] }) {
    try {
        const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('id')
            .eq('company_id', params.companyId)
            .in('role', params.roles);

        if (usersError) throw usersError;

        const userIds = (users || []).map(u => u.id).filter(Boolean);
        if (userIds.length === 0) {
            return { success: true };
        }

        const notifications = userIds.map(userId => ({
            user_id: userId,
            company_id: params.companyId,
            notification_type: params.type,
            title: params.title,
            message: params.message,
            reference_type: params.referenceType,
            reference_id: params.referenceId,
            is_read: false
        }));

        const { error } = await supabase.from('notifications').insert(notifications);
        if (error) throw error;

        return { success: true };
    } catch (err) {
        console.error('Failed to send notification to company roles:', err);
        return { success: false, error: err };
    }
}

/**
 * Creates notifications for audit events to inform relevant users about system changes.
 * This is used for critical audit events that require user attention.
 */
export async function notifyAuditEvent(auditLog: SystemAuditLog, targetUserIds: string[]) {
    try {
        if (targetUserIds.length === 0) {
            return { success: true }; // No users to notify
        }

        const notifications = targetUserIds.map(userId => ({
            user_id: userId,
            company_id: auditLog.company_id,
            notification_type: 'audit_system_change' as NotificationType,
            title: `${auditLog.operation} on ${auditLog.table_name}`,
            message: auditLog.description || `A ${auditLog.operation} operation was performed on ${auditLog.table_name}`,
            reference_type: 'audit_log',
            reference_id: auditLog.id,
            is_read: false
        }));

        const { error } = await supabase.from('notifications').insert(notifications);

        if (error) {
            console.error('Error sending audit notifications:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to send audit notifications:', err);
        return { success: false, error: err };
    }
}

/**
 * Creates notifications for critical audit actions that require immediate attention.
 * Examples: deletion of records, security changes, etc.
 */
export async function notifyCriticalAuditAction(
    auditLog: SystemAuditLog,
    targetUserIds: string[],
    customMessage?: string
) {
    try {
        if (targetUserIds.length === 0) {
            return { success: true };
        }

        const notifications = targetUserIds.map(userId => ({
            user_id: userId,
            company_id: auditLog.company_id,
            notification_type: 'audit_critical_action' as NotificationType,
            title: `⚠️ Critical Action: ${auditLog.operation} on ${auditLog.table_name}`,
            message: customMessage || auditLog.description || `A critical ${auditLog.operation} operation was performed on ${auditLog.table_name}`,
            reference_type: 'audit_log',
            reference_id: auditLog.id,
            is_read: false
        }));

        const { error } = await supabase.from('notifications').insert(notifications);

        if (error) {
            console.error('Error sending critical audit notifications:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to send critical audit notifications:', err);
        return { success: false, error: err };
    }
}
