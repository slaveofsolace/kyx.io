import {
  forwardToStagingAuthority,
  type KyxPagesEnv,
} from './authorityProxy';

export const onRequest: PagesFunction<KyxPagesEnv> = (context) => (
  forwardToStagingAuthority(context)
);
