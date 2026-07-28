export interface KyxAuthorityEnv {
  readonly KYX_ROOM: DurableObjectNamespace;
  readonly KYX_ALLOCATION_GUARD: DurableObjectNamespace;
  readonly ALLOWED_ORIGINS: string;
  readonly BUILD_ID?: string;
}
