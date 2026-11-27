# Labels of plot files: chemF reference

`chemf-java.tsv` holds, for every label of the 15 example plot files of the
desktop release and some extra cases, the result of the desktop `chemF`
(LibChemDiagr, `graph_lib/DiagrPaintUtility.chemF`): the label, the label as
drawn (charges moved, `` ` `` `'` and `@` removed), and the vertical shift of
each character in tenths of the character height (-4 subscript, +4 charge,
±5 `` `...' `` sequences). The file was made with a small Java program calling
`DiagrPaintUtility.chemF` on upstream c94b0d8. `test-engine.js` (group Style)
checks that `web/chemtext.js` gives the same results.
