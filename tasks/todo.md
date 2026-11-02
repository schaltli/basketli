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

- [ ] Die Stakenzahl ist immer gerade (geschlossene Ringe, keine Naht); gewählt wird die gerade Zahl mit dem Abstand am nächsten zum Zielwert; bei den Defaults weicht er höchstens ±15 % ab.
- [ ] Reihenanzahl n = ⌊(nutzbare Höhe − Spalt) / (Materialhöhe + Spalt)⌋ mit n + 1 Spalten; der Rest geht je zur Hälfte an Fußband und Randwulst. Getestet mit Rohr und Band bei 3, 15 und 40 mm.
      **Prüfung:** `npx vitest run tests/geometry/weave/layout.test.ts`
      **Abhängig von:** T2
      **Dateien:** `src/geometry/weave/layout.ts`, `src/geometry/weave/outline.ts`, `tests/geometry/weave/layout.test.ts`
      **Umfang:** S

### - [x] T6: Strangpfade

**Beschreibung:** Aus Layout und Reihenindex entsteht der geschlossene 3D-Pfad eines Strangs: Umriss plus eine sinusförmige Verschiebung entlang der Normalen. Das Maximum bzw. Minimum liegt genau an den Staken. Ungerade Reihen sind um eine Stake versetzt. Die Abtastdichte richtet sich nach der Qualitätsstufe.
**Akzeptanz:**

- [ ] An den Staken wechselt das Vorzeichen der Verschiebung von Stake zu Stake (auch über die Naht des geschlossenen Pfads hinweg).
- [ ] Benachbarte Reihen haben an derselben Stake entgegengesetzte Vorzeichen.
- [ ] Amplitude = Stakendurchmesser/2 + Materialdicke/2 − FUSE (0,3 mm Überlappung).
      **Prüfung:** `npx vitest run tests/geometry/weave/path.test.ts`
      **Abhängig von:** T5
      **Dateien:** `src/geometry/weave/path.ts`, `tests/geometry/weave/path.test.ts`
      **Umfang:** S

### - [x] T7: Sweep-Mesh für Rohr und Band

**Beschreibung:** Ein Querschnitt-Profil wird entlang eines geschlossenen Pfads geführt und ergibt ein geschlossenes Rohr-Mesh mit stabiler Ausrichtung (z bleibt oben, keine Verdrehung). Zwei Profile: Rohr (flach-oval) und Band (Rechteck mit gerundeten Kanten), beide mit Unterkante für ≤ 45° Überhang. Das Mesh wird als Manifold importiert.
**Akzeptanz:**

- [ ] Beide Profile ergeben bei Default- und Grenzwerten einen manifold-Körper (Status `NoError`).
- [ ] Der Querschnitt entspricht Materialhöhe × Materialdicke ± 0,05 mm.
- [ ] Am Profil gibt es keinen Unterseitenwinkel unter 45° zur Horizontalen.
      **Prüfung:** `npx vitest run tests/geometry/weave/sweep.test.ts`
      **Abhängig von:** T6, T3
      **Dateien:** `src/geometry/weave/profile.ts`, `src/geometry/weave/sweep.ts`, `tests/geometry/weave/sweep.test.ts`
      **Umfang:** M

### - [x] T8: Geflechtkorb zusammensetzen

**Beschreibung:** `build()` erzeugt im Wandstil „Geflecht“ den Korb aus massivem Boden, Fußband, Staken, allen Strängen und einem gerundeten Randwulst, vereinigt in einem Batch-Union. In der Vorschau bekommt der Geflecht-Modus ein Rattan-Material. Dazu eine provisorische Umschaltung „massiv/Geflecht“ und „Rohr/Band“ in der Oberfläche (wird in T15 ersetzt). Zeitmessung im Worker.
**Akzeptanz:**

- [ ] Der Körper ist manifold und besteht aus genau einer zusammenhängenden Komponente; die Bounding Box entspricht den Außenmaßen ± 0,05 mm.
- [ ] Vorschau unter 1 s und Export-Qualität unter 5 s bei 150×100×80 mm mit Defaults (gemessen und in `docs/perf.md` notiert).
- [ ] Das Über/Unter-Bild ist innen und außen sichtbar (Screenshot in `docs/`).
      **Prüfung:** `npx vitest run tests/geometry/weave/build.test.ts`; `npm run dev` zur Sichtprüfung
      **Abhängig von:** T7, T4
      **Dateien:** `src/geometry/weave/index.ts`, `src/geometry/build.ts`, `src/ui/viewer/materials.ts`, `tests/geometry/weave/build.test.ts`, `docs/perf.md`
      **Umfang:** M

### - [x] T9: STL-Export und Download

**Beschreibung:** Ein binärer STL-Writer (Mesh → Uint8Array) und ein Download-Button, der den Export in Export-Qualität im Worker erzeugt. Dateiname: `basketli_<B>x<T>x<H>.stl`.
**Akzeptanz:**

- [ ] Byte-Länge = 84 + 50·n; Dreieckszahl im Header stimmt; Normalen zeigen nach außen.
- [ ] Die heruntergeladene Datei öffnet sich in PrusaSlicer bzw. Bambu Studio ohne Reparaturhinweis.
      **Prüfung:** `npx vitest run tests/export/stl.test.ts`; manuell im Slicer
      **Abhängig von:** T4 (für den Geflecht-Testdruck auch T8)
      **Dateien:** `src/export/stl.ts`, `src/export/download.ts`, `src/ui/controls/DownloadButton.tsx`, `tests/export/stl.test.ts`
      **Umfang:** S

### - [x] T8P: Druckbarkeitstest (Schicht für Schicht)

**Beschreibung:** `overhangReport()` schneidet einen Körper in 0,2-mm-Schichten und misst die Fläche, die nicht innerhalb 45° von der Schicht darunter getragen wird. Brücken zählen als nicht getragen. Der Test läuft für alle Wandstile.
**Akzeptanz:**

- [x] Das alte Strang-Geflecht fällt durch (~49 mm² pro Schicht), die glatte Wanne besteht.
- [x] Alle Wandstile und Varianten bestehen (< 0,5 mm² pro Schicht) – erfüllt mit T8R.

**Prüfung:** `npx vitest run tests/geometry/printability.test.ts`
**Abhängig von:** T3
**Dateien:** `src/geometry/printability.ts`, `tests/geometry/printability.test.ts`
**Umfang:** S

### - [x] T8R: Geflecht als druckbare Relief-Wand

**Beschreibung:** Ersetzt die frei geführten Stränge (T7/T8) durch ein Höhenfeld über (s, z) mit Innen- und Außenfläche: Reihenwellen, Strangquerschnitt (Rohr/Band), Staken-Rippen, Fußband und Randwulst als Zielform; danach 45°-Filter von unten nach oben und Mindestdicke 1 mm. Daraus ein geschlossenes Schalen-Mesh; Boden per Union. Offene Variante: Spitzfenster (45°-Dach) zwischen den Staken per Subtraktion. Sweep/Profil-Code aus T7 entfällt.
**Akzeptanz:**

- [x] Höhenfeld: in jeder Spalte steigt die Außenfläche pro Höhenschritt höchstens um den Höhenschritt nach außen, die Innenfläche höchstens um den Höhenschritt nach innen; Dicke überall ≥ 1 mm.
- [x] Alle Geflecht-Varianten (Rohr/Band × geschlossen/offen, klein und Default) bestehen den Druckbarkeitstest und sind eine manifold-Komponente mit exakten Außenmaßen.
- [x] Vorschau < 1 s, Export < 5 s (Default 150×100×80); Screenshots in `docs/img/` zeigen klar erkennbares Über/Unter.

**Prüfung:** `npx vitest run tests/geometry`; Sichtprüfung im Browser
**Abhängig von:** T8P
**Dateien:** `src/geometry/weave/relief.ts`, `src/geometry/weave/index.ts`, `src/geometry/weave/windows.ts`, `tests/geometry/weave/relief.test.ts`, `tests/geometry/printability.test.ts`
**Umfang:** M

### - [x] T8B: Geflecht v3 – flache Bänder, runde Staken, Kordelrand

**Beschreibung:** Ersetzt die Relief-Wand (T8R) durch das Referenz-Prinzip: Jede Reihe ist ein welliger 2D-Ring (Mittellinie ± Dicke/2), senkrecht extrudiert; dazu runde Staken. Kordelrand oben und Kordelfuß unten als Höhenfeld-Schale mit schrägen Rillen und 45°-Filter. `overhangReport` erkennt Brücken (≥ 2 Anker auf der Schicht darunter) und misst ihre Länge.
**Akzeptanz:**

- [x] Druckbarkeitstest erweitert: Brücken mit ≥ 2 Ankern und Länge ≤ 15 mm sind erlaubt, einseitige Überhänge nicht. Das Strang-Geflecht aus Prototyp 1 fällt weiterhin durch (49 mm²; dazu Regel: Brücken ≥ 0,8 mm breit).
- [x] Alle Geflecht-Varianten (Rohr/Band × geschlossen/offen) bestehen den Test, sind eine manifold-Komponente mit exakten Außenmaßen.
- [x] Sichtvergleich mit der Referenz: flache Bänder um runde Staken, Kordelrand; Screenshots in `docs/img/`. Vorschau < 1 s, Export < 5 s.

**Prüfung:** `npx vitest run tests/geometry`; Sichtprüfung
**Abhängig von:** T8P
**Dateien:** `src/geometry/printability.ts`, `src/geometry/weave/bands.ts`, `src/geometry/weave/rope.ts`, `src/geometry/weave/index.ts`, `tests/geometry/weave/*.test.ts`
**Umfang:** M

### Checkpoint B – Go/No-Go Geflecht

- [ ] 4 Testdrucke: Rohr/Band × geschlossen/offen, alle ohne Stützmaterial
- [ ] Du nimmst die Optik anhand von Fotos ab
- [ ] Performance-Ziele erfüllt (`docs/perf.md`)
- [ ] Bei No-Go: SPEC anpassen, bevor es weitergeht

---

## Phase 3 – Korb-Kern

### - [x] T10: Stapel-Schnittstelle für alle Wandstile

**Beschreibung:** Gemeinsamer Sockel (Fuß 3 mm, 4,3 mm eingezogen, 45°-Fase), Wand oben ≤ 4 mm, Eckenradius ≥ 10 mm – Körbe gleicher Grundfläche stapeln stilübergreifend.
**Akzeptanz:**

- [x] Alle fünf Stile: ein Körper, Fuß eingezogen, Höhe H, Sockel stützfrei druckbar.
- [x] Stilübergreifend gestapelt (6 Kombinationen geprüft): Fuß in der Öffnung, keine Kollision beim berechneten Stapelmaß, liegt tatsächlich auf.
- [ ] Drucktest: Stapelpaar zweier verschiedener Stile.

**Dateien:** `src/geometry/stacking.ts`, `src/geometry/build.ts`, `src/geometry/params.ts`, `tests/geometry/stacking.test.ts`
**Umfang:** M

### - [x] T11: 3MF-Export und Download-Menü

**Beschreibung:** Ein 3MF-Writer (Model-XML, Content-Types, Rels, als ZIP über fflate, Einheit mm). Der Download-Button wird zum Menü mit STL und 3MF.
**Akzeptanz:**

- [x] Das ZIP enthält `[Content_Types].xml`, `_rels/.rels` und `3D/3dmodel.model`; Vertex- und Dreieckszahl stimmen.
- [ ] Die Datei öffnet sich in PrusaSlicer und Bambu Studio in korrekter Größe. (Testdatei: `testprints/basketli-geflecht-geschlossen_80x60x50.3mf`, Prüfung durch den Nutzer offen)
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

### - [x] T13b: Voronoi-Muster

**Beschreibung:** Wandstil „Voronoi“: reproduzierbare Zufallspunkte (Startwert) je Wandfläche, Voronoi-Zellen, um die halbe Stegbreite geschrumpft und ausgeschnitten. Jede Zelle bekommt oben eine Spitze (≤ 45°) oder eine Oberkante ≤ 15 mm. Parameter: Zellgröße, Stegbreite, Startwert.
**Akzeptanz:**

- [x] Gleicher Startwert → identisches Mesh; anderer Startwert → anderes Muster.
- [x] Ecken und Randbänder frei; manifold; Druckbarkeitstest grün (Prototyp mit eigener Wandflächen-Logik; T12 kann sie übernehmen).

**Prüfung:** `npx vitest run tests/geometry/patterns/voronoi.test.ts`
**Abhängig von:** T12
**Dateien:** `src/geometry/patterns/voronoi.ts`, `src/geometry/params.ts`, `tests/geometry/patterns/voronoi.test.ts`
**Umfang:** M

### - [x] T13c: Streckmetall (Prototyp)

**Beschreibung:** Wandstil „Streckmetall“: zwei Scharen durchgehender, einzeln verdrehter Schrägstege; stehende Rauten dazwischen; umlaufend.
**Akzeptanz:**

- [x] Parallele Rautenkanten genau eine Stegbreite auseinander; ganze Zahl Rauten pro Reihe.
- [x] Ein manifold-Körper, exakte Außenmaße, echte Löcher, Druckbarkeitstest grün (Verdrehung auf ≤ 45° begrenzt).
- [x] Vorschau ≈ 0,06 s, Export ≈ 1,4 s (150 × 100 × 80 mm).

**Dateien:** `src/geometry/patterns/expanded.ts`, `tests/geometry/patterns/expanded.test.ts`
**Umfang:** M

### Checkpoint C

- [ ] Alle Wandstile × stapelbar an/aus ergeben manifold-Meshes
- [ ] Drucktest: Stapelpaar ergibt 2·H ± 0,5 mm und rutscht nicht ab
- [ ] Review mit dir

---

## Phase 4 – Bedienung nach Bento3D-Vorbild

### - [x] T14: Store und URL-Serialisierung

**Beschreibung:** Ein zustand-Store für `BasketParams` (immer über `clampParams`). Die URL wird synchronisiert (`?v=1&w=150&d=100&…`, nur Abweichungen vom Default). Beim Laden wird die Konfiguration aus der URL wiederhergestellt; ungültige Werte werden begrenzt und gemeldet.
**Akzeptanz:**

- [ ] Hin- und Rückweg (serialisieren, dann parsen) ergibt für zufällige gültige Parameter dieselben Werte (property-based, 200 Fälle).
- [ ] Unbekannte oder kaputte Parameter führen zu Defaults und einem Hinweis, nie zu einem Absturz.
      **Prüfung:** `npx vitest run tests/state`
      **Abhängig von:** T2
      **Dateien:** `src/state/store.ts`, `src/state/url.ts`, `tests/state/url.test.ts`
      **Umfang:** S

### - [x] T15: Toolbar und Parameter-Dialog

**Beschreibung:** Eine Toolbar oben (Parameter, Raster, Ansicht, Download) und ein Parameter-Dialog mit allen Parametern als Zahlenfeld plus Slider, gruppiert nach Korb, Wand, Stapeln und Geflecht (Gruppe nur sichtbar, wenn der Wandstil „Geflecht“ ist). Hinweise beim Begrenzen erscheinen unaufdringlich. Alle Texte stehen in `ui/i18n/de.ts`. Die provisorischen Schalter aus T8 entfallen.
**Akzeptanz:**

- [ ] Jeder Parameter aus dem Spec ist einstellbar; eine Änderung erzeugt eine neue Vorschau.
- [ ] Der Dialog lässt sich komplett per Tastatur bedienen (Tab, Pfeiltasten, Esc).
      **Prüfung:** `npm run dev`, Sichtprüfung; Komponenten-Test für die Sichtbarkeit der Geflecht-Gruppe
      **Abhängig von:** T14, T8, T13
      **Dateien:** `src/ui/controls/Toolbar.tsx`, `src/ui/controls/ParamsDialog.tsx`, `src/ui/controls/NumberField.tsx`, `src/ui/i18n/de.ts`, `tests/ui/params-dialog.test.tsx`
      **Umfang:** M

### - [x] T16: Maß-Labels am Modell

**Beschreibung:** Bemaßungen für B, T und H werden als HTML-Overlays an den Modellkanten angezeigt. Ein Klick öffnet ein Eingabefeld (Enter übernimmt, Esc bricht ab); daneben ein Slider zum Ziehen. Das entspricht dem Bento3D-Muster mit eigener Gestaltung.
**Akzeptanz:**

- [x] Ein Klick auf ein Maß, dann Wert eingeben und Enter, ändert das Modell; die URL wird aktualisiert.
- [x] Die Labels folgen beim Drehen der Kamera und verdecken sich nicht gegenseitig. (Labels wandern auf die kameranahen Seiten; ein Label, dessen Kante in Blickrichtung zeigt oder das ein anderes verdecken würde, wird ausgeblendet.)
      **Prüfung:** `npm run dev`; ein E2E-Schritt in T21
      **Abhängig von:** T15
      **Dateien:** `src/ui/viewer/DimensionLabels.tsx`, `src/ui/viewer/Viewer.tsx`
      **Umfang:** S

### - [x] T17: ~~Ansichten Einzeln / Stapel / Explosion~~ → Stapel-Matrix (Test)

**Entscheid 2026-11-02:** Eine Stapelvorschau bringt wenig, wenn das Stapeln nachweislich funktioniert. Statt der Ansichten misst ein Test das Stapeln nach.
**Akzeptanz:**

- [x] Für jeden Wandstil wird ein 100×100×100-mm-Korb in Export-Qualität erzeugt; alle 25 Paare (unten × oben) werden geprüft.
- [x] Der obere Korb liegt genau beim berechneten Stapelmaß auf: 0,05 mm darüber kein Kontakt, 0,05 mm darunter Kontakt.
- [x] Der Fuß klemmt nicht: 0,3 mm angehoben lässt er sich in alle vier Richtungen um 0,25 mm verschieben, ohne die Wand zu berühren.
- [x] Gegenprobe: Mit absichtlich falschem Stapelmaß bzw. zu schmalem Fußeinzug schlägt der Test fehl.
      **Prüfung:** `npx vitest run tests/geometry/stacking.test.ts`
      **Dateien:** `tests/geometry/stacking.test.ts`

### Checkpoint D

- [ ] Der komplette Ablauf geht nur mit der Maus; ein geteilter Link stellt die Konfiguration 1:1 wieder her
- [ ] Du prüfst die Bedienung

---

## Phase 5 – Ausstattung

### - [x] T18: Griffaussparung von oben (statt Griffmulden)

**Entscheid 2026-11-02:** Geschlossene Griffmulden entfallen. Optional gibt es einen U-förmigen Ausschnitt von oben an einer oder beiden Stirnseiten (Standard: keine), Breite 60 mm (30–120) und Tiefe 20 mm (10–40) einstellbar. Vergleich der Varianten: Artefakt „basketli Griffmulden“.
**Akzeptanz:**

- [x] Alle Wandstile × eine/beide Stirnseiten: ein zusammenhängender, gültiger Körper; Aussparung offen; Rahmen massiv; stützfrei druckbar (Druckbarkeitsprüfung).
- [x] Zu schmale oder zu niedrige Wand: Breite/Tiefe werden begrenzt bzw. die Aussparung abgeschaltet, mit Hinweis.
- [x] Ein Korb mit Aussparungen trägt den nächsten beim selben Stapelmaß.
      **Prüfung:** `npx vitest run tests/geometry/handles.test.ts`
      **Dateien:** `src/geometry/handles.ts`, `src/geometry/build.ts`, `src/geometry/patterns/{hex,voronoi}.ts`, `src/geometry/weave/bands.ts`, `src/ui/controls/ParamsPanel.tsx`, `tests/geometry/handles.test.ts`

### - [x] T18b: Geschlossenes Griffloch mit eingebauten Stützrippen

**Entscheid 2026-11-02:** Neben der Aussparung von oben gibt es als Griffart ein echtes Langloch unter einem massiven Steg (Breite 80 mm, Höhe 25 mm, Steg 15 mm). Die waagrechte Oberkante tragen Stützrippen im Modell, die nach dem Druck herausgebrochen werden.
**Akzeptanz:**

- [x] Alle Wandstile × eine/beide Stirnseiten: ein Körper, Loch zwischen den Rippen offen, Steg und Rahmen massiv, Druckbarkeitstest grün (Brücken ≤ 15 mm, nur von Rippe zu Rippe).
- [x] Rippen ≤ 12 mm Abstand, Hals 0,4 mm oben und unten, Verbreiterung ≤ 45°.
- [x] Zu niedriger/schmaler Korb: Steg, Höhe, Breite begrenzt oder Griff abgeschaltet, mit Hinweis.
- [ ] Testdruck: Rippen lassen sich sauber herausbrechen.

**Prüfung:** `npx vitest run tests/geometry/handles.test.ts tests/ui/params-panel.test.tsx`
**Dateien:** `src/geometry/handles.ts`, `src/geometry/build.ts`, `src/geometry/params.ts`, `src/state/url.ts`, `src/ui/controls/ParamsPanel.tsx`, `src/ui/i18n/de.ts`, `tests/geometry/handles.test.ts`

### T19: Trennwände (Entscheid 2026-11-02: Muster pro Fach ausrichten, Trennwände mit Wandmuster, Höhe einstellbar mit Standard „maximal“, durchgehende Trennwände)

#### - [x] T19a: Datenmodell und massive Trennwände

`dividersX`/`dividersY` (Mitte, mm vom linken/vorderen Außenrand), `dividerHeight` (0 = so hoch wie möglich: 0,5 mm unter dem Fuß eines aufgesetzten Korbs). Dicke = Wandstärke des Stils. Positionen werden sortiert, Fächer ≥ 10 mm, Unpassendes entfällt mit Hinweis. Link-Format: `dividersX=50,100.5`.
**Prüfung:** `npx vitest run tests/geometry/dividers.test.ts` (alle Stile: ein Körper, Lage, Höhe, Stapeln)

#### - [x] T19b: Wandmuster pro Fach ausrichten

Waben: ganze Waben je Wandabschnitt, zentriert, ≥ ein Steg Abstand zur Trennwand. Streckmetall: ganze Zahl Rauten je Abschnitt (Teilung leicht gestreckt), Knoten an den Trennwandflächen, Streben enden in massiven Anschluss-Stegen. Geflecht: Stake an jedem Anschluss, dazwischen gleichmäßig, Gesamtzahl gerade, Abstand ≤ Brückengrenze; Trennwand ragt in die Stake. Voronoi: Zellen am Anschluss (Trennwand + ein Steg) angeschnitten.
Nachtrag 2026-11-02 (Kamm): Anschluss-Stege nur bis zur Trennwand-Oberkante; darüber läuft das Muster über die Anschlüsse weiter. Dafür liegt das Raster selbst auf den Anschlüssen (Waben: eine Wabe mittig auf jedem Anschluss; Streckmetall: Knoten auf dem Anschluss, überall gleiche Reihenhöhe); Zellen unterhalb der Oberkante werden am Steg angeschnitten, Splitter < 20 % entfallen.
**Prüfung:** `npx vitest run tests/geometry/dividers.test.ts` (inkl. Druckbarkeit aller Stile mit Trennwänden)

#### - [x] T19c: Trennwände mit Wandmuster

Gleiche Regeln je Trennwand-Abschnitt (zwischen Wand und Kreuzungen); Geflecht als gewebte Trennwand mit Staken an Anschlüssen und Kreuzungen.
**Prüfung:** `npx vitest run tests/geometry/divider-patterns.test.ts tests/geometry/dividers.test.ts` (ein Körper, Muster offen, druckbar in allen Stilen).
**Offen für T22:** Vorschau Geflecht 150×100×80 mit 3 Trennwänden 2,0 s (Ziel 1 s; ohne Trennwände 0,8 s).

### - [x] T20: Raster-Editor

**Beschreibung:** Der Raster-Modus schaltet die Kamera in die Draufsicht. Am rechten und am unteren Rand stehen „+“-Buttons, die eine Trennwand einfügen (mittig im größten Fach). Ein Klick auf eine Trennwand zeigt ein Positionsmaß zum Eintippen und eine Schaltfläche zum Löschen.
**Akzeptanz:**

- [x] Hinzufügen, Verschieben und Löschen funktionieren, und die Vorschau aktualisiert sich. (Raster-Modus in der Werkzeugleiste: Draufsicht, Griffe neben dem Korb zum Ziehen/Anklicken, „+“ am Ende jeder Griffreihe, „Gleichmäßig verteilen“, „Alle entfernen“; Höhe im Seitenpanel)
- [x] Die Fachmaße werden in der Draufsicht angezeigt.
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
      **Abhängig von:** T16, T18, T20, T11
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
