// Utility functions for determining marker colors based on client attributes

export interface MarkerColorConfig {
  color: string;
  label: string;
}

export const getMarkerColor = (accountType: string, hasForge: boolean): string => {
  if (accountType === 'Key Accounts') {
    return hasForge ? '#1e40af' : '#3b82f6'; // Dark Blue : Light Blue
  } else {
    return hasForge ? '#166534' : '#22c55e'; // Dark Green : Light Green
  }
};

export const getMarkerLabel = (accountType: string, hasForge: boolean): string => {
  const forgeStatus = hasForge ? 'with Forge' : 'without Forge';
  return `${accountType} ${forgeStatus}`;
};

export const legendColors: MarkerColorConfig[] = [
  {
    color: '#1e40af',
    label: 'Key Account with Forge'
  },
  {
    color: '#3b82f6',
    label: 'Key Account without Forge'
  },
  {
    color: '#166534',
    label: 'Standard Account with Forge'
  },
  {
    color: '#22c55e',
    label: 'Standard Account without Forge'
  },
  {
    color: '#6b7280',
    label: 'Missing Location Data'
  }
];

