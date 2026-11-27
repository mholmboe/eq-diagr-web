# EC against PHREEQC and the Fortran EC

The test cases of https://github.com/ignasi-p/haltaFall, folder `ECf/tests-ECf`
(commit 7cddfc0, 2026-03-05), copied unchanged:

| Folder | EC input | Fortran EC results | PHREEQC input and output |
|---|---|---|---|
| `Davies_eqn` | `CO3-Ca-NaCl_ECf.dat` (5 points), `Fe_ECf.dat` (1 point) | `*_ECf.csv` | `ECf-HaltaFall_Test_Davies_eqn.pqi`, `.pqo` (tests 1–5 and 6) |
| `SIT` | `CaSO4-Na-Cl_ECf.dat` (5 points), `SIT-coefficients.dta` | `CaSO4-Na-Cl_ECf.csv` | `ECf-HaltaFall_Test_CaSO4-Na-Cl.pqi`, `.pqo` (tests 1–5) |

The inputs and the PHREEQC runs are the same as in eq-diagr's `EC/tests`, which
the suite already uses for the Java EC tables (`web/tests-data.js`). The new
references here are the Fortran EC (an independent implementation of HaltaFall)
and PHREEQC 3.8.6 (an independent program).

`compare.js` runs each EC input in the browser engine and compares, at every point:

- **with the Fortran EC:** every number of the table, except the electrical
  balance (a residual close to zero), to 1 part in 1000 (log quantities to 0.002);
- **with PHREEQC** (read from the `.pqo` file by `phreeqc.js`): pH, pe, ionic
  strength, the dissolved total of each element, the molality of every aqueous
  species found in both programs, and the moles of each solid in the Davies cases.

The tolerances against PHREEQC are 0.005 log units, except 0.03 for the
CO3–Ca–NaCl points. The PHREEQC input there comments out the `-gamma` lines to
get the Davies equation, but PHREEQC keeps the WATEQ Debye–Hückel parameters of
`wateq4f.dat` for CO3-2, Ca+2, OH- and HCO3-: its log γ(CO3-2) = −0.233 at
I = 0.0206 is the WATEQ value with a = 5.4, while the Davies equation (and EC)
gives −0.243. The two programs therefore differ by up to 0.02 log units at
I = 0.11 (point 4). In the SIT tests PHREEQC dissolves an excess of gypsum or
halite while EC is given the totals, so only the solution is compared there.

Run alone to see the largest differences: `node tests/haltafall/compare.js`.
