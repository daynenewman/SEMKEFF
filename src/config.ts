import { FantasyProvider, ProviderError } from './provider.js';
import { MockProvider } from './mock.js';
import { YahooProvider } from './yahoo.js';
import { YahooOAuth } from './oauth.js';
export function selectProvider(env: NodeJS.ProcessEnv=process.env): FantasyProvider {
  const mode=env.FANTASY_PROVIDER??'mock';
  if(mode==='mock') return new MockProvider();
  if(mode!=='yahoo') throw new ProviderError('CONFIGURATION','FANTASY_PROVIDER must be mock or yahoo.');
  const required=['YAHOO_LEAGUE_KEY','YAHOO_SEASON','YAHOO_CLIENT_ID','YAHOO_CLIENT_SECRET','YAHOO_REDIRECT_URI','YAHOO_REFRESH_TOKEN'] as const;
  if(required.some(k=>!env[k]||env[k]!.startsWith('REPLACE_'))) throw new ProviderError('CONFIGURATION','Yahoo mode requires non-placeholder configuration; access is pending.');
  const season=Number(env.YAHOO_SEASON);
  if(!/^[0-9]+\.l\.[0-9]+$/.test(env.YAHOO_LEAGUE_KEY!)||!Number.isInteger(season)||season<2000||season>2100) throw new ProviderError('CONFIGURATION','Invalid Yahoo league key or season.');
  return new YahooProvider(env.YAHOO_LEAGUE_KEY!,season,new YahooOAuth({clientId:env.YAHOO_CLIENT_ID!,clientSecret:env.YAHOO_CLIENT_SECRET!,redirectUri:env.YAHOO_REDIRECT_URI!,refreshToken:env.YAHOO_REFRESH_TOKEN!}));
}
