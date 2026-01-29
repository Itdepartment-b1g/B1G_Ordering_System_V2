import { supabase } from '@/lib/supabase';
import { NotificationType, SystemAuditLog } from '@/types/database.types';

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
