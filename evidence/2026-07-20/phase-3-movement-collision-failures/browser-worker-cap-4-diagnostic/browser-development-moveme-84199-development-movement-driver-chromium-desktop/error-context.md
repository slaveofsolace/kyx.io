# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browser\development-movement-driver.spec.ts >> default launch does not load or expose the development movement driver
- Location: tests\browser\development-movement-driver.spec.ts:121:1

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic "KYX.IO offline practice game viewport" [ref=e3]
  - banner [ref=e4]:
    - generic "KYX.IO" [ref=e5]
    - generic [ref=e6]: LOCAL BUILD
    - navigation "Practice menu" [ref=e7]:
      - button "OFFLINE PRACTICE" [ref=e8] [cursor=pointer]
      - button "LOADOUT" [ref=e9] [cursor=pointer]
      - button "SETTINGS" [ref=e10] [cursor=pointer]
      - button "ONLINE MATCH — NOT AVAILABLE" [disabled] [ref=e11]
  - complementary "Local profile" [ref=e12]:
    - generic [ref=e13]: LOCAL GUEST PROFILE
    - generic [ref=e14]: Recruit
    - generic [ref=e15]: SAVED ON THIS DEVICE
  - main:
    - region "IRON BASTION":
      - paragraph: OFFLINE PRACTICE
      - heading "IRON BASTION" [level=2]
      - generic "Live map preview":
        - generic: MAP PREVIEW
      - paragraph: 1 LOCAL PLAYER / 7 BOTS
      - button "START OFFLINE PRACTICE" [ref=e16] [cursor=pointer]
      - paragraph: Runs entirely on this device. Nothing shown here represents online players or shared progression.
  - text: ⏱
  - status: KYX.IO 1.0.0-phase1 · LOCAL DEV · OFFLINE PRACTICE
```