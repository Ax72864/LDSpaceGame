# LDSpaceGame

## Stage A HTML5 Prototype

### Minimal validation (L0)

From the repo root in PowerShell:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/validate-static.ps1
```

Expect `SUMMARY: PASS`.

### Console smoke (L0.5, automated)

Captures Console errors and runtime exceptions via Edge headless + CDP (no npm install):

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-browser-console.ps1
```

Or directly:

```powershell
node Scripts/verify-browser-console.mjs
```

Expect output to include the local URL, Edge path, zero console errors, and `SUMMARY: PASS`.

### Gameplay smoke (L2, automated)

Drives golden-path clicks on `#game` via Edge headless + CDP (no npm install). Covers move, frame/mining build, metal growth, thruster speed (~42→63), raid warning/wave, and restart reset. Does **not** assert full victory/defeat loops in v1.

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-gameplay-smoke.ps1
```

Or directly:

```powershell
node Scripts/verify-gameplay-smoke.mjs
```

After `Game/` changes, run L0 → L0.5 → L2 when possible; also run L2.5 when changes touch victory, defeat, enemy waves, or restart. See [Docs/smoke-checklist.md](Docs/smoke-checklist.md) for manual gaps.

### Outcome smoke (L2.5, automated)

Independent script for victory/defeat settlement and post-outcome restart (does not extend the L2 golden path):

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File Scripts/verify-outcome-smoke.ps1
```

Or directly:

```powershell
node Scripts/verify-outcome-smoke.mjs
```

Covers page load, Console/Runtime cleanliness, victory overlay + restart, fresh-game defeat overlay + restart. Expect `SUMMARY: PASS`.

Run locally from PowerShell:

```powershell
npx serve Game
```

Then open the printed local URL in a browser.

Controls (Stage B):

- Click green adjacent slots to build frames (10 metal each).
- Click a frame to open the build menu; click a facility option twice to place mining, turret, or thruster.
- Click empty space to move the station toward the cursor.
- Move near gray asteroids so active mining stations produce metal.
- Build a second facility to enter raid warning, then build a fourth facility to trigger the enemy wave; turrets auto-fire and active thrusters increase movement speed.
- Win when all enemies are destroyed; lose if core HP reaches 0. Use **重开** to reset.

Run: `npx serve Game` then open the local URL.
