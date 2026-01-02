import { supabase } from '@/lib/supabase';
import { NotificationType } from '@/types/database.types';

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
