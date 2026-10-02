import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { selectProvider } from '../src/config.js';
import { MockProvider, teams, players, matchups } from '../src/mock.js';
import { resources } from '../src/provider.js';
test('provider selection defaults to mock and fails closed for invalid Yahoo configuration',()=>{
  assert.equal(selectProvider({}).source,'mock');
  assert.equal(selectProvider({FANTASY_PROVIDER:'mock',YAHOO_CLIENT_SECRET:'do-not-use'}).source,'mock');
  assert.throws(()=>selectProvider({FANTASY_PROVIDER:'invalid'}),/must be mock or yahoo/);
  assert.throws(()=>selectProvider({FANTASY_PROVIDER:'yahoo'}),/requires non-placeholder/);
  const env={FANTASY_PROVIDER:'yahoo',YAHOO_LEAGUE_KEY:'461.l.1000',YAHOO_SEASON:'2026',YAHOO_CLIENT_ID:'test',YAHOO_CLIENT_SECRET:'test',YAHOO_REDIRECT_URI:'https://localhost/callback',YAHOO_REFRESH_TOKEN:'test'};
  assert.equal(selectProvider(env).source,'yahoo');
  assert.throws(()=>selectProvider({...env,YAHOO_SEASON:'bad'}),/Invalid Yahoo/);
});
test('fictional fixtures have stable IDs, complete rosters, consistent draft and standings',async()=>{
  const provider=new MockProvider();
  assert.equal(teams.length,12);assert.equal(players.length,180);
  assert.equal(new Set(players.map(p=>p.playerId)).size,180);
  for(let w=1;w<=18;w++) assert.equal(new Set(matchups(w).flatMap(m=>m.teams.map(t=>t.teamId))).size,12);
  const draft=await provider.retrieve('draft_results',{season:2026}) as {pick:number;round:number;teamId:string;playerId:string}[];
  assert.equal(draft.length,180);assert.equal(new Set(draft.map(p=>p.playerId)).size,180);
  assert.equal(draft[12]!.teamId,teams[11]!.teamId);
  for(const pick of draft) assert.equal(players.find(p=>p.playerId===pick.playerId)!.teamId,pick.teamId);
  const standings=await provider.retrieve('standings',{season:2026}) as {entries:{wins:number;losses:number;ties:number;pointsFor:number;pointsAgainst:number}[]};
  assert.equal(standings.entries.reduce((n,t)=>n+t.wins,0),24);
  for(const t of standings.entries) assert.equal(t.wins+t.losses+t.ties,4);
  assert.ok(Math.abs(standings.entries.reduce((n,t)=>n+t.pointsFor-t.pointsAgainst,0))<0.001);
  await assert.rejects(provider.retrieve('teams',{season:2025}),/2026 only/);
  await assert.rejects(provider.retrieve('weekly_rosters',{season:2026,week:4,teamId:'missing'}),/Unknown mock team/);
});
test('real stdio MCP tool responses, schemas and recoverable errors',async()=>{
  const client=new Client({name:'test-client',version:'1'});
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:['--import','tsx','src/index.ts'],env:{FANTASY_PROVIDER:'mock'}}));
    const listed=await client.listTools();
    assert.deepEqual(listed.tools.map(t=>t.name).sort(),resources.map(r=>`get_${r}`).sort());
    assert.ok(listed.tools.every(t=>t.annotations?.readOnlyHint===true && t.annotations.destructiveHint===false));
    for(const resource of resources) {
      const result=await client.callTool({name:`get_${resource}`,arguments:{season:2026,...(resource.startsWith('weekly_')?{week:4}:{})}});
      assert.notEqual(result.isError,true);
      const data=result.structuredContent!;
      assert.equal(data.source,'mock');assert.equal(data.isMock,true);assert.match(String(data.notice),/MOCK DATA/);assert.ok(Number.isFinite(Date.parse(String(data.retrievedAt))));
      const text=(result.content as {type:string;text:string}[])[0]!.text;
      assert.deepEqual(JSON.parse(text),data);
    }
    const filtered=await client.callTool({name:'get_weekly_rosters',arguments:{season:2026,week:4,teamId:'mock-team-01'}});
    assert.equal((filtered.structuredContent!.data as unknown[]).length,1);
    for(const args of [{season:2026},{season:2026,week:0},{season:'2026',week:4},{season:2026,week:4,secret:'injected'}]) {
      const result=await client.callTool({name:'get_weekly_matchups',arguments:args});assert.equal(result.isError,true);
    }
    const missing=await client.callTool({name:'get_teams',arguments:{season:2025}});assert.equal(missing.isError,true);assert.match(JSON.stringify(missing),/NOT_FOUND/);
    const recovered=await client.callTool({name:'get_teams',arguments:{season:2026}});assert.notEqual(recovered.isError,true);
  } finally {await client.close();}
});
