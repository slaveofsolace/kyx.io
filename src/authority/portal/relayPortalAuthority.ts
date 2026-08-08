import type { MovementQueryPort } from '../../sim';
import { RELAY_AUTHORITY_IDENTITY } from '../relayAuthority';
import type {
  AuthorityWorldPortalAdvanceInputV1,
  AuthorityWorldPortalAdvanceResultV1,
  AuthorityWorldPortalPort,
} from '../worldPortal';
import {
  advanceLinkedWorldPortalAuthority,
  createLinkedWorldPortalAuthorityPort,
  type LinkedWorldPortalAuthorityConfig,
  type LinkedWorldPortalEndpoint,
  type LinkedWorldPortalPointMm,
} from './linkedWorldPortalAuthority';

export const RELAY_PORTAL_CAPABILITY_ID =
  'relay_revision_1_linked_world_portal_v1' as const;

export type RelayPortalEndpointId =
  | 'relay_service_gate'
  | 'relay_overlook_gate';

export interface RelayPortalEndpoint
  extends LinkedWorldPortalEndpoint<RelayPortalEndpointId> {
  readonly presentation: LinkedWorldPortalEndpoint<RelayPortalEndpointId>['presentation'] & Readonly<{
    readonly visualCenterMm: LinkedWorldPortalPointMm;
    readonly colorRole: 'cyan_service' | 'amber_overlook';
  }>;
}

const point = (x: number, y: number, z: number): LinkedWorldPortalPointMm =>
  Object.freeze({ x, y, z });

/**
 * Relay's linked gates connect the lower service court to the upper overlook.
 * Both exits land on proven floor surfaces, outside the partner trigger, so a
 * successful transit cannot immediately ping-pong or place a standing capsule
 * into decorative geometry.
 */
export const RELAY_PORTAL_ENDPOINTS = Object.freeze([
  Object.freeze({
    id: 'relay_service_gate',
    partnerId: 'relay_overlook_gate',
    triggerCenterMm: point(0, -2_000, -20_300),
    triggerHalfExtentsMm: point(1_400, 1_400, 500),
    exitFeetMm: point(0, 3_930, 17_000),
    exitYawMilliDegrees: 0,
    presentation: Object.freeze({
      visualCenterMm: point(0, -1_250, -20_300),
      colorRole: 'cyan_service',
      departureAudioHook: 'relay.portal.service.departure',
      arrivalAudioHook: 'relay.portal.service.arrival',
      departureVfxHook: 'relay.portal.service.energy_departure',
      arrivalVfxHook: 'relay.portal.service.energy_arrival',
    }),
  } satisfies RelayPortalEndpoint),
  Object.freeze({
    id: 'relay_overlook_gate',
    partnerId: 'relay_service_gate',
    triggerCenterMm: point(0, 4_800, 20_500),
    triggerHalfExtentsMm: point(1_400, 1_100, 500),
    exitFeetMm: point(0, -3_000, -17_000),
    exitYawMilliDegrees: 180_000,
    presentation: Object.freeze({
      visualCenterMm: point(0, 5_300, 20_500),
      colorRole: 'amber_overlook',
      departureAudioHook: 'relay.portal.overlook.departure',
      arrivalAudioHook: 'relay.portal.overlook.arrival',
      departureVfxHook: 'relay.portal.overlook.energy_departure',
      arrivalVfxHook: 'relay.portal.overlook.energy_arrival',
    }),
  } satisfies RelayPortalEndpoint),
] as const);

export const RELAY_PORTAL_PRESENTATION_DEFINITIONS = Object.freeze(
  RELAY_PORTAL_ENDPOINTS.map((endpoint, index) => Object.freeze({
    id: endpoint.id,
    position: Object.freeze([
      endpoint.presentation.visualCenterMm.x / 1_000,
      endpoint.presentation.visualCenterMm.y / 1_000,
      -endpoint.presentation.visualCenterMm.z / 1_000,
    ] as const),
    color: endpoint.presentation.colorRole === 'cyan_service'
      ? 0x6ff3ff
      : 0xffa53b,
    accent: endpoint.presentation.colorRole === 'cyan_service'
      ? 0xefffff
      : 0xffe2a6,
    phase: index === 0 ? 0 : Math.PI,
  })),
);

type RelayAuthorityIdentity = typeof RELAY_AUTHORITY_IDENTITY;

function isRelayIdentity(identity: RelayAuthorityIdentity): boolean {
  return identity.mapId === RELAY_AUTHORITY_IDENTITY.mapId
    && identity.mapRevision === RELAY_AUTHORITY_IDENTITY.mapRevision
    && identity.packageDigest === RELAY_AUTHORITY_IDENTITY.packageDigest
    && identity.fixtureId === RELAY_AUTHORITY_IDENTITY.fixtureId
    && identity.fixtureHash === RELAY_AUTHORITY_IDENTITY.fixtureHash
    && identity.colliderCardinality === RELAY_AUTHORITY_IDENTITY.colliderCardinality;
}

function config(
  authorityIdentity: RelayAuthorityIdentity,
): LinkedWorldPortalAuthorityConfig<RelayPortalEndpointId> {
  if (!isRelayIdentity(authorityIdentity)) {
    throw new Error('RELAY_PORTAL_AUTHORITY_IDENTITY_MISMATCH');
  }
  return Object.freeze({
    capabilityId: RELAY_PORTAL_CAPABILITY_ID,
    fixtureHash: authorityIdentity.fixtureHash,
    inputMismatchError: 'RELAY_PORTAL_AUTHORITY_INPUT_MISMATCH',
    queryMismatchError: 'RELAY_PORTAL_QUERY_SCHEMA_MISMATCH',
    endpoints: RELAY_PORTAL_ENDPOINTS,
  });
}

export function advanceRelayPortalAuthority(
  input: AuthorityWorldPortalAdvanceInputV1,
  queries: MovementQueryPort,
  authorityIdentity: RelayAuthorityIdentity = RELAY_AUTHORITY_IDENTITY,
): AuthorityWorldPortalAdvanceResultV1 {
  return advanceLinkedWorldPortalAuthority(input, queries, config(authorityIdentity));
}

export function createRelayPortalAuthorityPort(
  queries: MovementQueryPort,
  authorityIdentity: RelayAuthorityIdentity = RELAY_AUTHORITY_IDENTITY,
): AuthorityWorldPortalPort {
  return createLinkedWorldPortalAuthorityPort(queries, config(authorityIdentity));
}
