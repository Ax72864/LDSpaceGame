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

Expect output to include the local URL, Edge path, zero console errors, and `SUMMARY: PASS`. This does not replace full interaction checks; after `Game/` changes, also follow [Docs/smoke-checklist.md](Docs/smoke-checklist.md).

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
