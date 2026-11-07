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
2. Ich wähle einen **Wandstil**: Streckmetall (Standard), Waben, Voronoi, Geflecht geschlossen, Geflecht offen oder Geflecht 45°, und passe seine Parameter an.
   2a. Alternativ wähle ich ein **Flechtmuster**: Der Korb sieht aus wie echt geflochten – Flechtstränge laufen sichtbar abwechselnd über und unter den senkrechten Staken, mit echter 3D-Tiefe innen und außen.
3. Bei Bedarf bekommt der Korb an einer oder beiden Stirnseiten einen **Griff**: eine Aussparung von oben (z. B. wenn der Korb als Schublade ein Fach ganz füllt) oder ein geschlossenes **Griffloch** unter dem Rand.
4. Ich **unterteile** den Korb über ein Raster mit „+“-Buttons am rechten und unteren Rand in Fächer; ich kann Trennwände verschieben (Maß eintippen) und wieder entfernen.
5. Ich stelle ein, ob der Korb **stapelbar** ist. (Eine Stapel-/Explosionsvorschau entfällt, Entscheid 2026-11-02: das Stapeln wird stattdessen automatisch für alle Stil-Kombinationen nachgemessen.)
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
    patterns/      → Wandstile mit Löchern (hex, voronoi, expanded) + gemeinsame Werkzeuge
    weave/         → Flechtmuster: Staken, Flechtstrang-Pfade, Rohr-Mesh-Erzeugung
    handles.ts     → Griffaussparung (Ausschnitt von oben, Rahmen)
    dividers.ts    → Trennwände aus dem Raster
    build.ts       → Orchestrierung: params → Manifold-Mesh
  worker/          → Web Worker, ruft geometry/build auf, liefert Mesh-Buffer
  export/          → stl.ts, threemf.ts (reine Funktionen: Mesh → Uint8Array)
  state/           → zustand-Store, URL-Serialisierung der Parameter
  ui/
    viewer/        → 3D-Szene, Kamera, Maß-Overlays
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

| Parameter               | Default      | Bereich                                                                                                            | Hinweis                                                                                                                                 |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Breite (X, außen)       | 150 mm       | 30–400                                                                                                             |                                                                                                                                         |
| Tiefe (Y, außen)        | 100 mm       | 30–400                                                                                                             |                                                                                                                                         |
| Höhe (Z, außen)         | 80 mm        | 20–300                                                                                                             | = Stapelraster (s. u.)                                                                                                                  |
| Wandstärke              | 1.6 mm       | 0.8–5                                                                                                              | sinnvoll: Vielfache der Linienbreite                                                                                                    |
| Bodenstärke             | 1.2 mm       | 0.6–5                                                                                                              |                                                                                                                                         |
| Eckenradius (außen)     | 10 mm        | 0–30                                                                                                               |                                                                                                                                         |
| Stapelbar               | an           | an/aus                                                                                                             |                                                                                                                                         |
| Stapelspiel             | 0.3 mm       | 0.1–1.0                                                                                                            | Toleranz zwischen Absatz und Rand                                                                                                       |
| Wandstil                | Streckmetall | Streckmetall, Waben, Voronoi, Geflecht (geschlossen / offen), Geflecht 45°                                         | Geflecht: eigene Parameter, s. u.                                                                                                       |
| Lochgröße               | 10 mm        | 3–40                                                                                                               |                                                                                                                                         |
| Stegbreite              | 2.5 mm       | 1–10                                                                                                               |                                                                                                                                         |
| Randband oben/unten     | 4 mm         | 3–30                                                                                                               | massive Zone ohne Löcher                                                                                                                |
| Griffe                  | keine        | keine / eine Stirnseite / beide Stirnseiten; Griffart Aussparung von oben (Standard) oder Griffloch                | Aussparung: Breite 60 mm (30–120), Tiefe 20 mm (10–40). Griffloch: Breite 80 mm (40–120), Höhe 25 mm (15–40), Steg darüber 15 mm (8–30) |
| Beschriftungsfeld       | keines       | keines / Stirnseite / Längsseite; Vertiefung für Beschriftungsband keine / 6 / 9 / 12 / 18 / 24 mm                 | Breite 60 mm (20–150), Höhe 20 mm (8–60), Eckenradius 3 mm (0–15)                                                                       |
| Unregelmäßige Oberkante | aus          | aus / ein: Höhe in jeder der vier Ecken, Bearbeitung auch im Modell (Modus „Form“)                                 | je Ecke 20–300 mm; jede Wand höchstens 45° steil; nicht stapelbar                                                                       |
| Unterteilungen          | keine        | durchgehende Trennwände in Breite und Tiefe, Position in mm (Mitte, vom linken/vorderen Außenrand), Fächer ≥ 10 mm | Höhe: so hoch wie möglich (0,5 mm unter dem Fuß eines aufgesetzten Korbs) oder eingestellt                                              |

Ungültige Kombinationen (z. B. Griffmulde breiter als die Wand, Lochgröße größer als die freie Wandfläche) werden **im UI abgefangen**: Wert wird begrenzt und ein Hinweis angezeigt – keine Abstürze, keine kaputten Meshes.

### Wandstile (Entscheidung 2026-11-01)

Angeboten werden: **Streckmetall** (Standard), **Waben**, **Voronoi**, **Geflecht geschlossen**, **Geflecht offen**, **Geflecht 45°**. Schlitze und Rauten entfallen. Die glatte Wanne bleibt intern als Basis und Prüfkörper.

### Stapel-Geometrie

- **Anforderung (2026-11-01): Alle Körbe gleicher Grundfläche (Breite × Tiefe × Eckenradius) sind untereinander stapelbar – unabhängig vom Wandstil.**
- **Gewählt: Fuß auf Wandkante.** Gemeinsame Schnittstelle aller Wandstile:
  - **Fuß:** die untersten 3 mm sind rundum um 4 mm + Stapelspiel (Default 0,3 mm) eingezogen.
  - **Schulter:** darüber führt eine 45°-Fase zur vollen Außenkontur (stützfrei druckbar); der Bereich bis zum Fasenende ist ein massiver Sockel. Innen läuft der Sockel parallel zur Außenfase mit 45° vom Boden zur Wand hinaus (kein waagrechter Absatz); oben ist er so breit, wie die Wand nach innen reicht, mindestens 1,6 mm.
  - **Oben kein zusätzlicher Rand.** Keine Wand reicht an der Oberkante mehr als 4 mm nach innen (Regel in `clampParams`, passt Verdrehung, Stakendurchmesser, Materialdicke bzw. Wandstärke an), daher passt jeder Fuß in jede Öffnung.
  - **Eckenradius** bei stapelbaren Körben mindestens 10 mm für alle Stile (gleiche Eingabe → gleiche Kontur, sonst klemmen die Ecken).
- Der obere Korb liegt mit der Fase auf der **Innenfase** der Wand darunter (beide 45°, also flächig) und zentriert sich dabei selbst. Das Stapelmaß hängt deshalb von der Wanddicke des unteren Korbs ab: **Stapelmaß = H − 3 mm − (4,3 mm − Wanddicke oben) − Kantenfase oben**. Bei H = 50 mm: Geflecht unten 45,75 mm, Streckmetall 45,0 mm, Waben/Voronoi 43,9 mm. (Korrektur 2026-11-01: „2·H“ bzw. „H − 3 mm“ sind ohne Überhang nicht erreichbar; 2026-11-03: Kantenfasen.)
- **Kantenfasen (2026-11-03):** Die untere Außenkante (bei stapelbaren Körben die des Fußes) ist mit 1 mm × 45° angefast – gegen Elefantenfuß und als Einführhilfe beim Stapeln. Die Oberkanten von Rand (innen und außen) und Trennwänden sind mit 45° angefast, min(0,5 mm, ¼ Wanddicke), damit mindestens die halbe Oberkante eben bleibt. Wo eine Trennwand bis oben reicht, bleibt der Rand über ihr ungefast; an Kreuzungen laufen die Fasen nicht durch die querende Wand. Geflochtene Trennwände behalten ihr eigenes Abschlussband.
- Muster (Löcher, Bänder) beginnen erst über dem Sockel.

### Wandmuster

- **Waben** (Hex-Löcher): sechseckige Löcher **mit Spitze nach oben** (Oberkanten 30°: jede Druckbahn wird pro Schicht nur ~0,35 mm in Laufrichtung verlängert → keine Brücke), versetzte Reihen, **umlaufend ohne Naht** wie Voronoi (periodisch auf der abgewickelten Außenwand, Löcher folgen der Eckenrundung). Lochgröße = Schlüsselweite (Breite über die Flächen), Stege mindestens die Stegbreite. Mindest-Eckenradius 8 mm.
- **Voronoi**: echte, unregelmäßige Voronoi-Zellen (Punkte auf einem zufällig verschobenen Raster, reproduzierbar per Startwert), umlaufend ohne Naht um den ganzen Korb (periodisch auf der abgewickelten Außenwand, Löcher folgen der Eckenrundung). Stege exakt so breit wie eingestellt, Lochecken gerundet (12 % der Zellgröße, max. 1,5 mm). Druckbar ohne Stützen: In der dünnen Wand laufen die Druckbahnen längs der Wand – schräge Lochoberkanten verlängern die Bahnen nur in Laufrichtung. Ein Scan von oben nach unten verkleinert jedes Loch nur dort, wo sich eine Seite pro 0,2-mm-Schicht um mehr als ~0,35 mm (flacher als 30°, wie die Wabenspitzen) schließen müsste; die letzte Öffnung oben schließt als kurze Brücke (höchstens 4 mm). Flache Zelloberkanten werden so zu schiefen Giebeln. (Korrektur 2026-11-07: vorher 8° und 13 mm – das hält nicht jeder Drucker; Ziel ist Druckbarkeit auf praktisch jedem Drucker ohne Stützen.) Löcher werden nur kleiner, nie größer. Mindest-Eckenradius 8 mm (Stege innen ≥ 80 %). Parameter: Zellgröße 6–12 mm (Default 12), Stegbreite, Startwert („neu würfeln“). (Entscheidung 2026-11-01: der frühere 45°-Flachschnitt machte alle Zellen oben flach – verworfen.)
- **Streckmetall** (Prototyp 2026-11-01, überarbeitet nach Vergleich mit echtem Streckmetall): Die Wand besteht aus **zwei Scharen durchgehender Schrägstege** („/“ und „\“), die sich in Knoten kreuzen; dazwischen bleiben **stehende Rauten** (lange Diagonale senkrecht → oben spitz, keine Brücke). Teilung exakt so, dass parallele Rautenkanten genau eine Stegbreite auseinanderliegen; umlaufend ohne Naht (Stege winden sich schraubenförmig um den Korb, auch durch die Ecken) und enden in den Randbändern. **Jeder Steg ist einzeln um seine Achse verdreht**: obere Kante nach außen, untere nach innen; die Verdrehung wird so begrenzt, dass die Außenfläche nie flacher als 45° überhängt. Parameter: Rautenbreite 3–15 mm (5), Rautenhöhe 6–40 mm (12, mind. 1,5 × Breite), Stegbreite 1–4 mm (1,6), Verdrehung 0–2 mm (0,6). Mindest-Eckenradius 8 mm. (Verworfen: Linsen-Löcher und Sägezahn-Relief über ganze Reihen.)
- **Geflecht 45°** (2026-11-07): Zwei Scharen **flacher Bänder gleicher Breite** („/“ und „\“, je 45° geneigt) in **Leinwandbindung** (über eins, unter eins), ohne Staken. Jedes Band bleibt über seine Breite flach; sein Versatz senkrecht zur Wand wechselt sanft von Kreuzung zu Kreuzung zwischen außen und innen (Steigung ≪ 45°). An jeder Kreuzung überlappen die beiden Bänder radial um 0,3 mm und verschmelzen. Alle Bandkanten und alle Lücken (auf der Spitze stehende Quadrate) laufen unter 45°, im Geflecht selbst gibt es **keine Brücken**. Umlaufend ohne Naht (gerade Bandzahl je Schar, Teilung leicht gestreckt, Verhältnis Breite : Abstand bleibt). Die Randbänder enden **auf halber Höhe zwischen zwei Lückenreihen** (Lücken und Kreuzungen liegen abwechselnd auf denselben Reihen): Ist das Band mindestens so breit wie der Abstand, ist das Geflecht dort geschlossen und das obere Randband liegt ohne Brücke auf; sonst überbrückt es nur die schmalste Stelle der Lücken, (Abstand − Breite)/√2. Lückenspitzen, die eine Randkante in einem Punkt berühren würden, werden um 0,3 mm verschoben. Das obere Randband wächst aus dem 0,3 mm breiten Kern, den jedes Band in jeder Lage abdeckt, unter 45° zur vollen Wandstärke. Wandstärke = 2 × Banddicke − 0,3 mm. Parameter: Bandbreite 4–20 mm (8), Banddicke 0,8–2 mm (1), Bandabstand 0–10 mm (2; 0 = dicht), Randband. Mindest-Eckenradius 8 mm. Trennwände nur glatt (Anschluss-Steg wie beim Streckmetall).
- Muster werden je Wandfläche **zentriert** und halten Randbänder und Ecken (≥ Eckenradius + Steg) frei; an der Griffaussparung werden Löcher am Band angeschnitten.

### Flechtmuster (Wandstil „Geflecht“)

Ziel: Der Korb soll **aussehen wie ein echter Flechtkorb**, mit dünnen Bändern, die sich um runde Staken winden, und **ohne Stützmaterial** druckbar sein.

> **Entscheidungen 2026-11-01**
>
> 1. Prototyp 1 (ovale, frei geführte Stränge): nicht druckbar.
> 2. Prototyp 2 (Relief-Wand ohne Brücken): druckbar, sah aber nicht nach Korb aus.
> 3. Prototyp 3 (Referenz-Prinzip mit Kordelrand): besser, aber Bänder zu dick, Kordel überzeugte nicht.
> 4. **Gewählt (Nutzer-Vorgabe):** keine Kordel; Bänder stehen auf der Grundplatte. Die **erste Schicht jedes Bandes ist genau eine Extrusion**, die als Brücke von Stake zu Stake läuft und **beide Staken schneidet** (nicht nur berührt). Ab der zweiten Schicht wird das Band nach innen und außen breiter.

**Aufbau**

- **Grundplatte**: massiver Boden über die ganze Grundfläche (Bodenstärke).
- **Staken**: senkrechte, runde Stäbe auf der Wandmitte, von der Grundplatte bis in das Abschlussband (sie enden unter dessen Fase).
- **Bänder**: Jede Reihe ist ein geschlossenes Band, das sich abwechselnd vor und hinter den Staken entlangschlängelt (Leinwandbindung 1 über / 1 unter); Nachbarreihen um eine Stake versetzt. Die Mittellinie des Bandes läuft **durch** jede Stake (0,1 mm innerhalb ihrer Oberfläche), das Band selbst deckt die Stake auf der jeweiligen Seite ab.
- **Bandquerschnitt** (senkrecht zum Band gemessen):
  - Schicht 1 (0,2 mm): **eine Linie, 0,45 mm breit** – die Brücke von Stake zu Stake.
  - darüber: wächst unter **45° nach innen und außen** bis zur vollen Banddicke (Schicht 2 hat damit zwei Linien).
  - oben: **Außenseite 45° angefast** (halbe Banddicke), Innenseite senkrecht.
- **Abschlussband**: glatter, nicht gewellter Ring über die volle Wandstärke (außen bündig mit der Kontur, innen bündig mit den Staken), Höhe einstellbar. Erste Schicht: eine Linie auf der Wandmitte, also durch jede Stake, als Brücke von Stake zu Stake; darüber 45° auf volle Breite; oben außen 45° angefast wie die Bänder. Der obere Korb liegt beim Stapeln auf seiner Innenfase. Stakenzahl **gerade** (geschlossene Ringe ohne Naht).
- **Reihenaufteilung**: Die Reihen füllen die Wand von der Grundplatte (bzw. dem Sockel) bis zum Abschlussband exakt, beim offenen Geflecht mit einem Reihenabstand auch unter dem Abschlussband; die Bandhöhe wird dafür leicht angepasst (ganze Zahl Reihen, möglichst nah an der eingestellten Materialhöhe).
- **Flechtmaterial** Rohr / Band unterscheidet sich in Höhe und Dicke.
- Bindung in v1 ausschließlich **Leinwandbindung**. Nur **rechteckige Körbe** mit Eckenradius.
- **Stapeln** beim Geflecht: offen (der frühere Kordelrand als Stapelkante entfällt) – wird mit T10 neu geklärt.

**Varianten**

- **Geschlossen** (Default): Reihen direkt übereinander.
- **Offen**: Spalt zwischen den Reihen; die Bänder hängen nur an den Staken.

**Parameter (nur im Geflecht-Modus)**

| Parameter                                                                | Default                                        | Bereich    |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ---------- |
| Flechtmaterial                                                           | Rohr                                           | Rohr, Band |
| Materialhöhe (Bandhöhe, Zielwert)                                        | Rohr 6 mm / Band 9 mm                          | 3–40       |
| Materialdicke                                                            | Rohr 1.2 mm / Band 0.8 mm                      | 0.8–4      |
| Stakenabstand (Ziel, gerade Anzahl; tatsächlich ≤ 15 mm − Materialdicke) | 12 mm                                          | 6–15       |
| Stakendurchmesser                                                        | 3 mm                                           | 2–8        |
| Reihenabstand (Spalt)                                                    | 0 mm (geschlossen)                             | 0–10       |
| Abschlussband (Höhe; höchstens die halbe Flechtwand)                     | 5 mm                                           | 3–10       |
| Auslenkung um die Staken                                                 | automatisch = Stakenradius − 0,225 mm − 0,1 mm | –          |

**Druckbarkeit (verbindlich, automatisch geprüft)**

- Jeder Körper wird **Schicht für Schicht (0,2 mm)** geschnitten. Jeder Teil einer Schicht muss entweder innerhalb **45°** von der Schicht darunter getragen sein **oder** eine **Brücke** sein: an mindestens zwei getrennten Stellen **in** die Schicht darunter hineinlaufend (je ≥ 0,08 mm² Überlappung – bloßes Berühren zählt nicht) und **höchstens 15 mm** lang. Eine Brücke darf aus einer einzigen Extrusionslinie bestehen. Frei schwebende Teile zählen immer als Fehler; einseitige Überhänge schmaler als 0,2 mm werden ignoriert.
- Der Korb ist **ein zusammenhängender, manifold Körper**.

**Zusammenspiel mit anderen Features**

- **Griffaussparung**: Zuerst wird ein U-förmiger Ausschnitt von oben ausgestanzt (unten Radius 8 mm, oben abgerundet mit 4 mm), ohne Überhang. Dann schließt ein 3 mm breites Band, das der Kontur folgt, die Schnittkanten. Seine Unterkante folgt der Rundung bis 45° und läuft darunter mit 45° in eine waagrechte Brücke aus (kein flacherer Überhang). Waben/Voronoi: Zellen, die das Band erreichen, werden daran angeschnitten (nicht aufgefüllt) und wie jede Zelle druckbar gemacht. Streckmetall/Geflecht: das Band ist ein massiver Körper über die ganze Wandstärke; seine erste Schicht ist eine Linie durch die Wandmitte, darüber wächst es pro Schicht um 45°; beim Geflecht endet die waagrechte Unterkante in der nächsten Stake und steigt von dort mit 45° zur Seite. Stirnseiten = die kürzeren Wände; „eine Stirnseite“ nimmt die bei +x (bzw. +y). Die Aussparung liegt im geraden Teil der Stirnwand (Band + 5 mm Abstand zur Ecke) und über dem Sockel; sonst wird sie begrenzt oder abgeschaltet und gemeldet. Ein gestapelter Korb liegt an der Aussparung nicht auf, trägt aber über die übrige Kante unverändert.
- **Beschriftungsfeld**: massives Feld (abgerundetes Rechteck) in der Wand, auf dem geraden Teil der Stirn- oder Längsseite (Abstand 3 mm zu Eckenrundung, Randbändern und Griffrahmen), waagrecht mittig, senkrecht mittig im Musterbereich. Stirnseite = die +x- (bzw. +y-)Seite; bei einem Griff die andere Stirnseite, bei Griffen an beiden Stirnseiten unter dem Griff. Längsseite = Vorderseite (bzw. +x bei tiefen Körben). Waben/Voronoi: Zellen werden am Feld angeschnitten und wie jede Zelle druckbar gemacht. Streckmetall/Geflecht: das Feld ist ein Körper über die ganze Wandstärke, außen bündig; seine erste Schicht ist eine Linie durch die Wandmitte, darüber wächst es pro Schicht um 45°. Die untere Kante folgt der Eckenrundung bis 45° und läuft dann mit 45° in die waagrechte Unterkante; diese endet in der nächsten Stütze darunter (Steg/Band): liegt die nach innen näher, wird die Ecke stärker mit 45° gefast, sonst ragt eine kleine 45°-Nase bis zur äußeren Stütze. Optional eine **Vertiefung für Beschriftungsband** (P-touch TZe 6–24 mm): 0,4 mm tief, Bandbreite + 0,6 mm hoch, mittig, mind. 1,5 mm Rand; die Oberkante steigt mit 45° nach außen (kein Überhang). Das Band liegt versenkt und löst sich nicht an den Kanten. Ist das Feld zu niedrig, wird es erhöht, sonst das breiteste passende Band gewählt; passt kein Feld auf die Wand, entfällt es (mit Hinweis).
- **Unregelmäßige Oberkante** (2026-11-07, für Schränke mit schräger Decke oder Rückwand, z. B. im Camper): In jeder Ecke des Grundrisses wird die verfügbare Höhe gemessen. Die Oberkante verläuft dazwischen bilinear, also auf jeder Wand und jeder Trennwand gerade von Ecke zu Ecke; jede Wand steigt höchstens 45°. Die Höhe des Korbs ist die höchste Ecke. Stapeln ist ausgeschlossen. Aufbau: Der Korb wird waagrecht in voller Höhe gebaut (mit Kantenfasen), dann wird das Randband samt Fasen und Trennwandköpfen an jeder Stelle senkrecht auf die gemessene Höhe abgesenkt; darunter wird geschnitten. Quer durch die Wand gilt dabei die Höhe der Außenkante (Unterkante des Rands quer zur Wand waagrecht). Waben/Voronoi: Löcher werden unter dem schrägen Rand angeschnitten und wie jede Zelle druckbar gemacht. Streckmetall/Geflecht: Unter dem Rand liegt ein Sockelband mit gestufter Unterkante (Stufen 1 mm), jede Stufe endet auf einer Stütze, die durch die ganze Stufenhöhe reicht (Stake, Knoten); in der Wand endet das Muster waagrecht auf diesen Stufen. Das Sockelband wächst wie das Griffband aus einer Linie in der Wandmitte mit 45° zur vollen Wandstärke. Griffe (Aussparung und Griffloch) und das Beschriftungsfeld sitzen an der örtlichen Höhe ihrer Wand; die gerundeten Oberkanten der Aussparung folgen der Schräge. Trennwände reichen bis unter die schräge Oberkante. Bedienung: Schalter „Unregelmäßige Oberkante“ (startet waagrecht auf der bisherigen Höhe), vier Eckhöhen im Panel; im Modus „Form“ Anfasser an jeder Ecke (Höhe der Ecke) und in der Mitte jeder Oberkante (beide Ecken gemeinsam, mit Umschalttaste um die Mitte kippen). Beim Ziehen zeigt eine Linie die neue Oberkante, der Korb wird beim Loslassen neu berechnet; ein Klick öffnet die Zahl.
- **Unterteilungen**: Trennwände tragen das Muster des Korbs. Waben/Voronoi: Löcher je Trennwand-Abschnitt (zwischen Wand und Kreuzungen), ganze zentrierte Waben bzw. ein eigenes Voronoi-Feld; Streckmetall: Fenster je Abschnitt mit eingesetzter Streckmetall-Fläche; Geflecht: gewebte Trennwand mit Staken an den Enden (= Wand-Staken am Anschluss), an jeder Kreuzung und dazwischen, Bändern ab der Grundplatte und Abschlussband. Rand- und Anschluss-Stege wie in der Wand.
- **Anschluss an die Wand**: Das Wandmuster geht pro Fach auf. Unterhalb der Trennwand-Oberkante bleibt an jedem Anschluss ein Steg von 2 × Wandstärke (mind. Trennwanddicke) frei, darüber läuft das Muster über den Anschluss weiter (Kamm). Waben: Teilung je Abschnitt leicht gestreckt, eine Wabe mittig auf jedem Anschluss, Zellen am Steg angeschnitten; Streckmetall: Knoten auf den Anschlüssen, Streben enden unten im Steg; Voronoi: Kamm zuerst freigehalten, die Zellen füllen den Rest; Geflecht: Stake an jedem Anschluss, gerade Gesamtzahl.

**Umsetzung (technische Leitplanke)**

- Bänder als Höhenfeld-Schalen entlang der Wandmitte (Profil aus 5 Höhenstufen, Dicke auf den Wellenschrägen senkrecht zum Band ausgeglichen); Staken als Zylinder; Grundplatte als Extrusion; Batch-Union.
- Export wird auf 0,02 mm vereinfacht (`simplify`).

**Vorschau-Darstellung**

- Im Geflecht-Modus nutzt die 3D-Ansicht ein **naturfarbenes Material** (Rattan-Ton); die Farbe hat keinen Einfluss auf den Export.

### UI-Fluss (angelehnt an Bento3D)

1. Start: Standard-Korb in der 3D-Ansicht, Maße als anklickbare Labels an den Kanten.
2. **Toolbar oben**: Parameter-Dialog · Raster-Modus · Download (STL | 3MF).
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

| Ebene            | Werkzeug                    | Was                                                                                                                                                                                                                                                                                                                                |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit – Parameter | Vitest                      | Defaults, Grenzen, Clamping, URL-Roundtrip (serialize → parse = identisch)                                                                                                                                                                                                                                                         |
| Unit – Geometrie | Vitest + manifold-3d (Node) | Mesh ist **manifold** (`status === NoError`), Bounding Box = Außenmaße ± 0.01 mm, Volumen plausibel, Stapelfuß passt (Fuß-Außenmaß = Rand-Innenmaß − 2·Spiel), Muster respektieren Randbänder, Trennwände an korrekter Position                                                                                                    |
| Unit – Export    | Vitest                      | STL: Header, Dreieckszahl, Byte-Länge = 84 + 50·n; 3MF: gültiges ZIP mit `3D/3dmodel.model`, Vertex/Triangle-Zahl stimmt                                                                                                                                                                                                           |
| Unit – Geflecht  | Vitest                      | Stakenzahl immer gerade; Reihe wechselt an jeder Stake die Seite; Nachbarreihen phasenversetzt; Bänder senkrecht, berühren jede Stake; Druckbarkeitstest (45° / Brücke ≤ 15 mm) grün; Gesamtkörper = **eine** zusammenhängende Komponente; Reihenaufteilung ohne angeschnittene Reihe (Rohr und Band, Materialhöhe 3 / 15 / 40 mm) |
| Snapshot         | Vitest                      | Dreiecks-/Vertex-Zahl für 5 Referenz-Konfigurationen (erkennt ungewollte Geometrieänderungen)                                                                                                                                                                                                                                      |
| E2E              | Playwright (Chromium)       | Start → Maß ändern → Muster wählen → Trennwand hinzufügen → STL & 3MF herunterladen; Datei nicht leer                                                                                                                                                                                                                              |
| Manuell          | PrusaSlicer / Bambu Studio  | Vor jedem Release: 3 Referenzkörbe slicen – keine Reparatur-Warnungen; 1 Stapelpaar real drucken                                                                                                                                                                                                                                   |

Coverage-Ziel: **≥ 90 % für `src/geometry` und `src/export`**, UI nicht quantifiziert (über E2E abgedeckt). Tests liegen in `tests/` und `e2e/`, gespiegelt zur `src/`-Struktur.

## Boundaries

**Always**

- `npm run typecheck && npm run lint && npm test` grün, bevor committet wird.
- Geometrie-Änderungen mit einem Test belegen (TDD für `src/geometry` und `src/export`).
- Jedes erzeugte Mesh auf Manifold-Status prüfen; fehlerhafte Geometrie nie zum Download anbieten.
- Jeder Wandstil und jede Feature-Kombination besteht den Schicht-für-Schicht-Druckbarkeitstest (45° oder beidseitig eindringende Brücke ≤ 15 mm).
- Bei durchbrochenen dünnen Wänden (Lochmuster, Voronoi) gilt zusätzlich: Ein einseitiges Teilstück **innerhalb der Wandebene** ist zulässig, wenn es höchstens 2 mm über seinen Anker hinausreicht (Bahnverlängerung in Laufrichtung). Seitlich aus der Wand ragende Überhänge bleiben verboten.
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
5. ~~Griffmulden: feste Maße?~~ Entschieden 2026-11-02, s. u.
6. ~~Raster-Unterteilungen~~: entschieden 2026-11-02 – nur durchgehende Trennwände.
7. **Lizenz**: Projekt MIT (entschieden 2026-11-02). Offen: Hinweis zu den erzeugten Modellen?

## Entschieden

- 2026-11-01 · Bindung: nur Leinwandbindung (1/1); Höhe des Flechtmaterials einstellbar, Flechtmaterial Rohr **oder Band**.
- 2026-11-01 · Boden bleibt massiv (auch im Geflecht-Modus). (Ergänzt 2026-11-02: optional durchbrochen, s. u.)
- 2026-11-01 · Nur rechteckige Körbe (mit Eckenradius), keine runden/ovalen.
- 2026-11-02 · Boden wahlweise durchbrochen (z. B. für Kühlboxen): geschlossen (Standard), Waben, Voronoi, Rauten, Langlöcher; frei wählbar unabhängig vom Wandstil, eigene Lochgröße (8 mm, 4–30) und Stegbreite (3 mm, 1,5–10). Muster pro Fach zentriert (Waben/Rauten/Langlöcher zunächst nur ganze Löcher, Langlöcher längs der längeren Fachseite, Voronoi füllt das Fach); unter Trennwänden und am Rand (innerhalb Wand bzw. Sockelring plus ein Steg) bleibt der Boden massiv. Kein geflochtener Boden (Schichtlinien). (Ergänzt 2026-11-02: Muster füllen das Fach bis auf einen Steg zum Rand wie an der Wand: Waben und Rauten laufen bis zum Fachrand und werden dort angeschnitten (zu dünne Reste bleiben massiv), Langlöcher bleiben ganz, werden verlängert und quer verteilt.)
- 2026-11-02 · Glatte Außenwand als eigener Wandstil („Glatt“). Trennwände wahlweise mit Muster (Geflecht: geflochten) oder glatt; beim Einfügen der ersten Trennwand: geflochten bei Geflecht-Körben, sonst glatt (danach frei umstellbar).
- 2026-11-02 · Trennwände: Muster pro Fach ausrichten, Trennwände mit Wandmuster, Höhe einstellbar (Standard so hoch wie möglich), nur durchgehende Trennwände; Anschluss-Steg 2 × Wandstärke, nur bis zur Trennwand-Oberkante.
- 2026-11-02 · Veröffentlichung auf GitHub Pages aus einem öffentlichen Repository `basketli`, Lizenz MIT. Eigene Domain (z. B. `basketli.ch`) später möglich; die Seite nutzt relative Pfade.
- 2026-11-02 · Griffe: geschlossene Griffmulden entfallen (flache Überhänge, für Regalkörbe unnötig). Stattdessen optional eine Griffaussparung von oben (keine / eine / beide Stirnseiten, Standard keine), Breite und Tiefe einstellbar. Gedacht für Körbe, die als Schublade ein Fach füllen.
- 2026-11-02 · Griffe: zusätzlich ein geschlossenes **Griffloch** (echtes Langloch mit runden Enden, waagrechte Oberkante) unter einem massiven Steg. Damit der Steg ohne Stützmaterial im Slicer druckbar ist, sind **Stützrippen ins Modell eingebaut**: senkrechte Rippen (0,8 mm, über die ganze Wandstärke) im Loch, höchstens 12 mm auseinander, äußerste an den Mittelpunkten der runden Enden. Oben und unten hängen sie nur an einem 0,4 mm breiten Hals (Sollbruchstelle) und werden nach dem Druck herausgebrochen. Über den runden Enden laufen die Wandlinien nur in der Wandebene weiter (≤ 2 mm pro Schicht). Rahmen und Steg wie bei der Aussparung (3-mm-Band, offene Wände: massiv über die ganze Wandstärke).
- 2026-11-02 · Vorerst kein CAD-Export (STEP). Falls später gewünscht: STEP aus Facetten mit zusammengefassten ebenen Flächen (ohne neue Abhängigkeit); echte CAD-Flächen (z. B. OpenCascade) stehen in keinem Verhältnis zum Aufwand. Für Fusion genügt bis dahin 3MF → „Netz konvertieren“.
- 2026-11-02 · Keine Stapel-/Explosionsansicht (T17 entfällt). Stattdessen misst ein Test für jede Kombination aus unterem und oberem Wandstil (100×100×100 mm, Export-Qualität) nach: Auflage genau beim Stapelmaß (±0,05 mm) und Fuß ohne Klemmen (0,3 mm angehoben seitlich ±0,25 mm frei).
- 2026-11-02 · Geflecht bekommt ein glattes Abschlussband (Variante 1), neuer Parameter Abschlussband 5 mm (3–10).
- 2026-11-07 · Beschriftungsfeld: Stirn- oder Längsseite, Größe und Eckenradius wählbar, optional versenkte Vertiefung für Beschriftungsband (P-touch). Voronoi-Löcher druckbar auf praktisch jedem Drucker: Oberkanten mind. 30°, Brücke oben höchstens 4 mm (vorher 8° / 13 mm).
- 2026-11-07 · Unregelmäßige Oberkante: vier Eckhöhen (bilinear), Bearbeitung numerisch und mit Anfassern im Modell (Modus „Form“), Griffe beider Arten und Trennwände folgen der Schräge, nicht stapelbar.
