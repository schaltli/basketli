# Performance-Messungen

Konfiguration: 150 × 100 × 80 mm, Defaults, Wandstil „Geflecht“.
Gemessen wird `build()` (Geometrie und Mesh-Export), ohne die Ladezeit des WASM-Moduls.

## 2026-11-01 – T8 (erster Geflecht-Prototyp)

Node 22, Windows 11 (Vitest, zweiter Lauf):

| Variante                | Vorschau | Dreiecke | Export   | Dreiecke |
| ----------------------- | -------- | -------- | -------- | -------- |
| Rohr geschlossen        | 661 ms   | 157 198  | 2 242 ms | 796 504  |
| Rohr offen (Spalt 4 mm) | 218 ms   | 95 294   | 1 273 ms | 481 626  |
| Band geschlossen        | 136 ms   | 44 478   | 610 ms   | 190 726  |

Browser (Chromium, Web Worker): Rohr geschlossen, Vorschau 550 ms.

Ziele aus dem Spec (7a): Vorschau < 1 s ✅, Export < 5 s ✅.

Beobachtung: Ein binäres STL des Exports „Rohr geschlossen“ wäre etwa 40 MB groß (796 504 × 50 Byte).
In T22 prüfen, ob 14 statt 20 Abtastpunkte pro Stake optisch genügen.

Screenshots: `docs/img/weave-cane-closed.png`, `docs/img/weave-band-open.png`.
