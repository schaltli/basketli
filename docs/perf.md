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

## 2026-11-01 – T8R (Relief-Wand, ersetzt T8)

Node 22, Windows 11, 150 × 100 × 80 mm, Defaults. Der Export wird mit `simplify(0,02 mm)` vereinfacht.

| Variante                | Vorschau | Dreiecke | Export (inkl. simplify) | Dreiecke |
| ----------------------- | -------- | -------- | ----------------------- | -------- |
| Rohr geschlossen        | 218 ms   | 257 864  | ≈ 2,1 s                 | 385 918  |
| Rohr offen (Spalt 4 mm) | 191 ms   | 241 248  | ≈ 1,9 s                 | 358 920  |
| Band geschlossen        | 220 ms   | 257 880  | ≈ 1,9 s                 | 151 106  |

Das Höhenfeld selbst kostet 12–35 ms; den Rest brauchen Mesh-Import, die Union mit dem Boden und die Fenster-Subtraktion.
Druckbarkeit (Schicht-Test, 0,2 mm): bei allen Varianten 0,000 mm² ohne Auflage, auch nach `simplify`.
Ziele 7a: Vorschau < 1 s ✅, Export < 5 s ✅. STL „Rohr geschlossen“ ≈ 19 MB.

Screenshots: `docs/img/weave-*.png`.

## 2026-11-01 – T8B (Geflecht v3: flache Bänder, runde Staken, Kordelrand)

Node 22, 150 × 100 × 80 mm, Defaults:

| Variante                | Vorschau | Dreiecke | Export (inkl. simplify) | Dreiecke |
| ----------------------- | -------- | -------- | ----------------------- | -------- |
| Rohr geschlossen        | 128 ms   | 194 234  | 2,5 s                   | 197 928  |
| Rohr offen (Spalt 4 mm) | 130 ms   | 177 230  | 2,6 s                   | 183 838  |
| Band geschlossen        | 98 ms    | 154 056  | 2,2 s                   | 180 162  |

Im Browser (Worker) liegt die Vorschau bei 0,6–0,9 s. STL „Rohr geschlossen“ ≈ 10 MB.

Druckbarkeit der Testdrucke (80 × 60 × 50 mm, Export): bei allen vier Varianten 0,00 mm² Überhang, längste Brücke 10–13,5 mm (Grenze 15 mm).
Zum Vergleich mit derselben Prüfung: Referenz-STL des Nutzers 102 mm² Überhang (Kordelrand) und Brücken bis 9 mm; Prototyp 1 49 mm² (dünne, frei hängende Linien).
