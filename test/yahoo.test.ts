import assert from 'node:assert/strict';
import { test } from 'node:test';
import { YahooOAuth } from '../src/oauth.js';
import { YahooProvider, projectYahoo } from '../src/yahoo.js';
import { resources } from '../src/provider.js';
const config={clientId:'fake-id',clientSecret:'fake-secret',redirectUri:'https://localhost/callback',refreshToken:'fake-refresh'};
test('OAuth deduplicates refreshes, retains rotated refresh tokens and validates state',async()=>{
  const bodies:string[]=[];
  const request:typeof fetch=async(_url,init)=>{
    bodies.push(String(init?.body));
    assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
    assert.equal(new Headers(init?.headers).get('Authorization'),`Basic ${Buffer.from('fake-id:fake-secret').toString('base64')}`);
    return Response.json({access_token:'fake-access',refresh_token:'rotated-refresh',expires_in:3600});
  };
  const oauth=new YahooOAuth(config,request);
  const state='a'.repeat(64);
  assert.equal(new URL(oauth.authorizationUrl(state)).searchParams.get('state'),state);
  await assert.rejects(oauth.exchangeCode('code','wrong',state),/state mismatch/);
  assert.deepEqual(await Promise.all([oauth.accessToken(),oauth.accessToken()]),['fake-access','fake-access']);
  assert.equal(bodies.length,1);assert.match(bodies[0]!,/redirect_uri=/);
  oauth.invalidate();await oauth.accessToken();assert.match(bodies[1]!,/refresh_token=rotated-refresh/);
});
test('OAuth errors do not expose upstream credentials or response bodies',async()=>{
  for(const request of [async()=>new Response('fake-secret',{status:400}),async()=>{throw new Error('fake-secret');},async()=>Response.json(null)]) {
    await assert.rejects(new YahooOAuth(config,request).accessToken(),e=>e instanceof Error && !e.message.includes('fake-secret'));
  }
});
const xml=(inner:string)=>new Response(`<fantasy_content><league>${inner}</league></fantasy_content>`);
test('Yahoo documented GET paths, metadata verification, retry and field projection',async()=>{
  const urls:string[]=[];let rejected=false;
  const oauth=new YahooOAuth(config,async()=>Response.json({access_token:'fake-access',expires_in:3600}));
  const request:typeof fetch=async(url,init)=>{
    const path=String(url);urls.push(path);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');
    if(!rejected){rejected=true;return new Response('',{status:401});}
    if(path.endsWith('/461.l.1000')) return xml('<season>2026</season><game_code>nfl</game_code>');
    if(path.includes('/teams/roster')) return xml('<teams><team><team_key>461.l.1000.t.1</team_key><roster><week>4</week><players><player><player_key>461.p.1</player_key><name><full>Example</full></name></player></players></roster><managers><manager><email>private</email></manager></managers><access_token>secret</access_token></team></teams>');
    return xml('<settings><scoring_type>head</scoring_type></settings>');
  };
  const provider=new YahooProvider('461.l.1000',2026,oauth,request);
  const result=await provider.retrieve('weekly_rosters',{season:2026,week:4,teamId:'461.l.1000.t.1'});
  assert.ok(urls.some(u=>u.endsWith('/teams/roster;week=4/players')));
  assert.equal(urls.filter(u=>u.endsWith('/461.l.1000')).length,2);
  assert.match(JSON.stringify(result),/461.p.1/);assert.doesNotMatch(JSON.stringify(result),/private|secret|access_token/);
  await assert.rejects(provider.retrieve('teams',{season:2025}),/season/);
  await assert.rejects(provider.retrieve('weekly_rosters',{season:2026,week:4,teamId:'other.t.1'}),/configured league/);
  assert.deepEqual(projectYahoo({name:'Test',refresh_token:'secret',managers:{email:'private'}}),{name:'Test'});
});
test('Yahoo rejects missing payloads, malformed XML, wrong seasons and HTTP errors safely',async()=>{
  const oauth=new YahooOAuth(config,async()=>Response.json({access_token:'fake-access',expires_in:3600}));
  for(const response of [new Response('secret',{status:403}),new Response('secret',{status:429}),new Response('<broken>'),xml('<season>2025</season><game_code>nfl</game_code>'),xml('<season>2026</season><game_code>nfl</game_code>')]) {
    const provider=new YahooProvider('461.l.1000',2026,oauth,async()=>response.clone());
    await assert.rejects(provider.retrieve('teams',{season:2026}),e=>e instanceof Error && !e.message.includes('secret'));
  }
});
test('all six Yahoo resources use documented paths and retain validation notices',async()=>{
  const oauth=new YahooOAuth(config,async()=>Response.json({access_token:'fake-access',expires_in:3600}));
  const suffixes=['/settings','/teams','/teams/roster;week=4/players','/scoreboard;week=4','/standings','/draftresults'];
  const roots=['settings','teams','teams','scoreboard','standings','draft_results'];
  for(const [i,resource] of resources.entries()) {
    const urls:string[]=[];
    const provider=new YahooProvider('461.l.1000',2026,oauth,async(url)=>{
      const path=String(url);urls.push(path);
      if(path.endsWith('/461.l.1000')) return xml('<season>2026</season><game_code>nfl</game_code>');
      return xml(`<${roots[i]}><status>test</status></${roots[i]}>`);
    });
    const result=await provider.retrieve(resource,{season:2026,...(resource.startsWith('weekly_')?{week:4}:{})}) as {liveValidation:string};
    assert.equal(result.liveValidation,'pending');
    assert.equal(urls.length,2);assert.ok(urls[1]!.endsWith(suffixes[i]!));
  }
});
