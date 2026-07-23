export interface KyxAuthorityEnv {
  readonly KYX_ROOM: DurableObjectNamespace;
  readonly ALLOWED_ORIGINS: string;
  readonly BUILD_ID?: string;
}
