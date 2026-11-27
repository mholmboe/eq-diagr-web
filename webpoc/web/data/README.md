# Databases bundled with the web app

All three are offered in the app (Database menu and the Chemical system tab).

| Folder | Files | Source |
|---|---|---|
| `release/` | `Reactions.db`, `Reactions.elb`, `References.txt`, and the alternative databases in `other_databases/` (Wateq4F, MintEQ v4, Medusa-Hydra, Soltherm; offered in advanced mode) | The database of the eq-diagr release 0.4.0 (2025-11-10), copied from an installation (`/Applications/Eq-Diagr`); the release is distributed under GPL-3. 169 components, with enthalpy and heat-capacity data for other temperatures and pressures. |
| `kth/` | `KD1280.skv`, `KD1280.elm` | The database for the KTH course KD1280 (chemical analysis), from https://github.com/ignasi-p/eq-diagr-kth (`data/`, commit of 2025-11-10). 58 components, log *K* at 25 °C only. The default. |
| `sample/` | `Reactions.db`, `Reactions.elb` | The small sample in the eq-diagr source repository (`DataMaintenance/`): H, C, N, F, Na, P, S, Cl, Ca. |

## Example data files

`examples/` holds the 17 example data files (`.dat`) of the eq-diagr release 0.4.0, copied from the same installation (`/Applications/Eq-Diagr/Examples`). The app offers them under File > Open an example… and Help > Example diagrams…; the Help tutorials refer to them. `tests/test-examples.js` checks that the web engine makes the same plot files from them as the desktop SED and Predom.
