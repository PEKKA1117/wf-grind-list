# Data sources

`src/data.json` (also embedded in `docs/index.html`) is built by `scripts/gen-data.mjs` from:

- **Digital Extremes' Public Export** (`origin.warframe.com/PublicExport`): gear, Warframes, star chart regions and their localized names.
- **[Warframe wiki](https://wiki.warframe.com/w/Module:Missions/data)**: Junction and Proxima nodes, mission types and mastery points per node; [The Steel Path](https://wiki.warframe.com/w/The_Steel_Path) for which nodes it does not require. Wiki text is under the wiki's own license.
- **Names and rank caps seen in the game**: Syndicates and Intrinsics, written by hand in the script.

Warframe names and data belong to Digital Extremes Ltd. This project is unofficial and not affiliated with or endorsed by Digital Extremes.
