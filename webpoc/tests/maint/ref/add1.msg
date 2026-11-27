ANSWER OK: Could not find the "element"-file for database: "New.txt".  The file "New.elt" will be created.
ANSWER Yes: Add reaction? Ca 2+ + Cl- =  CaCl+;  logK= 0.4  [R1]  
MESSAGE: <html>The following reactants<br>will be written to file<br>"New.elt".<br>&nbsp;</html> [Ca 2+, Cl-] 
ANSWER OK: The file "New.txt" will be added to the list of available databases
ANSWER Yes: Add reaction? Ca 2+ + F- =  CaF+;  logK= 0.72  (fluoride complex) [R2]  
MESSAGE: <html>The following reactant<br>will be written to file<br>"New.elt".<br>&nbsp;</html> [F-] 
ANSWER Yes: Add component "Ox 2-" linked to: C ?
ANSWER Yes: Add reaction? Ca 2+ + Ox 2- =  CaOx;  logK= 3.19  [R3+R4]  
ANSWER Yes: Replace existing reaction for "CaCl+" with Ca 2+ + Cl- =  CaCl+;  logK= 0.45  (edited) [R1, R5]
ANSWER Yes: Add reaction? H+ + Ox 2- =  HOx-;  logK= 4.267  [R3]  
ANSWER Yes: Add component "SCN-" linked to: C, N ?
ANSWER Yes: Delete  CaF+ ?
ANSWER Remove: <html>The following reactants<br>in file "New.elt"<br>are not used. &nbsp; Remove them?<br>&nbsp;</html> [SCN-, F-] 
ANSWER Yes: Add reaction? Ca 2+ + H2O =  H+ + CaOH+;  logK=-12.7  [R6]  
MESSAGE: It is not possible to delete    Ox 2- because it is used in one or more reactions.
ANSWER Yes: Replace existing reaction for "CaOx" with Ca 2+ + Ox 2- =  CaOx;  logK= 3.2  [R3+R4]
ANSWER Yes: The species name begins with "@".  This will exclude the aqueous species "CaSO4" when searching the databases.  Add reaction? @CaSO4  
