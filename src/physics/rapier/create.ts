import { initializeRapierRuntime } from './runtime';
import { RapierMovementWorld } from './world';

/** Browser/Node factory kept outside the Worker-safe world implementation. */
export async function createRapierMovementWorld(input: unknown): Promise<RapierMovementWorld> {
  const runtime = await initializeRapierRuntime();
  return RapierMovementWorld.createWithRuntime(input, runtime);
}
