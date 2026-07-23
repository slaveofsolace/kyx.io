# P5.8D Node parity red run 01

- Command: focused `p58dReplayParity.test.ts`
- Result: **1 failed / 1 total** before simulation
- The fixture enabled TDM without the exact P5.5 ability-resource capability, so `AuthoritativeRoom` rejected construction with its intended fail-closed invariant.
- No parity claim was made from this run.
- This red run is retained; the fixture was corrected to the complete revision-3 capability set.
