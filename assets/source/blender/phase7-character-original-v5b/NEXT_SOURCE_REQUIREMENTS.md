# KYX Vanguard next-source requirements after v5/v5b rejection

The next character source must not be another scripted primitive/section-loft refinement of v5b. It needs a sculpt-retopo production pipeline.

## 1. Provenance-safe source

- Preferred: project-original high-resolution sculpt authored from the pinned KYX Vanguard model sheet.
- Allowed alternative: a high-quality original base mesh only when the exact author, license, redistribution/runtime rights, source URL or contract, and immutable source hash are recorded before modification.
- Forbidden: `public/soldier.glb`, derivatives of the provenance-blocked v4 diagnostic, ripped/game-extracted assets, or unverifiable marketplace downloads.

## 2. Sculpt and design

- Adult athletic anatomy with clear clavicle, deltoid, elbow, wrist, pelvis, patella, calf, ankle, heel, palm, and digit landmarks.
- Tailored technical-cloth garment with believable compression, folds, seam placement, and joint tension.
- Limited ceramic armor designed as fitted layered construction with deformation gaps, not floating plates.
- Helmet resolved into crown panels, brow, visor seal, cheeks, chin, rear shell, and flexible neck interface.
- Gloves with shaped palm/thumb web, knuckles, and five readable digits.
- Boots with outsole, tread, heel counter, toe volume, instep retention, ankle articulation, and shin interface.
- One authored Auto Rifle with mechanical negative space, stock/receiver/grip/magazine/handguard/barrel continuity, and an accessible trigger/guard.

## 3. Production topology and materials

- Retopologized deformation loops at shoulders, elbows, wrists, hips, knees, ankles, thumb web, and fingers.
- Separate rigid armor only where its deformation policy is explicit.
- Non-overlapping authored UVs and consistent measured texel density.
- Final project-original PBR texture set with cloth, ceramic, rubber, and metal response; no generator-default look.
- LOD0/LOD1/LOD2 authored and reviewed for silhouette retention.

## 4. Rig, weights, and animation

- Canonical runtime skeleton plus first-person arms and rifle sockets.
- Production weights reviewed through extreme shoulder, elbow, wrist, hip, knee, ankle, and finger poses.
- Required locomotion/combat clip matrix, including idle, move, sprint, jump/fall/land, slide/crouch, equip, reload, fire, ADS, ability, hit, death, and respawn.
- Right index visibly inside the guard and on the trigger; remaining right digits wrap the pistol grip.
- Left palm and all support digits visibly wrap a forward handguard/foregrip with no float, clipping, or open robotic pose.

## 5. Evidence before runtime promotion

- Neutral studio hero, front, side, back, and grayscale plates.
- Dedicated trigger, pistol-grip, support-hand, stock/shoulder, boot-floor, armor-gap, and extreme-deformation close-ups.
- Human visual approval recorded explicitly.
- GLB structure, hashes, skins, animation names, and manifests are supporting evidence only.
- Runtime 2/4/8-player LOD, outline, material, contact-shadow, clipping, and performance captures are still required for G6.
