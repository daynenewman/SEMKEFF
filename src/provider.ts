export const resources = ['league_settings', 'teams', 'weekly_rosters', 'weekly_matchups', 'standings', 'draft_results'] as const;
export type Resource = typeof resources[number];
export interface Query { season: number; week?: number; teamId?: string }
export interface FantasyProvider {
  readonly source: 'mock' | 'yahoo';
  retrieve(resource: Resource, query: Query): Promise<unknown>;
}
export class ProviderError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
