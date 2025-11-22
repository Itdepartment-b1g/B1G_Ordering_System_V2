// B1G Ordering System - Database Helper Functions
// SQL DATABASE REMOVED - All functions disabled
// This file is kept for reference but all database operations have been removed

// import { supabase } from './supabase'; // DISABLED - SQL database removed
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
  throw new Error('SQL database removed - getNotifications disabled');
}

export async function markNotificationAsRead(notificationId: string) {
  throw new Error('SQL database removed - markNotificationAsRead disabled');
}

export async function markAllNotificationsAsRead(userId: string) {
  throw new Error('SQL database removed - markAllNotificationsAsRead disabled');
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
