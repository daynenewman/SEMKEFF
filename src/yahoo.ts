import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { FantasyProvider, ProviderError, Query, Resource } from './provider.js';
import { YahooOAuth } from './oauth.js';
// Explicit field allowlist: never relay arbitrary upstream bodies or manager identifiers.
const fields = new Set(['league_key','league_id','name','full','first','last','season','game_code','num_teams','scoring_type','draft_type','is_auction_draft','uses_playoff','num_playoff_teams','playoff_start_week','roster_positions','roster_position','position','count','stat_categories','stats','stat','stat_id','display_name','stat_modifiers','stat_modifier','value','settings','teams','team','team_key','team_id','roster','coverage_type','week','players','player','player_key','player_id','editorial_team_abbr','display_position','eligible_positions','selected_position','status','scoreboard','matchups','matchup','winner_team_key','is_tied','team_points','total','standings','team_standings','rank','outcome_totals','wins','losses','ties','percentage','points_for','points_against','draft_results','draft_result','pick','round','cost']);
export function projectYahoo(value: unknown): unknown {
  if(Array.isArray(value)) return value.map(projectYahoo);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([k])=>fields.has(k)).map(([k,v])=>[k,projectYahoo(v)]));
  return value;
}
export class YahooProvider implements FantasyProvider {
  readonly source='yahoo' as const;
  constructor(private readonly leagueKey: string, private readonly season: number, private readonly oauth: YahooOAuth, private readonly request: typeof fetch=fetch) {}
  private async get(path: string): Promise<Record<string,unknown>> {
    const send=async()=>this.request(`https://fantasysports.yahooapis.com/fantasy/v2/${path}`,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${await this.oauth.accessToken()}`,Accept:'application/xml'},signal:AbortSignal.timeout(15_000)});
    let response: Response;
    try { response=await send(); if(response.status===401){this.oauth.invalidate();response=await send();} }
    catch(e) { if(e instanceof ProviderError) throw e; throw new ProviderError('UPSTREAM_UNAVAILABLE','Yahoo request failed.'); }
    if(!response.ok) throw new ProviderError(response.status===403?'ACCESS_PENDING':response.status===429?'RATE_LIMITED':'UPSTREAM_ERROR',`Yahoo API returned HTTP ${response.status}.`);
    let xml: string;
    try { xml=await response.text(); } catch { throw new ProviderError('UPSTREAM_RESPONSE','Unable to read Yahoo response.'); }
    if(xml.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true) throw new ProviderError('UPSTREAM_RESPONSE','Invalid Yahoo XML response.');
    const parsed=new XMLParser({ignoreAttributes:true,parseTagValue:false}).parse(xml);
    const league=parsed?.fantasy_content?.league;
    if(!league || typeof league!=='object') throw new ProviderError('UPSTREAM_RESPONSE','Yahoo response is missing league data.');
    return league;
  }
  async retrieve(resource: Resource,q:Query): Promise<unknown> {
    if(q.season!==this.season) throw new ProviderError('SEASON_MISMATCH','Requested season does not match configured Yahoo season.');
    if(resource.startsWith('weekly_') && (!Number.isInteger(q.week)||q.week!<1||q.week!>18)) throw new ProviderError('INVALID_WEEK','An explicit week from 1–18 is required.');
    if(q.teamId && !new RegExp(`^${this.leagueKey.replace(/\./g,'\\.') }\\.t\\.[1-9][0-9]*$`).test(q.teamId)) throw new ProviderError('INVALID_TEAM','Team ID must be a full team key from the configured league.');
    const base=`league/${this.leagueKey}`;
    const metadata=await this.get(base);
    if(metadata.game_code!=='nfl'||Number(metadata.season)!==q.season) throw new ProviderError('SEASON_MISMATCH','Yahoo league metadata must match NFL and requested season.');
    const paths:Record<Resource,string>={league_settings:`${base}/settings`,teams:`${base}/teams`,weekly_rosters:`${base}/teams/roster;week=${q.week}/players`,weekly_matchups:`${base}/scoreboard;week=${q.week}`,standings:`${base}/standings`,draft_results:`${base}/draftresults`};
    const result=await this.get(paths[resource]);
    const expected={league_settings:'settings',teams:'teams',weekly_rosters:'teams',weekly_matchups:'scoreboard',standings:'standings',draft_results:'draft_results'}[resource];
    if(!(expected in result)) throw new ProviderError('UPSTREAM_RESPONSE','Yahoo response is missing the requested resource.');
    if(resource==='weekly_rosters' && q.teamId) {
      const collection=result.teams as {team?: Record<string,unknown>|Record<string,unknown>[]};
      const list=Array.isArray(collection.team)?collection.team:collection.team?[collection.team]:[];
      const team=list.find(t=>t.team_key===q.teamId);
      if(!team) throw new ProviderError('NOT_FOUND','Requested team was not found.');
      result.teams={team:[team]};
    }
    return {format:'yahoo-field-projection-v1',liveValidation:'pending',leagueId:this.leagueKey,data:projectYahoo(result)};
  }
}
