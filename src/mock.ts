import { FantasyProvider, ProviderError, Query, Resource } from './provider.js';
export const MOCK_SEASON = 2026;
export const MOCK_LEAGUE_ID = 'mock-nfl-2026-se-mke';
const names = ['Bay View Badgers','Lakefront Legends','Third Ward Thunder','Riverwest Ravens','South Shore Sharks','Oak Creek Owls','Cudahy Cyclones','St. Francis Foxes','Greenfield Grizzlies','Franklin Falcons','West Allis Wolves','Muskego Mustangs'];
export const teams = names.map((name, i) => ({ teamId: `mock-team-${String(i+1).padStart(2,'0')}`, name, manager: `Fictional Manager ${i+1}`, draftPosition: i+1 }));
const slots = ['QB','RB','RB','WR','WR','TE','W/R/T','K','DEF','BN','BN','BN','BN','BN','BN'];
const first = ['Adrian','Miles','Caleb','Theo','Jonah','Elliot','Marcus','Dante','Owen','Nolan','Isaac','Felix'];
const last = ['Mercer','Bennett','Hayes','Brooks','Carter','Reed','Sutton','Walsh','Price','Ellis','Turner','Cole','Morgan','Stone','Frost'];
export const players = teams.flatMap((team,t) => slots.map((slot,p) => ({ playerId: `mock-player-${String(t*15+p+1).padStart(3,'0')}`, teamId: team.teamId, name: p===8 ? `Fictional ${team.name} Defense` : `${first[t]} ${last[p]}`, position: slot==='BN' ? ['QB','RB','WR','TE','RB','WR'][p-9] : slot==='W/R/T' ? 'WR' : slot, selectedPosition: slot, status: (t+p)%19===0 ? 'Q' : 'Healthy' })));
export function matchups(week: number) {
  const order = [0, ...Array.from({length:11},(_,i)=>1+(i+week-1)%11)];
  return Array.from({length:6},(_,i)=> {
    const a=order[i]!, b=order[11-i]!;
    const score=(t:number)=> Math.round((88+((t*17+week*13)%62)+(t+week)/10)*100)/100;
    return { matchupId:`mock-2026-w${week}-${i+1}`, week, status:'final', teams:[a,b].map(t=>({teamId:teams[t]!.teamId,points:score(t)})) };
  });
}
export class MockProvider implements FantasyProvider {
  readonly source = 'mock' as const;
  async retrieve(resource: Resource, q: Query): Promise<unknown> {
    if(q.season!==MOCK_SEASON) throw new ProviderError('NOT_FOUND','Mock fixtures support season 2026 only.');
    if(q.week!==undefined && (!Number.isInteger(q.week)||q.week<1||q.week>18)) throw new ProviderError('INVALID_WEEK','Week must be 1–18.');
    if(q.teamId && !teams.some(t=>t.teamId===q.teamId)) throw new ProviderError('NOT_FOUND','Unknown mock team ID.');
    if(resource.startsWith('weekly_') && q.week===undefined) throw new ProviderError('INVALID_WEEK','An explicit week is required.');
    switch(resource) {
      case 'league_settings': return {leagueId:MOCK_LEAGUE_ID,name:'Fictional Southeast Milwaukee League',season:2026,numTeams:12,scoringType:'head-to-head points',receptionPoints:0.5,passingTouchdownPoints:4,rosterPositions:slots,playoffTeams:6,playoffStartWeek:15,draftType:'snake'};
      case 'teams': return teams;
      case 'weekly_rosters': return teams.filter(t=>!q.teamId||t.teamId===q.teamId).map(t=>({teamId:t.teamId,week:q.week,players:players.filter(p=>p.teamId===t.teamId)}));
      case 'weekly_matchups': return matchups(q.week!);
      case 'standings': {
        const table=teams.map(t=>({teamId:t.teamId,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0}));
        for(let w=1;w<=4;w++) for(const m of matchups(w)) {
          const [a,b]=m.teams; const x=table.find(t=>t.teamId===a!.teamId)!,y=table.find(t=>t.teamId===b!.teamId)!;
          x.pointsFor+=a!.points;x.pointsAgainst+=b!.points;y.pointsFor+=b!.points;y.pointsAgainst+=a!.points;
          if(a!.points>b!.points){x.wins++;y.losses++;}else if(a!.points<b!.points){y.wins++;x.losses++;}else{x.ties++;y.ties++;}
        }
        return {asOfWeek:4,entries:table.sort((a,b)=>b.wins-a.wins||b.pointsFor-a.pointsFor).map((t,i)=>({...t,rank:i+1,pointsFor:Math.round(t.pointsFor*100)/100,pointsAgainst:Math.round(t.pointsAgainst*100)/100}))};
      }
      case 'draft_results': return Array.from({length:180},(_,pick)=> { const round=Math.floor(pick/12)+1,seat=pick%12,t=round%2===1?seat:11-seat; return {pick:pick+1,round,teamId:teams[t]!.teamId,playerId:players[t*15+round-1]!.playerId}; });
    }
  }
}
