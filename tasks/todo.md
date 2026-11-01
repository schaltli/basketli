# Aufgabenliste: basketli

> Plan: `tasks/plan.md` · Spec: `SPEC.md`
> Für jede Aufgabe gilt die Definition of Done: `npm run typecheck && npm run lint && npm test` grün und ein Commit pro Aufgabe.
> Geometrie und Export werden testgetrieben (TDD) gebaut.

---

## Phase 1 – Fundament und Durchstich

### - [x] T1: Projekt-Setup mit Toolchain

**Beschreibung:** Das Vite-Projekt (React + TS strict) entsteht, mit ESLint, Prettier, Vitest, Playwright, zustand, three, @react-three/fiber, @react-three/drei, manifold-3d und fflate (Versionen gepinnt). Alle npm-Skripte aus dem Spec unter „Commands“ sind angelegt. Dazu `git init` und `.gitignore`.
**Akzeptanz:**

- [ ] Alle Befehle aus dem Spec unter „Commands“ existieren und laufen (ein Smoke-Unit-Test, ein Smoke-E2E-Test).
- [ ] Die Ordnerstruktur entspricht dem Spec; eine ESLint-Regel verbietet Importe aus `src/ui` in `src/geometry` und `src/export`.
      **Prüfung:** `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`
      **Abhängig von:** –
      **Dateien:** `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts`, `playwright.config.ts`, `src/main.tsx`, `src/App.tsx`
      **Umfang:** M

### - [x] T2: Parameter-Modell

**Beschreibung:** `BasketParams` mit allen Parametern aus dem Spec (inkl. Geflecht: Material Rohr/Band, Materialhöhe, Materialdicke, Stakenabstand, Stakendurchmesser, Reihenabstand), dazu `DEFAULTS`, `LIMITS` und `clampParams()`. `clampParams()` gibt die korrigierten Parameter zurück und eine Liste mit Hinweisen, was korrigiert wurde. Die Material-Defaults hängen vom Material ab (Rohr 6/2,4 mm, Band 15/1,6 mm).
**Akzeptanz:**

- [ ] Jeder Wert außerhalb seines Bereichs wird auf die Grenze gesetzt, und es entsteht ein Hinweis.
- [ ] Abhängige Regeln greifen: Eckenradius ≥ 10 mm im Geflecht-Modus, Eckenradius ≤ min(B,T)/2, Randband plus Griff passen in die Höhe.
- [ ] Ein Wechsel des Materials setzt die Material-Defaults, sofern der Nutzer sie nicht selbst geändert hat.
      **Prüfung:** `npx vitest run tests/geometry/params.test.ts`
      **Abhängig von:** T1
      **Dateien:** `src/geometry/params.ts`, `tests/geometry/params.test.ts`
      **Umfang:** S

### - [x] T3: Grundwanne als manifold-Geometrie

**Beschreibung:** Eine glatte Wanne aus abgerundetem Rechteck mit Wandstärke und Bodenstärke, erzeugt mit manifold-3d, Ausgabe `{positions, indices}`. Gleichzeitig ein Spike: manifold-3d läuft in Vitest (Node). Die Funktion `build(params, quality)` ist der Einstiegspunkt.
**Akzeptanz:**

- [ ] Das Mesh ist manifold; die Bounding Box entspricht B×T×H ± 0,01 mm.
- [ ] Das Volumen weicht um höchstens 1 % vom analytisch berechneten Wert ab.
      **Prüfung:** `npx vitest run tests/geometry/basket.test.ts`
      **Abhängig von:** T2
      **Dateien:** `src/geometry/basket.ts`, `src/geometry/build.ts`, `src/geometry/manifold.ts` (WASM-Init), `tests/geometry/basket.test.ts`
      **Umfang:** M

### - [x] T4: Worker und 3D-Viewer zeigen die Grundwanne

**Beschreibung:** Ein Web Worker ruft `build()` auf und überträgt die Buffer als transferable. Der Viewer (r3f) bekommt Kamera, Orbit-Steuerung, Licht und Boden-Raster. Neue Berechnungen werden entprellt (150 ms); eine veraltete Berechnung wird verworfen, sobald eine neuere fertig ist.
**Akzeptanz:**

- [ ] Beim Start ist der Default-Korb zu sehen (unter 2 s, Desktop).
- [ ] Während der Berechnung bleibt die Kamera flüssig drehbar.
      **Prüfung:** `npm run dev`, Sichtprüfung; `npm run e2e` (Canvas sichtbar, keine Fehler in der Konsole)
      **Abhängig von:** T3
      **Dateien:** `src/worker/geometry.worker.ts`, `src/worker/client.ts`, `src/ui/viewer/Viewer.tsx`, `src/App.tsx`, `e2e/smoke.spec.ts`
      **Umfang:** M

### Checkpoint A

- [ ] typecheck, lint, test, build und e2e grün
- [ ] Korb im Browser sichtbar
- [ ] Kurzer Review mit dir

---

## Phase 2 – Geflecht-Prototyp

### - [x] T5: Geflecht-Layout

**Beschreibung:** Eine reine Rechenfunktion `weaveLayout(params)` liefert den Umrisspfad (abgerundetes Rechteck auf der Wandmitte), die Stakenpositionen (Bogenlänge, Punkt, Normale) und die Reihen (z-Mitte, Höhe), außerdem die resultierende Höhe von Fußband und Randwulst.
**Akzeptanz:**

- [ ] Die Stakenzahl ist immer ungerade; gewählt wird die ungerade Zahl mit dem Abstand am nächsten zum Zielwert; bei den Defaults weicht er höchstens ±15 % ab.
- [ ] Reihenanzahl n = ⌊(nutzbare Höhe − Spalt) / (Materialhöhe + Spalt)⌋ mit n + 1 Spalten; der Rest geht je zur Hälfte an Fußband und Randwulst. Getestet mit Rohr und Band bei 3, 15 und 40 mm.
      **Prüfung:** `npx vitest run tests/geometry/weave/layout.test.ts`
      **Abhängig von:** T2
      **Dateien:** `src/geometry/weave/layout.ts`, `src/geometry/weave/outline.ts`, `tests/geometry/weave/layout.test.ts`
      **Umfang:** S

### - [ ] T6: Strangpfade

**Beschreibung:** Aus Layout und Reihenindex entsteht der geschlossene 3D-Pfad eines Strangs: Umriss plus eine sinusförmige Verschiebung entlang der Normalen. Das Maximum bzw. Minimum liegt genau an den Staken. Ungerade Reihen sind um eine Stake versetzt. Die Abtastdichte richtet sich nach der Qualitätsstufe.
**Akzeptanz:**

- [ ] An den Staken wechselt das Vorzeichen der Verschiebung von Stake zu Stake (auch über die Naht des geschlossenen Pfads hinweg).
- [ ] Benachbarte Reihen haben an derselben Stake entgegengesetzte Vorzeichen.
- [ ] Amplitude = Stakendurchmesser/2 + Materialdicke/2 − FUSE (0,3 mm Überlappung).
      **Prüfung:** `npx vitest run tests/geometry/weave/path.test.ts`
      **Abhängig von:** T5
      **Dateien:** `src/geometry/weave/path.ts`, `tests/geometry/weave/path.test.ts`
      **Umfang:** S

### - [ ] T7: Sweep-Mesh für Rohr und Band

**Beschreibung:** Ein Querschnitt-Profil wird entlang eines geschlossenen Pfads geführt und ergibt ein geschlossenes Rohr-Mesh mit stabiler Ausrichtung (z bleibt oben, keine Verdrehung). Zwei Profile: Rohr (flach-oval) und Band (Rechteck mit gerundeten Kanten), beide mit Unterkante für ≤ 45° Überhang. Das Mesh wird als Manifold importiert.
**Akzeptanz:**

- [ ] Beide Profile ergeben bei Default- und Grenzwerten einen manifold-Körper (Status `NoError`).
- [ ] Der Querschnitt entspricht Materialhöhe × Materialdicke ± 0,05 mm.
- [ ] Am Profil gibt es keinen Unterseitenwinkel unter 45° zur Horizontalen.
      **Prüfung:** `npx vitest run tests/geometry/weave/sweep.test.ts`
      **Abhängig von:** T6, T3
      **Dateien:** `src/geometry/weave/profile.ts`, `src/geometry/weave/sweep.ts`, `tests/geometry/weave/sweep.test.ts`
      **Umfang:** M

### - [ ] T8: Geflechtkorb zusammensetzen

**Beschreibung:** `build()` erzeugt im Wandstil „Geflecht“ den Korb aus massivem Boden, Fußband, Staken, allen Strängen und einem gerundeten Randwulst, vereinigt in einem Batch-Union. In der Vorschau bekommt der Geflecht-Modus ein Rattan-Material. Dazu eine provisorische Umschaltung „massiv/Geflecht“ und „Rohr/Band“ in der Oberfläche (wird in T15 ersetzt). Zeitmessung im Worker.
**Akzeptanz:**

- [ ] Der Körper ist manifold und besteht aus genau einer zusammenhängenden Komponente; die Bounding Box entspricht den Außenmaßen ± 0,05 mm.
- [ ] Vorschau unter 1 s und Export-Qualität unter 5 s bei 150×100×80 mm mit Defaults (gemessen und in `docs/perf.md` notiert).
- [ ] Das Über/Unter-Bild ist innen und außen sichtbar (Screenshot in `docs/`).
      **Prüfung:** `npx vitest run tests/geometry/weave/build.test.ts`; `npm run dev` zur Sichtprüfung
      **Abhängig von:** T7, T4
      **Dateien:** `src/geometry/weave/index.ts`, `src/geometry/build.ts`, `src/ui/viewer/materials.ts`, `tests/geometry/weave/build.test.ts`, `docs/perf.md`
      **Umfang:** M

### - [ ] T9: STL-Export und Download

**Beschreibung:** Ein binärer STL-Writer (Mesh → Uint8Array) und ein Download-Button, der den Export in Export-Qualität im Worker erzeugt. Dateiname: `basketli_<B>x<T>x<H>.stl`.
**Akzeptanz:**

- [ ] Byte-Länge = 84 + 50·n; Dreieckszahl im Header stimmt; Normalen zeigen nach außen.
- [ ] Die heruntergeladene Datei öffnet sich in PrusaSlicer bzw. Bambu Studio ohne Reparaturhinweis.
      **Prüfung:** `npx vitest run tests/export/stl.test.ts`; manuell im Slicer
      **Abhängig von:** T4 (für den Geflecht-Testdruck auch T8)
      **Dateien:** `src/export/stl.ts`, `src/export/download.ts`, `src/ui/controls/DownloadButton.tsx`, `tests/export/stl.test.ts`
      **Umfang:** S

### Checkpoint B – Go/No-Go Geflecht

- [ ] 4 Testdrucke: Rohr/Band × geschlossen/offen, alle ohne Stützmaterial
- [ ] Du nimmst die Optik anhand von Fotos ab
- [ ] Performance-Ziele erfüllt (`docs/perf.md`)
- [ ] Bei No-Go: SPEC anpassen, bevor es weitergeht

---

## Phase 3 – Korb-Kern

### - [ ] T10: Stapel-Geometrie

**Beschreibung:** Unten bekommt der Korb einen nach innen versetzten Fuß mit 45°-Fase, oben passt der Rand dazu. Fußmaß = Rand-Innenmaß − 2·Spiel. Das gilt für massive Wände, Lochmuster und Geflecht (beim Geflecht über Fußband und Randwulst). Der Schalter „stapelbar aus“ ergibt einen flachen Boden.
**Akzeptanz:**

- [ ] Die Fuß-Außenkontur entspricht der Rand-Innenkontur − 2·Spiel ± 0,01 mm.
- [ ] Ein Korb, der virtuell um H nach oben versetzt wird, überschneidet sich nicht mit dem darunter (Volumen der Schnittmenge = 0) und greift seitlich ein (Fuß liegt innerhalb des Rands).
- [ ] Bounding Box eines einzelnen Korbs = H (kein Aufmaß).
      **Prüfung:** `npx vitest run tests/geometry/stacking.test.ts`
      **Abhängig von:** T3, T8
      **Dateien:** `src/geometry/stacking.ts`, `src/geometry/basket.ts`, `src/geometry/weave/index.ts`, `tests/geometry/stacking.test.ts`
      **Umfang:** M

### - [ ] T11: 3MF-Export und Download-Menü

**Beschreibung:** Ein 3MF-Writer (Model-XML, Content-Types, Rels, als ZIP über fflate, Einheit mm). Der Download-Button wird zum Menü mit STL und 3MF.
**Akzeptanz:**

- [ ] Das ZIP enthält `[Content_Types].xml`, `_rels/.rels` und `3D/3dmodel.model`; Vertex- und Dreieckszahl stimmen.
- [ ] Die Datei öffnet sich in PrusaSlicer und Bambu Studio in korrekter Größe.
      **Prüfung:** `npx vitest run tests/export/threemf.test.ts`; manuell im Slicer
      **Abhängig von:** T9
      **Dateien:** `src/export/threemf.ts`, `src/ui/controls/DownloadButton.tsx`, `tests/export/threemf.test.ts`
      **Umfang:** S

### - [ ] T12: Wandflächen-Modell und Wabenmuster

**Beschreibung:** Das Modell `WallFace` beschreibt die vier geraden Wandabschnitte mit lokalem Koordinatensystem. `usableArea()` nimmt Randbänder, Ecken und (vorbereitet) Griffbereiche aus. Dazu das Wabenmuster (Spitze nach oben, zentriert), ausgeschnitten per Batch-Difference.
**Akzeptanz:**

- [ ] Kein Loch liegt in einem Randband oder in der Eckzone (Test über Bounding Boxen der Ausschnitte).
- [ ] Ist die Fläche zu klein, entstehen keine Löcher und kein Fehler.
- [ ] Das Mesh ist manifold.
      **Prüfung:** `npx vitest run tests/geometry/patterns/hex.test.ts`
      **Abhängig von:** T3
      **Dateien:** `src/geometry/patterns/types.ts`, `src/geometry/patterns/wall-face.ts`, `src/geometry/patterns/hex.ts`, `src/geometry/build.ts`, `tests/geometry/patterns/hex.test.ts`
      **Umfang:** M

### - [ ] T13: Schlitz- und Rautenmuster

**Beschreibung:** Vertikale Langlöcher mit runden Enden und auf der Spitze stehende Quadrate, beide über `WallFace` und nach denselben Regeln wie T12.
**Akzeptanz:**

- [ ] Gleiche Freihalteregeln wie bei T12; das Mesh ist manifold.
- [ ] Kein Muster hat eine Oberkante flacher als 45°.
      **Prüfung:** `npx vitest run tests/geometry/patterns`
      **Abhängig von:** T12
      **Dateien:** `src/geometry/patterns/slots.ts`, `src/geometry/patterns/diamond.ts`, `tests/geometry/patterns/slots.test.ts`, `tests/geometry/patterns/diamond.test.ts`
      **Umfang:** S

### Checkpoint C

- [ ] Alle Wandstile × stapelbar an/aus ergeben manifold-Meshes
- [ ] Drucktest: Stapelpaar ergibt 2·H ± 0,5 mm und rutscht nicht ab
- [ ] Review mit dir

---

## Phase 4 – Bedienung nach Bento3D-Vorbild

### - [ ] T14: Store und URL-Serialisierung

**Beschreibung:** Ein zustand-Store für `BasketParams` (immer über `clampParams`). Die URL wird synchronisiert (`?v=1&w=150&d=100&…`, nur Abweichungen vom Default). Beim Laden wird die Konfiguration aus der URL wiederhergestellt; ungültige Werte werden begrenzt und gemeldet.
**Akzeptanz:**

- [ ] Hin- und Rückweg (serialisieren, dann parsen) ergibt für zufällige gültige Parameter dieselben Werte (property-based, 200 Fälle).
- [ ] Unbekannte oder kaputte Parameter führen zu Defaults und einem Hinweis, nie zu einem Absturz.
      **Prüfung:** `npx vitest run tests/state`
      **Abhängig von:** T2
      **Dateien:** `src/state/store.ts`, `src/state/url.ts`, `tests/state/url.test.ts`
      **Umfang:** S

### - [ ] T15: Toolbar und Parameter-Dialog

**Beschreibung:** Eine Toolbar oben (Parameter, Raster, Ansicht, Download) und ein Parameter-Dialog mit allen Parametern als Zahlenfeld plus Slider, gruppiert nach Korb, Wand, Stapeln und Geflecht (Gruppe nur sichtbar, wenn der Wandstil „Geflecht“ ist). Hinweise beim Begrenzen erscheinen unaufdringlich. Alle Texte stehen in `ui/i18n/de.ts`. Die provisorischen Schalter aus T8 entfallen.
**Akzeptanz:**

- [ ] Jeder Parameter aus dem Spec ist einstellbar; eine Änderung erzeugt eine neue Vorschau.
- [ ] Der Dialog lässt sich komplett per Tastatur bedienen (Tab, Pfeiltasten, Esc).
      **Prüfung:** `npm run dev`, Sichtprüfung; Komponenten-Test für die Sichtbarkeit der Geflecht-Gruppe
      **Abhängig von:** T14, T8, T13
      **Dateien:** `src/ui/controls/Toolbar.tsx`, `src/ui/controls/ParamsDialog.tsx`, `src/ui/controls/NumberField.tsx`, `src/ui/i18n/de.ts`, `tests/ui/params-dialog.test.tsx`
      **Umfang:** M

### - [ ] T16: Maß-Labels am Modell

**Beschreibung:** Bemaßungen für B, T und H werden als HTML-Overlays an den Modellkanten angezeigt. Ein Klick öffnet ein Eingabefeld (Enter übernimmt, Esc bricht ab); daneben ein Slider zum Ziehen. Das entspricht dem Bento3D-Muster mit eigener Gestaltung.
**Akzeptanz:**

- [ ] Ein Klick auf ein Maß, dann Wert eingeben und Enter, ändert das Modell; die URL wird aktualisiert.
- [ ] Die Labels folgen beim Drehen der Kamera und verdecken sich nicht gegenseitig.
      **Prüfung:** `npm run dev`; ein E2E-Schritt in T21
      **Abhängig von:** T15
      **Dateien:** `src/ui/viewer/DimensionLabels.tsx`, `src/ui/viewer/Viewer.tsx`
      **Umfang:** S

### - [ ] T17: Ansichten Einzeln / Stapel / Explosion

**Beschreibung:** Ein Ansichtsschalter: einzelner Korb, zwei Körbe gestapelt (zweite Instanz um H versetzt) oder Explosion mit Slider für den Abstand. Das Mesh wird nicht neu berechnet, nur instanziert.
**Akzeptanz:**

- [ ] Die Stapelansicht zeigt zwei Körbe exakt im Abstand H.
- [ ] Der Explosions-Slider bewegt flüssig (≥ 50 fps bei Default-Geflecht).
      **Prüfung:** `npm run dev`, Sichtprüfung
      **Abhängig von:** T15, T10
      **Dateien:** `src/ui/viewer/StackView.tsx`, `src/ui/controls/ViewSwitch.tsx`
      **Umfang:** S

### Checkpoint D

- [ ] Der komplette Ablauf geht nur mit der Maus; ein geteilter Link stellt die Konfiguration 1:1 wieder her
- [ ] Du prüfst die Bedienung

---

## Phase 5 – Ausstattung

### - [ ] T18: Griffmulden

**Beschreibung:** Griffmulden mit fester Größe (60 × 20 mm, 8 mm unter der Oberkante), wahlweise an keinen Seiten, an den Stirnseiten oder an allen Seiten. Bei massiver Wand bzw. Lochmuster werden sie ausgeschnitten, und `usableArea` hält den Bereich frei. Beim Geflecht wird die Öffnung aus Staken und Strängen geschnitten und mit einem massiven, gerundeten Rahmen eingefasst.
**Akzeptanz:**

- [ ] Alle Wandstile × alle Griffoptionen ergeben manifold-Meshes; beim Geflecht bleibt es eine zusammenhängende Komponente.
- [ ] Ist eine Wand zu schmal für die Mulde, wird die Option begrenzt und gemeldet (über `clampParams`).
      **Prüfung:** `npx vitest run tests/geometry/handles.test.ts`
      **Abhängig von:** T12, T8
      **Dateien:** `src/geometry/handles.ts`, `src/geometry/patterns/wall-face.ts`, `src/geometry/weave/index.ts`, `tests/geometry/handles.test.ts`
      **Umfang:** M

### - [ ] T19: Trennwände (Geometrie)

**Beschreibung:** Das Datenmodell für das Raster bekommt Trennwand-Positionen in X und Y (in mm, gemessen von der Innenkante). Die Trennwände sind massiv, durchgehend und so hoch wie die Innenhöhe (bzw. ein eingestellter Wert). Sie werden mit der Wand bzw. mit Staken und Strängen vereinigt. Die Erweiterung von `BasketParams` und der URL gehört dazu.
**Akzeptanz:**

- [ ] Jede Trennwand liegt an der angegebenen Position ± 0,01 mm; Positionen werden auf den gültigen Bereich begrenzt (Mindestfach 10 mm).
- [ ] Das Mesh ist manifold und besteht aus einer Komponente (auch beim Geflecht).
      **Prüfung:** `npx vitest run tests/geometry/dividers.test.ts`
      **Abhängig von:** T3, T8, T14
      **Dateien:** `src/geometry/dividers.ts`, `src/geometry/params.ts`, `src/state/url.ts`, `tests/geometry/dividers.test.ts`
      **Umfang:** M

### - [ ] T20: Raster-Editor

**Beschreibung:** Der Raster-Modus schaltet die Kamera in die Draufsicht. Am rechten und am unteren Rand stehen „+“-Buttons, die eine Trennwand einfügen (mittig im größten Fach). Ein Klick auf eine Trennwand zeigt ein Positionsmaß zum Eintippen und eine Schaltfläche zum Löschen.
**Akzeptanz:**

- [ ] Hinzufügen, Verschieben und Löschen funktionieren, und die Vorschau aktualisiert sich.
- [ ] Die Fachmaße werden in der Draufsicht angezeigt.
      **Prüfung:** `npm run dev`; ein E2E-Schritt in T21
      **Abhängig von:** T19, T15
      **Dateien:** `src/ui/controls/GridEditor.tsx`, `src/ui/viewer/Viewer.tsx`, `src/ui/i18n/de.ts`
      **Umfang:** M

### Checkpoint E

- [ ] Alle Funktionen aus dem Spec (v1) sind umgesetzt
- [ ] Review mit dir

---

## Phase 6 – Absicherung und Release

### - [ ] T21: E2E-Hauptablauf

**Beschreibung:** Playwright-Test: Start, Breite über das Maß-Label ändern, Wandstil Geflecht wählen, Material Band wählen, Trennwand hinzufügen, STL herunterladen, 3MF herunterladen, URL kopieren und neu laden, Konfiguration ist gleich.
**Akzeptanz:**

- [ ] Der Test läuft stabil (3 Durchläufe ohne Flake).
- [ ] Die heruntergeladenen Dateien sind > 0 Byte, und das STL hat die erwartete Byte-Länge.
      **Prüfung:** `npm run e2e`
      **Abhängig von:** T16, T17, T18, T20, T11
      **Dateien:** `e2e/main-flow.spec.ts`
      **Umfang:** S

### - [ ] T22: Performance, Snapshots, Coverage

**Beschreibung:** Zeitmessung und Optimierung, falls nötig (Auflösung pro Qualitätsstufe, Batch-Unions, Caching unveränderter Teile). Snapshot-Tests (Vertex- und Dreieckszahl) für 5 Referenz-Konfigurationen: massiv, Waben, Geflecht Rohr, Geflecht Band offen, Geflecht mit Griffen und Trennwänden. Das Coverage-Ziel wird durchgesetzt.
**Akzeptanz:**

- [ ] Die Erfolgskriterien 1, 2 und 7a aus dem Spec sind gemessen und erfüllt (`docs/perf.md`).
- [ ] Coverage von `src/geometry` und `src/export` ≥ 90 % (Schwelle in `vitest.config.ts` hinterlegt).
      **Prüfung:** `npm run test:coverage`
      **Abhängig von:** T21
      **Dateien:** `vitest.config.ts`, `tests/geometry/snapshots.test.ts`, `docs/perf.md`, ggf. `src/geometry/*`
      **Umfang:** M

### - [ ] T23: Release-Check

**Beschreibung:** Die 5 Referenzkörbe werden in PrusaSlicer und Bambu Studio geslict, ein Stapelpaar und ein Geflechtkorb werden gedruckt. Dazu die README (Bedienung, Entwicklung, Lizenz) und die Klärung von Hosting und Lizenz mit dir.
**Akzeptanz:**

- [ ] Keine Reparaturhinweise in beiden Slicern; die Drucke erfüllen die Erfolgskriterien 3–6 aus dem Spec.
- [ ] README vorhanden; Hosting und Lizenz entschieden und im Spec unter „Entschieden“ eingetragen.
      **Prüfung:** Manuell und mit Fotos; `npm run build && npm run preview`
      **Abhängig von:** T22
      **Dateien:** `README.md`, `SPEC.md`, `LICENSE`
      **Umfang:** S

### Checkpoint F

- [ ] Alle Erfolgskriterien aus dem Spec sind erfüllt
- [ ] Freigabe durch dich
