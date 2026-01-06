// B1G Ordering System - Database Helper Functions
// SQL DATABASE REMOVED - All functions disabled
// This file is kept for reference but all database operations have been removed

import { supabase } from './supabase';
import type {
  Profile,
  Brand,
  Variant,
  MainInventory,
  AgentInventory,
  Client,
  ClientOrder,
  PurchaseOrder,
  Supplier,
  Notification,
  Event,
  InventoryWithVariant,
  AgentInventoryWithVariant,
  ClientOrderWithDetails,
  PurchaseOrderWithDetails,
  AdminDashboardStats,
  AgentDashboardStats,
  FunctionResponse,
  CreateClientOrderInput,
  AllocateInventoryInput,
} from '@/types/database.types';

// ============================================================================
// ALL DATABASE FUNCTIONS DISABLED - SQL DATABASE REMOVED
// ============================================================================

export async function getProfile(userId: string) {
  throw new Error('SQL database removed - getProfile disabled');
}

export async function getAllAgents() {
  throw new Error('SQL database removed - getAllAgents disabled');
}

export async function getActiveAgents() {
  throw new Error('SQL database removed - getActiveAgents disabled');
}

export async function getAllBrands() {
  throw new Error('SQL database removed - getAllBrands disabled');
}

export async function getVariantsByBrand(brandId: string) {
  throw new Error('SQL database removed - getVariantsByBrand disabled');
}

export async function getAllVariants() {
  throw new Error('SQL database removed - getAllVariants disabled');
}

export async function getMainInventory() {
  throw new Error('SQL database removed - getMainInventory disabled');
}

export async function getAgentInventory(agentId: string) {
  throw new Error('SQL database removed - getAgentInventory disabled');
}

export async function getAllAgentsInventory() {
  throw new Error('SQL database removed - getAllAgentsInventory disabled');
}

export async function getClients(agentId?: string) {
  throw new Error('SQL database removed - getClients disabled');
}

export async function createClient(clientData: Partial<Client>) {
  throw new Error('SQL database removed - createClient disabled');
}

export async function updateClient(clientId: string, updates: Partial<Client>) {
  throw new Error('SQL database removed - updateClient disabled');
}

export async function getClientOrders(agentId?: string) {
  throw new Error('SQL database removed - getClientOrders disabled');
}

export async function getPendingOrders() {
  throw new Error('SQL database removed - getPendingOrders disabled');
}

export async function getPurchaseOrders() {
  throw new Error('SQL database removed - getPurchaseOrders disabled');
}

export async function getSuppliers() {
  throw new Error('SQL database removed - getSuppliers disabled');
}

export async function getNotifications(userId: string, unreadOnly = false) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
  return { success: true };
}

export async function markAllNotificationsAsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId);

  if (error) throw error;
  return { success: true };
}

export async function generateOrderNumber(): Promise<string> {
  throw new Error('SQL database removed - generateOrderNumber disabled');
}

export async function generatePONumber(): Promise<string> {
  throw new Error('SQL database removed - generatePONumber disabled');
}

export async function approvePurchaseOrder(
  poId: string,
  approverId: string
): Promise<FunctionResponse> {
  throw new Error('SQL database removed - approvePurchaseOrder disabled');
}

export async function allocateInventoryToAgent(
  input: AllocateInventoryInput
): Promise<FunctionResponse> {
  throw new Error('SQL database removed - allocateInventoryToAgent disabled');
}

export async function createClientOrder(
  input: CreateClientOrderInput
): Promise<FunctionResponse> {
  throw new Error('SQL database removed - createClientOrder disabled');
}

export async function approveClientOrder(
  orderId: string,
  approverId: string
): Promise<FunctionResponse> {
  throw new Error('SQL database removed - approveClientOrder disabled');
}

export async function rejectClientOrder(
  orderId: string,
  approverId: string,
  reason?: string
): Promise<FunctionResponse> {
  throw new Error('SQL database removed - rejectClientOrder disabled');
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  throw new Error('SQL database removed - getAdminDashboardStats disabled');
}

export async function getAgentDashboardStats(
  agentId: string
): Promise<AgentDashboardStats> {
  throw new Error('SQL database removed - getAgentDashboardStats disabled');
}

export async function uploadClientPhoto(
  agentId: string,
  clientId: string,
  file: File
): Promise<string> {
  throw new Error('SQL database removed - uploadClientPhoto disabled');
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  throw new Error('SQL database removed - uploadAvatar disabled');
}

// ============================================================================
// EVENT LOGGING - ACTIVE FUNCTION
// ============================================================================

export interface LogEventInput {
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  target_label?: string;
  actor_label?: string;
  details?: Record<string, any>;
}

/**
 * Log an event to the centralized events table
 * Automatically fetches company_id from the actor's profile
 * 
 * @param input - Event details
 * @returns Success response or throws error
 * 
 * @example
 * await logEvent({
 *   actor_id: user.id,
 *   action: 'reset_password',
 *   target_type: 'profile',
 *   target_id: agent.id,
 *   target_label: agent.name,
 *   details: {
 *     message: `Password reset for ${agent.name}`,
 *     reset_target_email: agent.email
 *   }
 * });
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    // Fetch actor's profile to get company_id and role
    const { data: actorProfile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id, role, full_name')
      .eq('id', input.actor_id)
      .single();

    if (profileError || !actorProfile) {
      console.error('Failed to fetch actor profile for event logging:', profileError);
      throw new Error('Cannot log event: actor profile not found');
    }

    // Determine actor_role based on role
    let actor_role: Event['actor_role'] = 'sales_agent';
    if (actorProfile.role === 'admin' || actorProfile.role === 'super_admin') {
      actor_role = 'admin';
    } else if (actorProfile.role === 'finance') {
      actor_role = 'finance';
    } else if (actorProfile.role === 'manager') {
      actor_role = 'manager';
    } else if (actorProfile.role === 'team_leader') {
      actor_role = 'leader';
    } else if (actorProfile.role === 'system_administrator') {
      actor_role = 'system';
    }

    // Insert event into the events table
    const { error: insertError } = await supabase
      .from('events')
      .insert({
        company_id: actorProfile.company_id,
        actor_id: input.actor_id,
        actor_role: actor_role,
        performed_by: actorProfile.full_name,
        actor_label: input.actor_label || null,
        action: input.action,
        target_type: input.target_type,
        target_id: input.target_id,
        target_label: input.target_label || null,
        details: input.details || {}
      });

    if (insertError) {
      console.error('Failed to insert event:', insertError);
      throw insertError;
    }
  } catch (error) {
    console.error('Error logging event:', error);
    // Don't throw - we don't want event logging failures to break the application
    // Just log the error for debugging
  }
}

