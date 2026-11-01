# Umsetzungsplan: basketli

> Grundlage: `SPEC.md` (freigegeben 2026-11-01) · Aufgaben im Detail: `tasks/todo.md`

## Überblick

basketli ist ein Korb-Generator, der vollständig im Browser läuft (Vite, React, TypeScript, three.js, manifold-3d). Wir bauen ihn in **vertikalen Scheiben**: Schon nach Phase 1 zeigt die App einen echten Korb in 3D. Das **Geflecht** trägt das größte Risiko: Aussehen, Druckbarkeit und Rechenzeit sind ungewiss. Deshalb kommt es **direkt danach als Prototyp**, mit STL-Export für einen Testdruck. Erst wenn das Geflecht abgenommen ist, folgen Stapeln, Lochmuster, die Bedienung nach Bento3D-Vorbild, Griffmulden und Trennwände.

## Architekturentscheidungen

| Entscheidung                                                                                                                                                          | Begründung                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Geometrie in `src/geometry` als **pure Funktionen** `params → Mesh`, ohne React und DOM                                                                               | In Node mit Vitest testbar und im Worker wiederverwendbar                                                                               |
| **manifold-3d** für CSG (Vereinigen, Ausschneiden); Rohr- und Band-Stränge als **selbst erzeugtes, geschlossenes Mesh**, das per `new Manifold(mesh)` importiert wird | manifold-3d kennt keinen Sweep entlang beliebiger Pfade. Ein eigener Sweep bringt volle Kontrolle über den Querschnitt (Rohr oder Band) |
| Geometrie läuft im **Web Worker**; Übergabe als `Float32Array`/`Uint32Array` (transferable)                                                                           | Die Oberfläche friert nicht ein (Spec: Erfolgskriterium 2)                                                                              |
| **Qualitätsstufen** `preview` / `export` als Parameter von `build()`                                                                                                  | Geflecht in der Vorschau unter 1 s, Export fein in unter 5 s                                                                            |
| Ein zentraler Typ `BasketParams` plus `clampParams()`; die Oberfläche zeigt nur Werte an, die `clampParams` durchlaufen haben                                         | Ungültige Kombinationen können nie die Geometrie erreichen                                                                              |
| URL-Format: versioniert (`?v=1&…`)                                                                                                                                    | Spätere Änderungen brechen geteilte Links nicht unbemerkt                                                                               |
| Export-Writer (STL binär, 3MF via fflate) arbeiten nur auf `{positions, indices}`                                                                                     | Unabhängig von three.js und manifold, einfach testbar                                                                                   |
| Zustand mit zustand; nur die Parameter liegen im Store, Mesh-Daten liegen außerhalb des React-States                                                                  | Vermeidet unnötiges Neurendern bei großen Meshes                                                                                        |

## Abhängigkeiten

```
T1 Setup
 └─ T2 Params ──────────────┬───────────────────────────────┐
     └─ T3 Grundwanne        │                               │
         ├─ T4 Worker+Viewer │                               │
         │   └─ T9 STL+DL    │                               │
         ├─ T5 Weave-Layout ─┴─ T6 Strangpfad ─ T7 Sweep ─ T8 Geflechtkorb
         │                                                    │
         ├─ T10 Stapeln ◄─────────────────────────────────────┤
         ├─ T12/T13 Lochmuster                                │
         │                                                    │
T2 ─ T14 Store+URL ─ T15 Param-Dialog ─ T16 Maß-Labels ─ T17 Ansichten
T3/T8 ─ T18 Griffmulden
T3/T8 ─ T19 Trennwände (Geometrie) ─ T20 Raster-Editor (UI, braucht T14)
T9 ─ T11 3MF
alles ─ T21 E2E ─ T22 Performance/Snapshots/Coverage ─ T23 Release-Check
```

## Phasen und Aufgaben

### Phase 1 – Fundament und Durchstich

- [x] T1: Projekt-Setup mit Toolchain
- [x] T2: Parameter-Modell (Typen, Defaults, Grenzen, Clamping)
- [x] T3: Grundwanne als manifold-Geometrie
- [x] T4: Worker und 3D-Viewer zeigen die Grundwanne

**Checkpoint A:** `npm run typecheck && npm run lint && npm test && npm run build` laufen grün; im Browser ist ein Korb zu sehen.

### Phase 2 – Geflecht-Prototyp (Risiko zuerst)

- [x] T5: Geflecht-Layout (Staken, gerade Anzahl, Reihenaufteilung)
- [x] T6: Strangpfade (Über/Unter, Phasenversatz)
- [x] T7: Sweep-Mesh für Rohr und Band
- [x] T8: Geflechtkorb zusammensetzen und in der Vorschau anzeigen
- [x] T9: STL-Export und Download-Button

**Checkpoint B – Go/No-Go Geflecht:** Du druckst 4 Testkörbe (Rohr/Band × geschlossen/offen). Abgenommen ist das Geflecht, wenn es ohne Stützmaterial druckbar ist, das Über/Unter-Bild klar erkennbar ist und die Rechenzeit unter 1 s (Vorschau) bzw. unter 5 s (Export) bleibt. Bei No-Go passen wir Spec und Ansatz an, bevor die übrige Oberfläche darauf aufbaut.

### Phase 3 – Korb-Kern

- [ ] T10: Stapel-Geometrie (Fuß, Fase, Spiel) für alle Wandstile
- [ ] T11: 3MF-Export und Download-Menü
- [ ] T12: Wandflächen-Modell und Wabenmuster
- [ ] T13: Schlitz- und Rautenmuster

**Checkpoint C:** Alle Wandstile erzeugen manifold-Meshes und lassen sich stapeln; ein gedrucktes Stapelpaar ergibt 2·H ± 0,5 mm.

### Phase 4 – Bedienung nach Bento3D-Vorbild

- [ ] T14: Store und URL-Serialisierung
- [ ] T15: Toolbar und Parameter-Dialog (inkl. Geflecht-Abschnitt, Hinweise beim Begrenzen)
- [ ] T16: Maß-Labels am Modell (Klick, Eingabe, Slider)
- [ ] T17: Ansichten Einzeln / Stapel / Explosion

**Checkpoint D:** Der komplette Ablauf vom Start bis zum Download geht nur mit der Maus. Ein geteilter Link stellt die Konfiguration 1:1 wieder her. Du prüfst die Bedienung.

### Phase 5 – Ausstattung

- [ ] T18: Griffmulden (massive Wand und Geflecht mit Rahmen)
- [ ] T19: Trennwände (Geometrie)
- [ ] T20: Raster-Editor (Draufsicht, „+“, verschieben, löschen)

**Checkpoint E:** Alle Funktionen aus dem Spec (v1) sind vorhanden; alle Kombinationen ergeben manifold-Meshes.

### Phase 6 – Absicherung und Release

- [ ] T21: E2E-Hauptablauf (Playwright)
- [ ] T22: Performance-Feinschliff, Referenz-Snapshots, Coverage ≥ 90 %
- [ ] T23: Release-Check (Slicer-Prüfung, Drucktests, README)

**Checkpoint F:** Alle Erfolgskriterien aus dem Spec sind erfüllt; Freigabe durch dich.

## Parallelisierbar

- Nach T4: Der Strang **T5–T8** (Geflecht) und der Strang **T14** (Store/URL) sind unabhängig voneinander.
- Nach Checkpoint B: **T10**, **T11** und **T12/T13** sind unabhängig.
- **T18** und **T19** sind unabhängig; T20 braucht T19 und T15.

## Risiken und Gegenmaßnahmen

| Risiko                                                                  | Auswirkung | Gegenmaßnahme                                                                                                                        |
| ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Geflecht sieht nicht „echt“ aus (zu flach, zu regelmäßig)               | Hoch       | Früher Prototyp (Phase 2) und Testdruck bei Checkpoint B; Amplitude und Querschnitt sind Parameter und lassen sich schnell iterieren |
| Rechenzeit beim Geflecht zu hoch (viele Stränge, große Vereinigungen)   | Hoch       | Qualitätsstufen; jeden Strang einzeln erzeugen und dann `Manifold.union(array)` in einem Schritt (Batch); Zeitmessung schon in T8    |
| Eigenes Sweep-Mesh nicht manifold (Selbstüberschneidung in engen Ecken) | Mittel     | Mindest-Eckenradius 10 mm; Amplitude < Eckenradius; Test auf Manifold-Status für Grenzwerte                                          |
| Überhänge im offenen Geflecht nicht druckbar                            | Mittel     | Querschnitt unten angefast; Spalt max. 10 mm; Testdruck bei Checkpoint B                                                             |
| manifold-3d (WASM) in Vitest/Node oder im Worker schwierig einzubinden  | Mittel     | Gleich in T3 geprüft (Spike); bei Problemen Ausweg über `vite-plugin-wasm` bzw. Laden per URL                                        |
| Stapelmaß weicht real ab (Druckertoleranz)                              | Mittel     | Stapelspiel als Parameter; Drucktest bei Checkpoint C                                                                                |
| Bento3D-Anlehnung zu nah am Original                                    | Niedrig    | Nur das Bedienmuster; eigene Gestaltung, eigene Texte und Icons                                                                      |

## Offene Punkte

- Hosting und Lizenz: Entscheidung vor T23 (siehe SPEC, Open Questions 3 und 7).
- Das Verzeichnis ist noch **kein Git-Repo**. T1 führt `git init` aus (lokal, ohne Remote).
