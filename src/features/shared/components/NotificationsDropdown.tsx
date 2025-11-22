import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getNotifications, markNotificationAsRead } from '@/lib/database.helpers';
import { useAuth } from '@/features/auth/hooks';
import { supabase } from '@/lib/supabase';
import { Notification } from '@/types/database.types';
import { formatDistanceToNow } from 'date-fns';

export function NotificationsDropdown() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [teamAgentIds, setTeamAgentIds] = useState<string[]>([]);

  // Check if user is a leader
  const isLeader = user?.role === 'sales_agent' && user?.position === 'Leader';
  const isAdmin = user?.role === 'admin';

  // Fetch notifications with role-based filtering
  const fetchNotifications = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      let data: Notification[] = [];

      if (isAdmin) {
        // Admin: see all notifications
        const { data: allNotifications, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        data = allNotifications || [];
      } else if (isLeader) {
        // Leader: see notifications for team members + themselves
        const allowedUserIds = [user.id, ...teamAgentIds];
        if (allowedUserIds.length > 0) {
          const { data: teamNotifications, error } = await supabase
            .from('notifications')
            .select('*')
            .in('user_id', allowedUserIds)
            .order('created_at', { ascending: false })
            .limit(100);

          if (error) throw error;
          data = teamNotifications || [];
        }
      } else {
        // Sales Agent: only their own notifications
        data = await getNotifications(user.id, false);
      }

      setNotifications(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mark notification as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    if (!user?.id) return;

    try {
      const unreadNotifications = notifications.filter(n => !n.is_read);
      await Promise.all(
        unreadNotifications.map(n => markNotificationAsRead(n.id))
      );
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Fetch team members for leaders
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!isLeader || !user?.id) return;

      try {
        const { data: teamData, error } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', user.id);

        if (error) {
          console.error('Error fetching team members:', error);
        } else {
          const agentIds = (teamData || []).map(t => t.agent_id);
          setTeamAgentIds(agentIds);
        }
      } catch (error) {
        console.error('Error fetching team members:', error);
      }
    };

    fetchTeamMembers();
  }, [user?.id, isLeader]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user?.id) return;

    // Initial fetch
    fetchNotifications();

    // Build subscription filter based on role
    let subscriptionConfig: any = {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
    };

    if (!isAdmin) {
      if (isLeader && teamAgentIds.length > 0) {
        // Leader: subscribe to notifications for team + themselves
        const allowedUserIds = [user.id, ...teamAgentIds];
        subscriptionConfig.filter = `user_id=in.(${allowedUserIds.join(',')})`;
      } else {
        // Sales Agent: only their own
        subscriptionConfig.filter = `user_id=eq.${user.id}`;
      }
    }
    // Admin: no filter (subscribe to all notifications)

    // Subscribe to new notifications
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        subscriptionConfig,
        (payload) => {
          const newNotification = payload.new as Notification;

          // For admin, always add
          // For leader, check if it's for team member or themselves
          // For agent, it's already filtered
          if (isAdmin ||
            (isLeader && (newNotification.user_id === user.id || teamAgentIds.includes(newNotification.user_id))) ||
            (!isLeader && !isAdmin && newNotification.user_id === user.id)) {
            setNotifications(prev => [newNotification, ...prev]);
            if (!newNotification.is_read) {
              setUnreadCount(prev => prev + 1);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          ...subscriptionConfig,
          event: 'UPDATE',
        },
        (payload) => {
          const updatedNotification = payload.new as Notification;

          // Update if it's in our notifications list
          setNotifications(prev => {
            const exists = prev.find(n => n.id === updatedNotification.id);
            if (exists) {
              if (updatedNotification.is_read && !exists.is_read) {
                setUnreadCount(c => Math.max(0, c - 1));
              }
              return prev.map(n =>
                n.id === updatedNotification.id ? updatedNotification : n
              );
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isLeader, isAdmin, teamAgentIds]);

  // Refresh when dropdown opens or team members change
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, teamAgentIds]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_approved':
      case 'order_created':
        return '✅';
      case 'order_rejected':
        return '❌';
      case 'inventory_low':
      case 'inventory_allocated':
        return '📦';
      case 'purchase_order_approved':
        return '🛒';
      case 'new_client':
        return '👤';
      case 'stock_request_approved':
        return '✓';
      case 'stock_request_rejected':
        return '✗';
      default:
        return '🔔';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'order_approved':
      case 'purchase_order_approved':
      case 'stock_request_approved':
        return 'bg-green-100 text-green-700';
      case 'order_rejected':
      case 'stock_request_rejected':
        return 'bg-red-100 text-red-700';
      case 'inventory_low':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  };

  // Show for all authenticated users (admin, leader, sales agent)
  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-xs"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${!notification.is_read ? 'bg-blue-50/50' : ''
                    }`}
                  onClick={() => {
                    if (!notification.is_read) {
                      handleMarkAsRead(notification.id);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.notification_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${!notification.is_read ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

