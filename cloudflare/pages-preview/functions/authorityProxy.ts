export interface AuthorityFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface KyxPagesEnv {
    readonly KYX_AUTHORITY: AuthorityFetcher;
}

export interface KyxPagesContext {
  readonly request: Request;
  readonly env: KyxPagesEnv;
}

export function forwardToStagingAuthority(context: KyxPagesContext): Promise<Response> {
  return context.env.KYX_AUTHORITY.fetch(context.request);
}
