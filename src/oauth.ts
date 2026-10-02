import { ProviderError } from './provider.js';
export interface OAuthConfig { clientId: string; clientSecret: string; redirectUri: string; refreshToken: string }
type Token = { accessToken: string; refreshToken: string; expiresAt: number };
// Tokens stay in memory. A future OS credential-store adapter can persist rotations.
export class YahooOAuth {
  private token?: Token;
  private pending?: Promise<string>;
  constructor(private readonly config: OAuthConfig, private readonly request: typeof fetch = fetch) {}
  authorizationUrl(state: string): string {
    if(state.length<32) throw new ProviderError('OAUTH_STATE','Use a cryptographically random state of at least 32 characters.');
    const url=new URL('https://api.login.yahoo.com/oauth2/request_auth');
    url.search=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.config.redirectUri,response_type:'code',state}).toString();
    return url.toString();
  }
  async exchangeCode(code: string, returnedState: string, expectedState: string): Promise<void> {
    if(!expectedState || returnedState!==expectedState) throw new ProviderError('OAUTH_STATE','OAuth state mismatch.');
    await this.exchange({grant_type:'authorization_code',code,redirect_uri:this.config.redirectUri});
  }
  async accessToken(): Promise<string> {
    if(this.token && this.token.expiresAt>Date.now()+60_000) return this.token.accessToken;
    if(!this.pending) this.pending=this.exchange({grant_type:'refresh_token',redirect_uri:this.config.redirectUri,refresh_token:this.token?.refreshToken??this.config.refreshToken}).finally(()=>{this.pending=undefined;});
    return this.pending;
  }
  invalidate(): void { if(this.token) this.token.expiresAt=0; }
  private async exchange(params: Record<string,string>): Promise<string> {
    let response: Response;
    try {
      response=await this.request('https://api.login.yahoo.com/oauth2/get_token',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),
        headers:{Authorization:`Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams(params)
      });
    } catch { throw new ProviderError('OAUTH_UNAVAILABLE','Yahoo token request failed.'); }
    if(!response.ok) throw new ProviderError('OAUTH_REJECTED','Yahoo authorization failed; reauthorization may be required.');
    let body: unknown;
    try { body=await response.json(); } catch { throw new ProviderError('OAUTH_RESPONSE','Invalid Yahoo token response.'); }
    const b=body as Record<string,unknown>;
    if(!b || typeof b.access_token!=='string'||!b.access_token||typeof b.expires_in!=='number'||b.expires_in<=0||!Number.isFinite(b.expires_in)) throw new ProviderError('OAUTH_RESPONSE','Invalid Yahoo token response.');
    this.token={accessToken:b.access_token,refreshToken:typeof b.refresh_token==='string'?b.refresh_token:this.token?.refreshToken??this.config.refreshToken,expiresAt:Date.now()+b.expires_in*1000};
    return this.token.accessToken;
  }
}
