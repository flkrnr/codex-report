# Codex Report für Raycast (lokaler MVP)

Voraussetzungen: macOS, Raycast und Node.js >= 20.

Im Ordner `raycast`:

```sh
npm install
npm run dev
```

Danach Raycast öffnen und **Show Codex Report** suchen. `ray develop` importiert
 die Erweiterung lokal und lädt Änderungen automatisch neu. Nach Ctrl+C bleibt
 der zuletzt gebaute Befehl in Raycast verfügbar. Keine Veröffentlichung nötig.

- ⌘1: heute, ⌘2: aktuelle Woche ab Montag, ⌘3: aktueller Monat
- ⌘R: erneut auswerten
- ⌘K: Actions, darunter Nachrichten/Tokens wechseln und JSON kopieren

Alle Zeiträume verwenden die lokale Zeitzone. Standard ist die aktuelle Woche.
Die Kosten sind die bestehende CLI-API-Schätzung, keine Abo-Abrechnung.
Der Cache-Anteil bezieht sich auf Input-Tokens. Projekte werden nach Sessions,
Modelle nach Tokens sortiert. Diagramme sind SVG-Bilder ohne Hover-Interaktion.

`prepare.mjs` kopiert den vorhandenen CLI als Asset und merkt sich den lokalen
Node-Pfad. Nach einem Node-Wechsel oder CLI-Änderungen `npm run dev` neu starten.
Es gibt keinen zweiten Parser und keinen Server. Die Erweiterung verwendet den
bestehenden Cache in `~/.codex/cache` (bzw. dem bestehenden CLI-Codex-Verzeichnis).
Ein kalter Scan kann wie im CLI länger dauern. Beim Refresh bleibt der vorherige
Report sichtbar; nach einem Fehler wird er ausdrücklich als alter Stand markiert.
Die angezeigte Laufzeit umfasst CLI-Start und Auswertung, nicht Raycasts Rendering.

Prüfung: `npm run build` und `npm run typecheck`.

## Explore (English UI)

The dashboard stays the entry point. Native searchable lists show details without
re-reading session logs:

- ⌘M: Models, sortable by tokens or recorded turns
- ⌘E: Estimated API Costs, including explicitly unpriced models
- ⌘I: Reasoning Efforts and Fast Mode share of known service tiers
- Actions → Show Projects: session counts and full directory paths
- Escape: return to the dashboard
- ⌘⇧C on the dashboard: copy a readable summary

Each detail list offers Copy Summary, Copy Name, and Copy Value. Reasoning effort
counts exclude turns without recorded settings. Costs use the existing CLI price
estimates (including its Reserve alias); they do not represent subscription fees.
