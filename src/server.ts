import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { FantasyProvider, ProviderError, resources } from './provider.js';
const season=z.number().int().min(2000).max(2100).describe('Explicit NFL season; mock supports 2026.');
const week=z.number().int().min(1).max(18).describe('Explicit NFL week.');
export function createServer(provider:FantasyProvider):McpServer {
  const server=new McpServer({name:'personal-yahoo-fantasy',version:'0.1.0'});
  for(const resource of resources) {
    const weekly=resource.startsWith('weekly_');
    const schema=z.object({season,...(weekly?{week}:{}),...(resource==='weekly_rosters'?{teamId:z.string().min(1).max(100).optional().describe('Stable team ID; omit to retrieve all league rosters.')}: {})}).strict();
    server.registerTool(`get_${resource}`,{
      description:`Read ${resource.replaceAll('_',' ')}. Mock mode is fictional. Standings are a season snapshot, not historical weekly standings. Yahoo mode is experimental and awaiting live validation.`,
      inputSchema:schema,
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:provider.source==='yahoo'}
    },async(q)=>{
      try {
        const query={season:q.season,...(typeof q.week==='number'?{week:q.week}:{}),...(typeof q.teamId==='string'?{teamId:q.teamId}:{})};
        const data=await provider.retrieve(resource,query);
        const response={source:provider.source,isMock:provider.source==='mock',notice:provider.source==='mock'?'MOCK DATA — entirely fictional league, teams, players, and results.':'Experimental Yahoo API data; live integration validation pending.',season:q.season,...('week' in q?{week:q.week}:{}),retrievedAt:new Date().toISOString(),data};
        return {content:[{type:'text' as const,text:JSON.stringify(response)}],structuredContent:response};
      } catch(e) {
        const response={source:provider.source,isMock:provider.source==='mock',retrievedAt:new Date().toISOString(),error:{code:e instanceof ProviderError?e.code:'INTERNAL_ERROR',message:e instanceof ProviderError?e.message:'Unable to retrieve fantasy data.'}};
        return {isError:true,content:[{type:'text' as const,text:JSON.stringify(response)}]};
      }
    });
  }
  return server;
}
