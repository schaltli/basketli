# Spec: basketli

> Status: **Entwurf – wartet auf Freigabe** · Stand: 2026-11-01

## Objective

**basketli** ist eine interaktive Web-Applikation, mit der man **stapelbare Körbe für den 3D-Druck** parametrisch gestaltet und als druckfertige Datei herunterlädt – ohne CAD-Kenntnisse, ohne Account, komplett im Browser.

Die **Benutzerführung orientiert sich an [bento3d.design](https://bento3d.design/)**: Modell im Zentrum, Maße direkt am Modell per Klick/Slider ändern, kompakter Parameter-Dialog, Raster mit „+“-Buttons zum Unterteilen, Live-3D-Vorschau, Download mit einem Klick. Statt Bento-Boxen mit Deckel/Scharnier erzeugt basketli **offene Körbe mit durchbrochenen Wänden**, die **aufeinander gestapelt** werden (Lippe/Absatz).

Übernommen wird das **Interaktionsmuster**, nicht Code, Grafiken, Texte oder Branding von Bento3D.

### Zielgruppe

Maker:innen mit FDM-3D-Drucker (Bambu, Prusa, Creality …), die Körbe für Werkstatt, Küche, Schrank oder Regal in exakten Maßen brauchen.

### User Stories

1. Als Nutzer:in gebe ich **Breite, Tiefe, Höhe** in mm ein (Klick auf Maß oder Slider) und sehe den Korb sofort in 3D.
2. Ich wähle ein **Wandmuster** (Waben, vertikale Schlitze, Rauten oder geschlossen) und passe Lochgröße und Stegbreite an.
   2a. Alternativ wähle ich ein **Flechtmuster**: Der Korb sieht aus wie echt geflochten – Flechtstränge laufen sichtbar abwechselnd über und unter den senkrechten Staken, mit echter 3D-Tiefe innen und außen.
3. Ich aktiviere **Griffmulden** an den Stirnseiten (und optional an den Längsseiten).
4. Ich **unterteile** den Korb über ein Raster mit „+“-Buttons am rechten und unteren Rand in Fächer; ich kann Trennwände verschieben (Maß eintippen) und wieder entfernen.
5. Ich stelle ein, ob der Korb **stapelbar** ist; die Vorschau kann zwei Körbe übereinander zeigen (Stapelvorschau / Explosionsansicht per Slider).
6. Ich lade den Korb als **STL oder 3MF** herunter und kann ihn ohne Reparatur im Slicer drucken.
7. Ich kann meine Konfiguration per **Link teilen** (Parameter in der URL) und beim Neuladen wiederherstellen.

### Annahmen (bitte korrigieren, falls falsch)

1. **UI-Sprache Deutsch** in v1; Texte werden zentral gehalten, damit Englisch später leicht ergänzt werden kann.
2. **Nur Desktop-Browser** (aktuelle Chrome, Firefox, Safari, Edge) als Primärziel; auf Tablets nutzbar, Smartphone nur „funktioniert, aber nicht optimiert“.
3. **Kein Backend, keine Accounts, kein Tracking.** Statisches Hosting (z. B. GitHub Pages / Netlify).
4. **Kein Deckel, kein Scharnier, keine Box-Hülle** (anders als Bento3D „Partition & Box“).
5. **Boden ist in v1 geschlossen** (nur Wände durchbrochen) – siehe Open Questions.
6. Einheit ausschließlich **mm**.
7. Die Geometrie wird **ohne Stützmaterial** druckbar ausgelegt (Muster mit ≤ 45°-Überhängen bzw. kurzen Brücken).

## Tech Stack

| Bereich         | Wahl                                                          |
| --------------- | ------------------------------------------------------------- |
| Sprache         | TypeScript (strict)                                           |
| Build           | Vite                                                          |
| UI              | React 18                                                      |
| 3D-Ansicht      | three.js über @react-three/fiber + @react-three/drei          |
| Geometrie (CSG) | manifold-3d (WASM) – garantiert wasserdichte, manifold Meshes |
| Rechenlast      | Web Worker für die Geometrie-Erzeugung (UI bleibt flüssig)    |
| State           | zustand                                                       |
| Export          | eigener STL-Writer (binär) + 3MF (XML + ZIP via fflate)       |
| Tests           | Vitest (Unit/Geometrie), Playwright (E2E)                     |
| Lint/Format     | ESLint + Prettier                                             |
| Node            | Node 22 LTS, npm                                              |

Exakte Versionen werden beim Projekt-Setup in `package.json` gepinnt; neue Abhängigkeiten darüber hinaus → _Ask first_.

## Commands

```
Install:     npm ci
Dev:         npm run dev            # Vite Dev-Server, http://localhost:5173
Build:       npm run build          # tsc --noEmit && vite build → dist/
Preview:     npm run preview        # gebautes dist/ lokal servieren
Typecheck:   npm run typecheck      # tsc --noEmit
Lint:        npm run lint           # eslint . --max-warnings 0
Format:      npm run format         # prettier --write .
Test:        npm test               # vitest run
Test watch:  npm run test:watch     # vitest
Coverage:    npm run test:coverage  # vitest run --coverage
E2E:         npm run e2e            # playwright test
```

## Project Structure

```
src/
  geometry/        → Reine Geometrie-Logik, framework-frei, kein React/DOM
    params.ts      → BasketParams-Typ, Defaults, Grenzen, Validierung
    basket.ts      → Grundkörper: Wanne, Boden, Rand, Stapel-Absatz
    patterns/      → Lochmuster (hex, slots, diamond, none)
    weave/         → Flechtmuster: Staken, Flechtstrang-Pfade, Rohr-Mesh-Erzeugung
    handles.ts     → Griffmulden
    dividers.ts    → Trennwände aus dem Raster
    build.ts       → Orchestrierung: params → Manifold-Mesh
  worker/          → Web Worker, ruft geometry/build auf, liefert Mesh-Buffer
  export/          → stl.ts, threemf.ts (reine Funktionen: Mesh → Uint8Array)
  state/           → zustand-Store, URL-Serialisierung der Parameter
  ui/
    viewer/        → 3D-Szene, Kamera, Maß-Overlays, Stapel-/Explosionsansicht
    controls/      → Toolbar, Parameter-Dialog, Maß-Eingaben, Raster-Editor
    i18n/de.ts     → Alle UI-Texte
  App.tsx
  main.tsx
tests/
  geometry/        → Unit-Tests für Geometrie (*.test.ts)
  export/          → Unit-Tests für STL/3MF
e2e/               → Playwright-Specs
public/            → Statische Assets (Icons, Favicon)
docs/              → ADRs, Notizen zu Druckparametern
```

Regel: `src/geometry` und `src/export` importieren **nie** aus `src/ui` oder React.

## Funktionaler Umfang v1

### Parameter (Defaults / Grenzen)

| Parameter           | Default     | Bereich                                  | Hinweis                                     |
| ------------------- | ----------- | ---------------------------------------- | ------------------------------------------- |
| Breite (X, außen)   | 150 mm      | 30–400                                   |                                             |
| Tiefe (Y, außen)    | 100 mm      | 30–400                                   |                                             |
| Höhe (Z, außen)     | 80 mm       | 20–300                                   | = Stapelraster (s. u.)                      |
| Wandstärke          | 1.6 mm      | 0.8–5                                    | sinnvoll: Vielfache der Linienbreite        |
| Bodenstärke         | 1.2 mm      | 0.6–5                                    |                                             |
| Eckenradius (außen) | 4 mm        | 0–30                                     |                                             |
| Stapelbar           | an          | an/aus                                   |                                             |
| Stapelspiel         | 0.3 mm      | 0.1–1.0                                  | Toleranz zwischen Absatz und Rand           |
| Wandstil            | Waben       | Waben, Schlitze, Rauten, Geflecht, keins | Geflecht: eigene Parameter, s. u.           |
| Lochgröße           | 10 mm       | 3–40                                     |                                             |
| Stegbreite          | 2.5 mm      | 1–10                                     |                                             |
| Randband oben/unten | 8 mm        | 3–30                                     | massive Zone ohne Löcher                    |
| Griffmulden         | Stirnseiten | keine / Stirnseiten / alle Seiten        | Breite 60 mm, Höhe 20 mm, Abstand oben 8 mm |
| Unterteilungen      | keine       | Raster X×Y, je Trennwand Position in mm  | Trennwandhöhe = Innenhöhe oder einstellbar  |

Ungültige Kombinationen (z. B. Griffmulde breiter als die Wand, Lochgröße größer als die freie Wandfläche) werden **im UI abgefangen**: Wert wird begrenzt und ein Hinweis angezeigt – keine Abstürze, keine kaputten Meshes.

### Stapel-Geometrie

- Der Korb hat unten einen **umlaufenden, nach innen versetzten Absatz** (Fuß), der in die Innenkante des Korbs darunter greift.
- Außenmaß des Fußes = Innenmaß des Rands − 2 × Stapelspiel.
- **Stapelraster = eingestellte Höhe**: Zwei gestapelte Körbe der Höhe H sind zusammen exakt 2·H hoch (kein „+1 mm pro Lage“).
- Fuß-Übergang mit 45°-Fase, damit ohne Stützmaterial druckbar.

### Wandmuster

- **Waben**: Sechsecke mit Spitze nach oben (stützfrei).
- **Schlitze**: vertikale Langlöcher mit abgerundeten Enden.
- **Rauten**: auf der Spitze stehende Quadrate (45°).
- Muster werden je Wandfläche **zentriert** und halten Randbänder, Ecken (≥ Eckenradius + Steg) und Griffmulden frei.

### Flechtmuster (Wandstil „Geflecht“)

Ziel: Der Korb soll **tatsächlich wie geflochten aussehen** – nicht wie eine glatte Wand mit aufgedrucktem Muster, sondern mit räumlich verlaufenden Strängen.

**Aufbau (wie ein echter Weidenkorb)**

- **Staken**: senkrechte Rundstäbe im gleichmäßigen Abstand rund um den Korb, verankert in Boden und oberem Rand.
- **Flechtstränge**: waagerechte, umlaufende Stränge, die sich **wellenförmig abwechselnd vor und hinter** den Staken entlangführen (Leinwandbindung: 1 über, 1 unter).
- Benachbarte Reihen sind **um eine Stake versetzt** – dadurch entsteht das typische Schachbrett-Flechtbild. Damit das umlaufend ohne Bruchstelle aufgeht, wird die Stakenzahl automatisch **ungerade** gewählt (klassischer Korbmacher-Trick).
- Die Stränge laufen um die **abgerundeten Ecken** herum (Mindest-Eckenradius im Geflecht-Modus: max(10 mm, Stakendurchmesser + 2 × Materialdicke + 1 mm), damit die Stränge in der Ecke nicht mit sich selbst kollidieren).
- **Flechtmaterial wählbar** über den Querschnitt:
  - **Rohr**: flach-ovaler Querschnitt wie geschältes Peddigrohr.
  - **Band**: flacher Streifen mit leicht gerundeten Kanten, wie Flechtband/Papierkordel-Band.
  - Die **Höhe des Flechtmaterials** (bei Rohr: Querschnittshöhe, bei Band: Bandbreite) ist frei einstellbar, ebenso die Dicke. So lassen sich sowohl feine Rohrgeflechte als auch breite Bandgeflechte erzeugen.
- Staken sind rund.
- **Reihenaufteilung**: n Reihen mit n + 1 Spalten (auch zu Fußband und Rand), n = ⌊(nutzbare Wandhöhe − Reihenabstand) / (Materialhöhe + Reihenabstand)⌋; die Resthöhe wird gleichmäßig auf Fußband und Randwulst verteilt, damit oben und unten keine angeschnittene Reihe entsteht.
- Bindung in v1 ausschließlich **Leinwandbindung (1 über / 1 unter)**.
- Nur **rechteckige Körbe** (mit Eckenradius); der **Boden bleibt massiv**.
- **Oberer Rand**: massiver, gerundeter Abschlusswulst (optisch „Zopfrand“-ähnlich als Relief), der zugleich die Stapelkante bildet. **Unten**: massives Fußband mit Stapel-Absatz.
- Innen- **und** Außenseite zeigen das Geflecht.

**Varianten**

- **Geschlossen** (Default): Reihen liegen dicht aneinander, kaum Durchblick – stabil, für Kleinteile.
- **Offen**: Spalt zwischen den Reihen einstellbar, Durchblick zwischen Staken und Strängen – luftig, für Obst/Textilien.

**Parameter (nur im Geflecht-Modus)**

| Parameter                                               | Default                                           | Bereich    |
| ------------------------------------------------------- | ------------------------------------------------- | ---------- |
| Flechtmaterial                                          | Rohr                                              | Rohr, Band |
| Materialhöhe (Rohr-Höhe bzw. Bandbreite)                | Rohr 6 mm / Band 15 mm                            | 3–40       |
| Materialdicke                                           | Rohr 2.4 mm / Band 1.6 mm                         | 1.0–4      |
| Stakenabstand (Ziel, wird auf ungerade Anzahl gerundet) | 12 mm                                             | 6–40       |
| Stakendurchmesser                                       | 3 mm                                              | 2–8        |
| Reihenabstand (Spalt)                                   | 0 mm (geschlossen)                                | 0–10       |
| Wellen-Amplitude (Aus-/Einschwingen um Staken)          | automatisch = Stakendurchmesser/2 + Materialdicke/2 − 0,3 mm (Überlappung, damit Strang und Stake verschmelzen) | –          |

**Druckbarkeit**

- Stränge berühren/verschmelzen an jeder Kreuzung mit den Staken – das Geflecht ist **ein zusammenhängender, manifold Körper**, kein loses Teilgeflecht.
- Unterseiten der Stränge mit Querschnitt so gerundet/angefast, dass keine Überhänge > 45° entstehen; im offenen Modus sind Spalte max. 10 mm, damit kurze Überbrückungen sicher gelingen.
- Mindest-Strangdicke 1.0 mm = mind. 2 Druckbahnen bei 0.4 mm Düse.

**Zusammenspiel mit anderen Features**

- **Griffmulden**: werden aus dem Geflecht ausgeschnitten und mit einem massiven, gerundeten Rahmen eingefasst (wie ein eingeflochtener Griff).
- **Unterteilungen**: Trennwände bleiben massiv (glatt), werden an Staken/Strängen verbunden.
- **Stapeln**: unverändert über Fuß/Rand; Stapelraster bleibt = H.

**Umsetzung (technische Leitplanke)**

- Strangpfade werden als Kurven um den Korbumriss berechnet (Offset-Pfad mit sinusförmiger Normalenverschiebung, phasenrichtig an Stakenpositionen).
- Jeder umlaufende Strang wird als **geschlossenes Rohr-Mesh** (Querschnitt entlang Pfad gesweept) direkt erzeugt und als Manifold importiert, dann mit Staken, Boden und Rand vereinigt.
- Auflösung (Segmente pro mm, Querschnittspunkte) ist im Code als Qualitätsstufe einstellbar: Vorschau grob, Export fein.

**Vorschau-Darstellung**

- Im Geflecht-Modus nutzt die 3D-Ansicht ein **naturfarbenes Material** (Peddigrohr/Rattan-Ton, leichte Lichtreflexe), damit die Wirkung beurteilbar ist; Farbe hat keinen Einfluss auf den Export.

### UI-Fluss (angelehnt an Bento3D)

1. Start: Standard-Korb in der 3D-Ansicht, Maße als anklickbare Labels an den Kanten.
2. **Toolbar oben**: Parameter-Dialog · Raster-Modus · Ansicht (Einzeln / Stapel / Explosion) · Download (STL | 3MF).
3. **Maße**: Klick auf ein Maß → Eingabefeld; alternativ Slider.
4. **Raster-Modus**: Draufsicht, „+“ am rechten und unteren Rand fügt Trennwände ein; Trennwand anklicken → Position eintippen oder löschen.
5. Jede Änderung erzeugt die Geometrie neu (entprellt), die Vorschau aktualisiert sich ohne Seitenreload.
6. Download erzeugt die Datei clientseitig; Dateiname enthält die Maße, z. B. `basketli_150x100x80.stl`.

## Code Style

- TypeScript `strict`, keine `any`; Geometrie-Funktionen sind **pure** (Eingabe → Ausgabe, keine Seiteneffekte).
- Dateien `kebab-case.ts`, React-Komponenten `PascalCase.tsx`, Funktionen/Variablen `camelCase`, Konstanten `SCREAMING_SNAKE_CASE`.
- Alle Längen in **mm** als `number`; Variablennamen tragen keine Einheit, Einheit steht im Typ-Kommentar.
- Bezeichner im Code **englisch**, UI-Texte deutsch in `ui/i18n/de.ts`.
- Prettier-Default, 2 Leerzeichen, Single Quotes, Semikolons.

```ts
// src/geometry/patterns/hex.ts
import type { Manifold } from 'manifold-3d';
import type { WallFace, PatternParams } from './types';

/** Returns hex hole cutters (pointy-top, support-free) centered on a wall face. */
export function hexCutters(face: WallFace, p: PatternParams): Manifold[] {
  const pitchX = p.holeSize + p.webWidth;
  const pitchZ = (pitchX * Math.sqrt(3)) / 2;
  const area = face.usableArea(p.borderBand); // excludes rims, corners, handles

  const cols = Math.floor(area.width / pitchX);
  const rows = Math.floor(area.height / pitchZ);
  if (cols < 1 || rows < 1) return [];

  return gridCenters(area, cols, rows, pitchX, pitchZ, { staggerOddRows: true }).map((c) =>
    face.prism(hexagon(p.holeSize / 2), c),
  );
}
```

## Testing Strategy

| Ebene            | Werkzeug                    | Was                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit – Parameter | Vitest                      | Defaults, Grenzen, Clamping, URL-Roundtrip (serialize → parse = identisch)                                                                                                                                                                                                                                                                                                        |
| Unit – Geometrie | Vitest + manifold-3d (Node) | Mesh ist **manifold** (`status === NoError`), Bounding Box = Außenmaße ± 0.01 mm, Volumen plausibel, Stapelfuß passt (Fuß-Außenmaß = Rand-Innenmaß − 2·Spiel), Muster respektieren Randbänder, Trennwände an korrekter Position                                                                                                                                                   |
| Unit – Export    | Vitest                      | STL: Header, Dreieckszahl, Byte-Länge = 84 + 50·n; 3MF: gültiges ZIP mit `3D/3dmodel.model`, Vertex/Triangle-Zahl stimmt                                                                                                                                                                                                                                                          |
| Unit – Geflecht  | Vitest                      | Stakenzahl immer ungerade; Strang wechselt an jeder Stake die Seite (Vorzeichen der Normalenverschiebung alterniert); Nachbarreihen phasenversetzt; Rohr-Mesh pro Strang geschlossen & manifold; Gesamtkörper = **eine** zusammenhängende Komponente; Mindest-Wandstärke ≥ Materialdicke; Reihenaufteilung ohne angeschnittene Reihe (Rohr und Band, Materialhöhe 3 / 15 / 40 mm) |
| Snapshot         | Vitest                      | Dreiecks-/Vertex-Zahl für 5 Referenz-Konfigurationen (erkennt ungewollte Geometrieänderungen)                                                                                                                                                                                                                                                                                     |
| E2E              | Playwright (Chromium)       | Start → Maß ändern → Muster wählen → Trennwand hinzufügen → STL & 3MF herunterladen; Datei nicht leer                                                                                                                                                                                                                                                                             |
| Manuell          | PrusaSlicer / Bambu Studio  | Vor jedem Release: 3 Referenzkörbe slicen – keine Reparatur-Warnungen; 1 Stapelpaar real drucken                                                                                                                                                                                                                                                                                  |

Coverage-Ziel: **≥ 90 % für `src/geometry` und `src/export`**, UI nicht quantifiziert (über E2E abgedeckt). Tests liegen in `tests/` und `e2e/`, gespiegelt zur `src/`-Struktur.

## Boundaries

**Always**

- `npm run typecheck && npm run lint && npm test` grün, bevor committet wird.
- Geometrie-Änderungen mit einem Test belegen (TDD für `src/geometry` und `src/export`).
- Jedes erzeugte Mesh auf Manifold-Status prüfen; fehlerhafte Geometrie nie zum Download anbieten.
- Eingaben validieren und auf erlaubte Bereiche begrenzen.
- Spec aktualisieren, wenn sich Umfang oder Entscheidungen ändern.

**Ask first**

- Neue npm-Abhängigkeiten (über den Tech Stack hinaus).
- Änderungen an Parameter-Defaults/-Grenzen oder am URL-Format (bricht geteilte Links).
- Neue Features außerhalb dieses Specs (Deckel, Etiketten, Bodenmuster, Account, Galerie …).
- Hosting-/Deployment-Konfiguration, CI-Setup.

**Never**

- Code, Grafiken, Texte, Logos oder Namen von Bento3D übernehmen – nur das Bedienkonzept dient als Vorbild.
- Backend, Tracking, Analytics oder Cookies einbauen.
- Fehlgeschlagene Tests löschen, überspringen oder Schwellwerte senken ohne Rücksprache.
- Secrets/Tokens committen.

## Success Criteria

1. Für die Default-Konfiguration erscheint die erste Vorschau **< 2 s** nach Seitenaufruf (Desktop, kalter Cache ohne WASM-Download eingerechnet: < 4 s).
2. Neugenerierung nach Parameteränderung **< 500 ms** für 150×100×80 mm mit Wabenmuster und 2×2-Raster; UI friert währenddessen nicht ein.
3. Alle exportierten Meshes sind **manifold**; STL und 3MF öffnen in PrusaSlicer und Bambu Studio **ohne Reparaturhinweis**.
4. Bounding Box des Exports entspricht den eingegebenen Außenmaßen auf **± 0.05 mm**.
5. Zwei gedruckte Körbe gleicher Grundfläche stapeln **spielfrei-sicher** (rutschen nicht seitlich ab) und ergeben zusammen **2·H ± 0.5 mm**.
6. Default-Korb ist **ohne Stützmaterial** druckbar.
7. Konfiguration lässt sich per URL teilen und wird beim Laden 1:1 wiederhergestellt.
   7a. **Geflecht**: Neugenerierung in der Vorschau-Qualität **< 1 s**, Export-Qualität **< 5 s** (150×100×80 mm, Defaults). Ein Testdruck des Default-Geflechtkorbs (geschlossen und offen) gelingt **ohne Stützmaterial**, und das Über-/Unter-Flechtbild ist innen und außen klar erkennbar (Abnahme durch Sichtprüfung des Nutzers anhand Foto des Drucks).
8. Alle Commands oben laufen grün; Coverage-Ziel erreicht.

## Open Questions

1. **Boden**: In v1 geschlossen, oder auch durchbrochen (z. B. gleiches Muster) als Option?
2. **Sprache**: Nur Deutsch, oder Deutsch + Englisch von Anfang an?
3. **Hosting**: Wo soll basketli laufen (GitHub Pages, Netlify, eigener Server/Domain)?
4. **Drucker-Presets**: Soll das Bauvolumen (z. B. 256³ mm Bambu, 250×210 Prusa MK4) als Grenze/Warnung berücksichtigt werden?
5. **Griffmulden**: Feste Maße wie oben ok, oder sollen Breite/Höhe einstellbar sein?
6. **Raster-Unterteilungen**: Nur durchgehende Trennwände (wie Bento-Grundraster), oder auch Zusammenführen einzelner Zellen?
7. **Lizenz** des Projekts (z. B. MIT) und der erzeugten Modelle?

## Entschieden

- 2026-11-01 · Bindung: nur Leinwandbindung (1/1); Höhe des Flechtmaterials einstellbar, Flechtmaterial Rohr **oder Band**.
- 2026-11-01 · Boden bleibt massiv (auch im Geflecht-Modus).
- 2026-11-01 · Nur rechteckige Körbe (mit Eckenradius), keine runden/ovalen.
