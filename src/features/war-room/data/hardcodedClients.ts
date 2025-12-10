// Hardcoded client data for War Room demonstration
// This will be replaced with real database data later

export interface WarRoomClient {
  id: string;
  name: string;
  company: string;
  account_type: 'Key Accounts' | 'Standard Accounts';
  has_forge: boolean;
  location_latitude: number;
  location_longitude: number;
  address: string;
  city: string;
  region: string;
  email: string;
  phone: string;
  total_orders?: number;
  total_spent?: number;
}

// Sample clients across different locations in the Philippines
export const HARDCODED_CLIENTS: WarRoomClient[] = [
  // Manila Area - Key Accounts with Forge
  {
    id: '1',
    name: 'Metro Manila Store A',
    company: 'Premium Retail Corp',
    account_type: 'Key Accounts',
    has_forge: true,
    location_latitude: 14.5995,
    location_longitude: 120.9842,
    address: '123 Makati Ave',
    city: 'Makati',
    region: 'Metro Manila',
    email: 'manila.store@example.com',
    phone: '+63 917-123-4567',
    total_orders: 45,
    total_spent: 2500000
  },
  // Quezon City - Key Account without Forge
  {
    id: '2',
    name: 'QC Mega Center',
    company: 'Big Mall Holdings',
    account_type: 'Key Accounts',
    has_forge: false,
    location_latitude: 14.6760,
    location_longitude: 121.0437,
    address: '456 Commonwealth Ave',
    city: 'Quezon City',
    region: 'Metro Manila',
    email: 'qc.center@example.com',
    phone: '+63 918-234-5678',
    total_orders: 38,
    total_spent: 1800000
  },
  // Pasig - Standard Account with Forge
  {
    id: '3',
    name: 'Ortigas Branch',
    company: 'Local Distributor Inc',
    account_type: 'Standard Accounts',
    has_forge: true,
    location_latitude: 14.5764,
    location_longitude: 121.0851,
    address: '789 Ortigas Center',
    city: 'Pasig',
    region: 'Metro Manila',
    email: 'ortigas@example.com',
    phone: '+63 919-345-6789',
    total_orders: 22,
    total_spent: 650000
  },
  // Manila Downtown - Standard Account without Forge
  {
    id: '4',
    name: 'Downtown Shop',
    company: 'Small Business Co',
    account_type: 'Standard Accounts',
    has_forge: false,
    location_latitude: 14.5842,
    location_longitude: 120.9822,
    address: '321 Taft Avenue',
    city: 'Manila',
    region: 'Metro Manila',
    email: 'downtown@example.com',
    phone: '+63 920-456-7890',
    total_orders: 15,
    total_spent: 320000
  },
  // Cebu - Key Account with Forge
  {
    id: '5',
    name: 'Cebu Premium Store',
    company: 'Visayas Top Retail',
    account_type: 'Key Accounts',
    has_forge: true,
    location_latitude: 10.3157,
    location_longitude: 123.8854,
    address: '111 Ayala Center',
    city: 'Cebu City',
    region: 'Central Visayas',
    email: 'cebu.premium@example.com',
    phone: '+63 921-567-8901',
    total_orders: 52,
    total_spent: 3200000
  },
  // Cebu - Standard Account with Forge
  {
    id: '6',
    name: 'Cebu North Shop',
    company: 'North Cebu Traders',
    account_type: 'Standard Accounts',
    has_forge: true,
    location_latitude: 10.3500,
    location_longitude: 123.9000,
    address: '222 Banilad Road',
    city: 'Cebu City',
    region: 'Central Visayas',
    email: 'cebu.north@example.com',
    phone: '+63 922-678-9012',
    total_orders: 18,
    total_spent: 480000
  },
  // Davao - Key Account without Forge
  {
    id: '7',
    name: 'Davao Central Mall',
    company: 'Mindanao Retail Hub',
    account_type: 'Key Accounts',
    has_forge: false,
    location_latitude: 7.0731,
    location_longitude: 125.6128,
    address: '333 JP Laurel Ave',
    city: 'Davao City',
    region: 'Davao Region',
    email: 'davao.central@example.com',
    phone: '+63 923-789-0123',
    total_orders: 41,
    total_spent: 2100000
  },
  // Davao - Standard Account without Forge
  {
    id: '8',
    name: 'Davao South Store',
    company: 'South Point Sales',
    account_type: 'Standard Accounts',
    has_forge: false,
    location_latitude: 7.0500,
    location_longitude: 125.6000,
    address: '444 Matina Road',
    city: 'Davao City',
    region: 'Davao Region',
    email: 'davao.south@example.com',
    phone: '+63 924-890-1234',
    total_orders: 12,
    total_spent: 280000
  },
  // Baguio - Key Account with Forge
  {
    id: '9',
    name: 'Baguio Mountain Store',
    company: 'Highland Retail Group',
    account_type: 'Key Accounts',
    has_forge: true,
    location_latitude: 16.4023,
    location_longitude: 120.5960,
    address: '555 Session Road',
    city: 'Baguio City',
    region: 'Cordillera',
    email: 'baguio.mountain@example.com',
    phone: '+63 925-901-2345',
    total_orders: 35,
    total_spent: 1650000
  },
  // Iloilo - Standard Account with Forge
  {
    id: '10',
    name: 'Iloilo West Branch',
    company: 'Western Visayas Traders',
    account_type: 'Standard Accounts',
    has_forge: true,
    location_latitude: 10.7202,
    location_longitude: 122.5621,
    address: '666 Diversion Road',
    city: 'Iloilo City',
    region: 'Western Visayas',
    email: 'iloilo.west@example.com',
    phone: '+63 926-012-3456',
    total_orders: 20,
    total_spent: 550000
  },
  // Pampanga - Key Account without Forge
  {
    id: '11',
    name: 'Angeles Premium Shop',
    company: 'Central Luzon Holdings',
    account_type: 'Key Accounts',
    has_forge: false,
    location_latitude: 15.1450,
    location_longitude: 120.5887,
    address: '777 MacArthur Highway',
    city: 'Angeles City',
    region: 'Central Luzon',
    email: 'angeles.premium@example.com',
    phone: '+63 927-123-4567',
    total_orders: 33,
    total_spent: 1450000
  },
  // Laguna - Standard Account without Forge
  {
    id: '12',
    name: 'Laguna Bay Store',
    company: 'Bay Area Distributors',
    account_type: 'Standard Accounts',
    has_forge: false,
    location_latitude: 14.2456,
    location_longitude: 121.4107,
    address: '888 National Highway',
    city: 'Santa Rosa',
    region: 'CALABARZON',
    email: 'laguna.bay@example.com',
    phone: '+63 928-234-5678',
    total_orders: 16,
    total_spent: 390000
  },
  // Cagayan de Oro - Key Account with Forge
  {
    id: '13',
    name: 'CDO Elite Store',
    company: 'Northern Mindanao Corp',
    account_type: 'Key Accounts',
    has_forge: true,
    location_latitude: 8.4542,
    location_longitude: 124.6319,
    address: '999 Corrales Ave',
    city: 'Cagayan de Oro',
    region: 'Northern Mindanao',
    email: 'cdo.elite@example.com',
    phone: '+63 929-345-6789',
    total_orders: 39,
    total_spent: 1950000
  },
  // Bacolod - Standard Account with Forge
  {
    id: '14',
    name: 'Bacolod City Branch',
    company: 'Negros Trading Post',
    account_type: 'Standard Accounts',
    has_forge: true,
    location_latitude: 10.6770,
    location_longitude: 122.9500,
    address: '101 Lacson Street',
    city: 'Bacolod City',
    region: 'Western Visayas',
    email: 'bacolod@example.com',
    phone: '+63 930-456-7890',
    total_orders: 19,
    total_spent: 470000
  },
  // Taguig - Key Account without Forge
  {
    id: '15',
    name: 'BGC Premium Outlet',
    company: 'Fort Retail Corporation',
    account_type: 'Key Accounts',
    has_forge: false,
    location_latitude: 14.5547,
    location_longitude: 121.0470,
    address: '202 BGC Central',
    city: 'Taguig',
    region: 'Metro Manila',
    email: 'bgc.premium@example.com',
    phone: '+63 931-567-8901',
    total_orders: 47,
    total_spent: 2350000
  }
];

