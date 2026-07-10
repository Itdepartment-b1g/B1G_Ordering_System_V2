export type HubSortKey = 'hubName' | 'location' | 'teamLeader' | 'createdBy' | 'createdAt';

export type HubSortDirection = 'asc' | 'desc';

export const DEFAULT_HUB_SORT_KEY: HubSortKey = 'createdAt';
export const DEFAULT_HUB_SORT_DIRECTION: HubSortDirection = 'desc';
