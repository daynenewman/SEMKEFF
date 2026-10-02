import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resources } from '../src/provider.js';
const client=new Client({name:'mock-smoke',version:'1.0.0'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{FANTASY_PROVIDER:'mock'}}));
  const listed=await client.listTools();
  if(listed.tools.length!==6) throw new Error('Expected six tools.');
  for(const resource of resources) {
    const result=await client.callTool({name:`get_${resource}`,arguments:{season:2026,...(resource.startsWith('weekly_')?{week:4}:{})}});
    if(result.isError || result.structuredContent?.isMock!==true) throw new Error(`Mock tool failed: ${resource}`);
    console.log(`${resource}: mock response received`);
  }
} finally { await client.close(); }
