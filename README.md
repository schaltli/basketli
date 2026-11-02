# basketli

Stapelbare, 3D-druckbare Körbe im Browser entwerfen: Maße einstellen, Wandstil wählen
(Streckmetall, Waben, Voronoi, Geflecht geschlossen oder offen) und als STL oder 3MF
herunterladen. Alle Modelle sind ohne Stützmaterial druckbar und lassen sich stilübergreifend
stapeln.

Die App läuft komplett im Browser: kein Server, kein Konto, keine Cookies, kein Tracking.
Jede Einstellung steht im Link, so lässt sich ein Korb einfach teilen.

## Entwickeln

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run lint
npm test           # Unit-Tests (Vitest)
npm run e2e        # Browser-Tests (Playwright)
npm run build      # statische Seite in dist/
```

Spezifikation: [SPEC.md](SPEC.md) · Aufgaben: [tasks/](tasks/)

## Veröffentlichen

Jeder Push auf `main` prüft (Typecheck, Lint, Tests), baut und veröffentlicht die Seite über
GitHub Actions auf GitHub Pages (`.github/workflows/deploy.yml`). Die Seite nutzt relative
Pfade und läuft deshalb unter `/basketli/` wie auch später auf einer eigenen Domain.

## Lizenz

[MIT](LICENSE)
