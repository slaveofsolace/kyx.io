# Required 2/4/8-player human playtest plan and evidence contract

Status: plan complete; **all human sessions remain open**.

No session described here has been executed or accepted. This is the required
plan for promotion review.

## Frozen-session preconditions

- Record the exact branch, commit, package digest, fixture hash, build command,
  browser/runtime version, port, hardware, resolution, and settings.
- Use the explicit Revision 3 route or an approved Revision 3 playtest build;
  do not replace the shipping/default practice map.
- Confirm the identity matches this packet before every session.
- Capture continuous video, route/spawn telemetry, performance data, and
  observer notes.
- Stop and mark the run invalid if the identity changes mid-session.

## Two-player duel

Purpose: isolate sniper-shotgun counterplay and spawn-to-first-contact timing.

- Two humans; six rounds minimum.
- Swap west/east starts after each round pair.
- Swap sniper/shotgun roles after each round pair.
- Include at least two mid-first rounds and two intentional side-route rounds
  per player.
- Record first sight, first shot, time-to-cover, time-to-breach, death
  location, spawn used, and whether the losing player had a readable choice.

Required evidence:

- full video with round markers;
- both players' route traces and spawn IDs;
- death/first-damage locations;
- short per-round fun/fairness/readability rating;
- signed observer result for symmetry and unavoidable-damage findings.

## Four-player 2v2

Purpose: validate crossfire, trade routes, team spawn separation, and mid
rotation.

- Four humans; two teams; at least 15 minutes or three score-limited rounds.
- Swap team sides at least once.
- Require both teams to run one sniper/shotgun pairing for a complete round.
- Include coordinated double-breach, split-route, and mid-hold attempts.

Required evidence:

- full match video and score timeline;
- per-player route and spawn records;
- kill/death/trade locations;
- crossfire and blocked-rotation annotations;
- observer notes on callouts, silhouette/readability, and cover use;
- named player questionnaire and team-side signoff.

## Eight-player 4v4

Purpose: expose congestion, spawn pressure, simultaneous sightlines, and
performance behavior at intended high occupancy.

- Eight humans; two teams; at least 20 minutes or three score-limited rounds.
- Swap sides once.
- Force at least one round with two sniper-shotgun pairs per team.
- Exercise all spawn families, both breach routes, side rotations, vertical
  transitions, kill volumes, and recovery areas.

Required evidence:

- continuous observer and representative player video;
- all spawn selections, repeat-spawn sequences, and spawn-to-damage times;
- route occupancy/heatmap data;
- kill/death locations and weapon pairing;
- hitch/frame-time trace with p50, p95, p99, maximum, and hitch count;
- CPU/GPU, resolution, graphics settings, render calls, and triangle count;
- written spawn-pressure, congestion, and fun/readability decisions.

## Evidence acceptance contract

Every tier must demonstrate:

- no player spawn embedded in collision;
- no terminal snag on required representative routes;
- no unintended map escape;
- kill/recovery volumes behave as specified;
- both sides have usable cover-to-cover choices;
- no repeated unavoidable spawn-to-sniper death pattern;
- both sniper lanes have a practical close-range counter-route;
- no single power position invalidates the symmetric alternative;
- named performance data is attached for the 8-player run;
- every participant and the designated human reviewer are identified.

The following artifacts are mandatory:

- source-frozen build/identity record;
- raw videos;
- raw route/spawn/performance telemetry;
- annotated issue list with severity and reproduction;
- per-player questionnaire;
- reviewer decision: accept, revise, or reject;
- signatures and timestamp.

## Signoff record

| Tier | Date/build | Evidence path | Reviewer | Decision |
| --- | --- | --- | --- | --- |
| 2-player | Not run | Not present | Unassigned | Open |
| 4-player | Not run | Not present | Unassigned | Open |
| 8-player | Not run | Not present | Unassigned | Open |

G5 cannot pass while any row remains open.
