package webec;

import lib.common.Util;
import lib.kemi.chem.Chem;
import lib.kemi.readWriteDataFiles.DefaultPlotAndConcs;
import lib.kemi.readWriteDataFiles.ReadChemSyst;
import lib.kemi.readWriteDataFiles.WriteChemSyst;

/** The two changes to a chemical system that Spana's "Modify chemical system"
 * window offers in advanced mode and the console program ModChemSyst does not:
 * moving a component up or down in the list, and merging two data files.
 * The code follows spana.ModifyChemSyst (upDownComponent, mergeTwoSystems and,
 * when the file is saved, checkPlotInfo), without the window: each change
 * reads a data file, makes the change, checks the plot information and writes
 * the file with WriteChemSyst, as the window's "Save" does.
 * Spana's preferences that the window uses have their default values
 * (useEh = true, kth = false). */
final class SysEdit {
  private Chem ch;
  private Chem.ChemSystem cs;
  private Chem.ChemSystem.NamesEtc namn;
  private Chem.Diagr diagr;
  private Chem.DiagrConcs dgrC;
  // as storeInitialSystem in ModifyChemSyst
  private int Na0;
  private String compXname0, compYname0, compMainName0;
  private final java.util.ArrayList<String> identC0 = new java.util.ArrayList<String>();
  /** messages that the window shows as information dialogs */
  final java.util.List<String> warnings = new java.util.ArrayList<String>();

  private SysEdit(Chem chem) {
    use(chem);
    storeInitialSystem(chem);
  }

  private void use(Chem chem) {
    ch = chem; cs = chem.chemSystem; namn = cs.namn; diagr = chem.diag; dgrC = chem.diagrConcs;
  }

  /** Moves component <code>comp</code> one place up or down (within the soluble
   * components, or within the solid components) and writes the file. */
  static SysEdit move(String path, String out, int comp, boolean up) throws Exception {
    SysEdit e = new SysEdit(DatModel.readChem(path));
    e.upDownComponent(comp, up);
    e.save(out);
    return e;
  }

  /** Merges the chemical system of <code>path2</code> into that of
   * <code>path</code> and writes the file. */
  static SysEdit merge(String path, String path2, String out) throws Exception {
    SysEdit e = new SysEdit(DatModel.readChem(path));
    e.mergeTwoSystems(DatModel.readChem(path2));
    e.save(out);
    return e;
  }

  private void save(String out) throws Exception {
    checkPlotInfo();
    WriteChemSyst.writeChemSyst(ch, new java.io.File(out));
  }

  private void storeInitialSystem(Chem chem) {
    Na0 = chem.chemSystem.Na;
    if (chem.diag.compX >= 0) {compXname0 = chem.chemSystem.namn.identC[chem.diag.compX];}
    if (chem.diag.compY >= 0) {compYname0 = chem.chemSystem.namn.identC[chem.diag.compY];}
    if (chem.diag.compMain >= 0) {compMainName0 = chem.chemSystem.namn.identC[chem.diag.compMain];}
    identC0.clear();
    for (int i = 0; i < chem.chemSystem.Na; i++) {identC0.add(i, chem.chemSystem.namn.identC[i]);}
  }

  //<editor-fold defaultstate="collapsed" desc="upDownComponent">
  private void upDownComponent(int compToMove, boolean up) {
    int nSolub = cs.Na - cs.solidC;
    if (compToMove < 0 || compToMove >= cs.Na) {
      throw new IllegalArgumentException("no component number " + compToMove);
    }
    boolean solid = compToMove >= nSolub;
    if ((up && (compToMove == 0 || compToMove == nSolub))
        || (!up && (compToMove == nSolub - 1 || compToMove == cs.Na - 1))) {
      throw new IllegalArgumentException("component \"" + namn.identC[compToMove] + "\" can not be moved "
              + (up ? "up" : "down") + (solid ? " among the solid components" : ""));
    }
    String compToMoveName = namn.identC[compToMove];
    double w;
    int otherCompMoved = up ? compToMove - 1 : compToMove + 1;
    int[] iel = new int[cs.Na];
    for (int ic = 0; ic < cs.Na; ic++) {iel[ic] = ic;}
    iel[otherCompMoved] = compToMove;
    iel[compToMove] = otherCompMoved;

    String other = namn.identC[otherCompMoved];
    namn.identC[otherCompMoved] = compToMoveName;
    namn.identC[compToMove] = other;
    namn.ident[otherCompMoved] = namn.identC[otherCompMoved];
    namn.ident[compToMove] = namn.identC[compToMove];

    boolean plotInfoGiven = diagr.plotType >= 0 && diagr.compX >= 0 && dgrC.hur[0] >= 1;
    if (plotInfoGiven) {
      diagr.compX = iel[diagr.compX];
      if (diagr.compY >= 0) {diagr.compY = iel[diagr.compY];}
      if (diagr.compMain >= 0) {diagr.compMain = iel[diagr.compMain];}
      int otherHur = dgrC.hur[otherCompMoved];
      dgrC.hur[otherCompMoved] = dgrC.hur[compToMove];
      dgrC.hur[compToMove] = otherHur;
      w = dgrC.cLow[otherCompMoved];
      dgrC.cLow[otherCompMoved] = dgrC.cLow[compToMove];
      dgrC.cLow[compToMove] = w;
      w = dgrC.cHigh[otherCompMoved];
      dgrC.cHigh[otherCompMoved] = dgrC.cHigh[compToMove];
      dgrC.cHigh[compToMove] = w;
    }
    for (int ix = 0; ix < cs.Ms - cs.Na; ix++) {
      w = cs.a[ix][otherCompMoved];
      cs.a[ix][otherCompMoved] = cs.a[ix][compToMove];
      cs.a[ix][compToMove] = w;
    }
    storeInitialSystem(ch);
  }
  //</editor-fold>

  //<editor-fold defaultstate="collapsed" desc="mergeTwoSystems">
  private void mergeTwoSystems(Chem ch2) throws Exception {
    Chem.ChemSystem cs2 = ch2.chemSystem;
    Chem.ChemSystem.ChemConcs concs = cs.chemConcs, concs2 = cs2.chemConcs;
    Chem.ChemSystem.NamesEtc namn2 = cs2.namn;
    Chem.Diagr diag2 = ch2.diag;
    Chem.DiagrConcs dgrC2 = ch2.diagrConcs;
    String file1 = "the first file", file2 = "the second file";

    int mSol = cs.mSol, mSol2 = cs2.mSol, solidC_Out = cs.solidC;
    int[] iel = new int[cs.Na];
    for (int i = 0; i < cs.Na; i++) {iel[i] = i;}
    int[] iel2 = new int[cs2.Na];
    for (int i = 0; i < cs2.Na; i++) {iel2[i] = i;}

    //--- what components are new?
    int naOut = cs.Na, found;
    for (int ic2 = 0; ic2 < cs2.Na; ic2++) {
      found = -1;
      for (int ic1 = 0; ic1 < cs.Na; ic1++) {
        if (Util.nameCompare(namn.identC[ic1], namn2.identC[ic2])) {found = ic1; break;}
      }
      iel2[ic2] = found;
      if (found < 0) {
        naOut++;
        if (ic2 > (cs2.Na - cs2.solidC - 1)) {solidC_Out++;}
        for (int ix1 = cs.Na; ix1 < (cs.Ms - cs.solidC); ix1++) {
          if (Util.nameCompare(namn.ident[ix1], namn2.identC[ic2])) {
            throw new Exception("component \"" + namn2.identC[ic2] + "\" (in " + file2 + ") has the same name as"
                    + " reaction product \"" + namn.ident[ix1] + "\" (in " + file1 + "). Please switch a"
                    + " component with a reaction product. The files were not merged.");
          }
        }
      }
    }
    int solidCompsNew = solidC_Out - cs.solidC;
    int solblCompsNew = (naOut - cs.Na) - solidCompsNew;

    java.util.ArrayList<String> identCM = new java.util.ArrayList<String>();
    for (int i = 0; i < naOut; i++) {identCM.add(i, null);}
    java.util.ArrayList<String> identM = new java.util.ArrayList<String>();
    java.util.ArrayList<Double> lBetaM = new java.util.ArrayList<Double>();
    java.util.ArrayList<Double[]> aM = new java.util.ArrayList<Double[]>();
    double[] a1 = new double[naOut];
    double[] a2 = new double[naOut];

    //--- solid components must be the last in the list
    for (int ic1 = 0; ic1 < cs.Na; ic1++) {
      if (ic1 > (cs.Na - cs.solidC - 1)) {
        iel[ic1] = ic1 + solblCompsNew;
        identCM.set(ic1 + solblCompsNew, namn.identC[ic1]);
      } else {
        iel[ic1] = ic1;
        identCM.set(ic1, namn.identC[ic1]);
      }
    }
    int iaCount = 0, iaNew;
    for (int ic2 = 0; ic2 < cs2.Na; ic2++) {
      if (iel2[ic2] < 0) {
        iaCount++;
        if (iaCount <= solblCompsNew) {iaNew = iaCount + (cs.Na - cs.solidC - 1);}
        else {iaNew = iaCount + cs.Na - 1;}
        identCM.set(iaNew, namn2.identC[ic2]);
        iel2[ic2] = iaNew;
      }
    }

    //--- new soluble complexes in the second file
    int nxOut = cs.nx;
    for (int ix2 = 0; ix2 < cs2.nx; ix2++) {
      found = -1;
      for (int ix1 = 0; ix1 < cs.nx; ix1++) {
        if (Util.nameCompare(namn.ident[ix1 + cs.Na], namn2.ident[ix2 + cs2.Na])) {found = ix1; break;}
      }
      if (found < 0) {
        for (int ic1 = 0; ic1 < cs.Na; ic1++) {
          if (Util.nameCompare(namn.identC[ic1], namn2.ident[ix2 + cs2.Na])) {
            throw new Exception("complex \"" + namn2.ident[ix2 + cs2.Na] + "\" (in " + file2 + ") has the same"
                    + " name as component \"" + namn.identC[ic1] + "\" (in " + file1 + "). Please switch a"
                    + " component/complex. The files were not merged.");
          }
        }
        nxOut++;
        identM.add(namn2.ident[ix2 + cs2.Na]);
        lBetaM.add(cs2.lBeta[ix2]);
        aM.add(new Double[cs2.Na]);
        for (int i = 0; i < cs2.Na; i++) {aM.get(aM.size() - 1)[i] = cs2.a[ix2][i];}
      } else {
        sameStoichiometry(found, ix2, cs2, iel, iel2, a1, a2, naOut, "complex", file1, file2);
        if (Math.abs(cs.lBeta[found] - cs2.lBeta[ix2]) > 0.02) {
          warnings.add("log K = " + cs.lBeta[found] + " for complex \"" + namn.ident[found + cs.Na] + "\" in "
                  + file1 + " but log K = " + cs2.lBeta[ix2] + " in " + file2 + "; the first value is used.");
        }
      }
    }
    int solblComplxsNew = nxOut - cs.nx;

    //--- new solid reaction products in the second file
    int mSolOut = (mSol - cs.solidC) + solidC_Out;
    for (int ix2 = cs2.nx; ix2 < (cs2.nx + (mSol2 - cs2.solidC)); ix2++) {
      found = -1;
      for (int ix1 = cs.nx; ix1 < (cs.nx + (mSol - cs.solidC)); ix1++) {
        if (Util.nameCompare(namn.ident[ix1 + cs.Na], namn2.ident[ix2 + cs2.Na])) {found = ix1; break;}
      }
      if (found < 0) {
        for (int ic1 = 0; ic1 < cs.Na; ic1++) {
          if (Util.nameCompare(namn.identC[ic1], namn2.ident[ix2 + cs2.Na])) {
            throw new Exception("solid product \"" + namn2.ident[ix2 + cs2.Na] + "\" (in " + file2 + ") has the"
                    + " same name as component \"" + namn.identC[ic1] + "\" (in " + file1 + "). Please switch a"
                    + " component/reaction. The files were not merged.");
          }
        }
        mSolOut++;
        identM.add(namn2.ident[ix2 + cs2.Na]);
        lBetaM.add(cs2.lBeta[ix2]);
        aM.add(new Double[cs2.Na]);
        for (int i = 0; i < cs2.Na; i++) {aM.get(aM.size() - 1)[i] = cs2.a[ix2][i];}
      } else {
        sameStoichiometry(found, ix2, cs2, iel, iel2, a1, a2, naOut, "solid product", file1, file2);
        if (Math.abs(cs.lBeta[found] - cs2.lBeta[ix2]) > 0.02) {
          warnings.add("log K = " + cs.lBeta[found] + " for reaction \"" + namn.ident[found + cs.Na] + "\" in "
                  + file1 + " but log K = " + cs2.lBeta[ix2] + " in " + file2 + "; the first value is used.");
        }
      }
    }
    int solidComplxsNew = (mSolOut - solidC_Out) - (mSol - cs.solidC);

    //--- temperature, pressure and title
    if (Double.isNaN(concs.temperature) && !Double.isNaN(concs2.temperature)) {concs.temperature = concs2.temperature;}
    if (!Double.isNaN(concs.temperature) && !Double.isNaN(concs2.temperature)
        && Math.abs(concs.temperature - concs2.temperature) > 0.001) {
      warnings.add("Different temperatures: t = " + concs.temperature + " in " + file1 + " but t = "
              + concs2.temperature + " in " + file2 + "; keeping t = " + concs.temperature + ".");
    }
    if (Double.isNaN(concs.pressure) && !Double.isNaN(concs2.pressure)) {concs.pressure = concs2.pressure;}
    if (!Double.isNaN(concs.pressure) && !Double.isNaN(concs2.pressure)
        && Math.abs(concs.pressure - concs2.pressure) > 0.0001) {
      warnings.add("Different pressures: P = " + concs.pressure + " in " + file1 + " but P = "
              + concs2.pressure + " in " + file2 + "; keeping P = " + concs.pressure + ".");
    }
    if (diag2.title != null && diagr.title == null) {diagr.title = diag2.title;}

    //--- the merged system
    Chem.ChemSystem csNew = ch.new ChemSystem(naOut, (naOut + nxOut + mSolOut), mSolOut, solidC_Out);
    Chem.ChemSystem.NamesEtc namnNew = csNew.namn;
    boolean plotInfoGiven = diagr.plotType >= 0 && diagr.compX >= 0 && dgrC.hur[0] > 0;
    Chem.DiagrConcs dgrCNew = null;
    if (plotInfoGiven) {dgrCNew = ch.new DiagrConcs(naOut);}

    csNew.chemConcs = cs.chemConcs;
    csNew.solidC = solidC_Out;
    csNew.nx = nxOut;

    for (int ic1 = 0; ic1 < cs.Na; ic1++) {
      namnNew.identC[iel[ic1]] = namn.identC[ic1];
      namnNew.ident[iel[ic1]] = namn.identC[ic1];
    }
    for (int ic2 = 0; ic2 < cs2.Na; ic2++) {
      namnNew.identC[iel2[ic2]] = namn2.identC[ic2];
      namnNew.ident[iel2[ic2]] = namn2.identC[ic2];
    }
    for (int ix1 = 0; ix1 < cs.nx; ix1++) {
      namnNew.ident[naOut + ix1] = namn.ident[cs.Na + ix1];
      csNew.lBeta[ix1] = cs.lBeta[ix1];
      for (int ic = 0; ic < naOut; ic++) {csNew.a[ix1][ic] = 0;}
      for (int ic1 = 0; ic1 < cs.Na; ic1++) {csNew.a[ix1][iel[ic1]] = cs.a[ix1][ic1];}
    }
    for (int ixM = 0; ixM < solblComplxsNew; ixM++) {
      namnNew.ident[naOut + cs.nx + ixM] = identM.get(ixM);
      csNew.lBeta[cs.nx + ixM] = lBetaM.get(ixM);
      for (int ic = 0; ic < naOut; ic++) {csNew.a[cs.nx + ixM][ic] = 0;}
      for (int ic2 = 0; ic2 < cs2.Na; ic2++) {csNew.a[cs.nx + ixM][iel2[ic2]] = aM.get(ixM)[ic2];}
    }
    for (int if1 = 0; if1 < (mSol - cs.solidC); if1++) {
      namnNew.ident[naOut + nxOut + if1] = namn.ident[cs.Na + cs.nx + if1];
      csNew.lBeta[nxOut + if1] = cs.lBeta[cs.nx + if1];
      for (int ic = 0; ic < naOut; ic++) {csNew.a[nxOut + if1][ic] = 0;}
      for (int ic1 = 0; ic1 < cs.Na; ic1++) {csNew.a[nxOut + if1][iel[ic1]] = cs.a[cs.nx + if1][ic1];}
    }
    int soFar = nxOut + (mSol - cs.solidC);
    for (int ifM = solblComplxsNew; ifM < solblComplxsNew + solidComplxsNew; ifM++) {
      int ifS = ifM - solblComplxsNew;
      namnNew.ident[naOut + soFar + ifS] = identM.get(ifM);
      csNew.lBeta[soFar + ifS] = lBetaM.get(ifM);
      for (int ic = 0; ic < naOut; ic++) {csNew.a[soFar + ifS][ic] = 0;}
      for (int ic2 = 0; ic2 < cs2.Na; ic2++) {csNew.a[soFar + ifS][iel2[ic2]] = aM.get(ifM)[ic2];}
    }
    //--- the "fictive" solids of any solid components
    if (solidC_Out > 0) {
      int j, k;
      for (int ic = 0; ic < solidC_Out; ic++) {
        j = (csNew.Ms - csNew.Na - solidC_Out) + ic;
        k = (csNew.Na - solidC_Out) + ic;
        csNew.lBeta[j] = 0;
        for (int ic2 = 0; ic2 < csNew.Na; ic2++) {csNew.a[j][ic2] = (ic2 == k) ? 1 : 0;}
        namnNew.ident[j + csNew.Na] = namnNew.identC[k];
        csNew.noll[k] = true;
      }
    }

    //--- the plot definition and concentrations of the first file are kept
    if (diagr.compMain >= 0) {diagr.compMain = iel[diagr.compMain];}
    if (diagr.compX >= 0) {diagr.compX = iel[diagr.compX];}
    if (diagr.compY >= 0) {diagr.compY = iel[diagr.compY];}
    if (plotInfoGiven && dgrCNew != null) {
      for (int ic1 = 0; ic1 < cs.Na; ic1++) {
        if (dgrC.hur[ic1] > 0) {
          dgrCNew.hur[iel[ic1]] = dgrC.hur[ic1];
          dgrCNew.cLow[iel[ic1]] = dgrC.cLow[ic1];
          dgrCNew.cHigh[iel[ic1]] = dgrC.cHigh[ic1];
        }
      }
      for (int ic2 = 0; ic2 < cs2.Na; ic2++) {
        if (dgrC2.hur[ic2] > 0) {
          dgrCNew.hur[iel2[ic2]] = dgrC2.hur[ic2];
          dgrCNew.cLow[iel2[ic2]] = dgrC2.cLow[ic2];
          dgrCNew.cHigh[iel2[ic2]] = dgrC2.cHigh[ic2];
        }
      }
    }

    ch.chemSystem = csNew;
    ch.chemSystem.namn = namnNew;
    ch.diagrConcs = ch.new DiagrConcs(naOut);
    cs = csNew;
    namn = namnNew;
    diagr = ch.diag;
    dgrC = dgrCNew;

    if (plotInfoGiven && dgrC != null) {
      for (int ic = 0; ic < cs.Na; ic++) {
        if (dgrC.hur[ic] <= 0) {DefaultPlotAndConcs.setDefaultConc(ic, namn.identC[ic], dgrC, false);}
      }
    }
    ReadChemSyst.addFictiveSolids(cs);
    storeInitialSystem(ch);
  }

  private void sameStoichiometry(int found, int ix2, Chem.ChemSystem cs2, int[] iel, int[] iel2,
          double[] a1, double[] a2, int naOut, String what, String file1, String file2) throws Exception {
    for (int ic = 0; ic < naOut; ic++) {a1[ic] = 0; a2[ic] = 0;}
    for (int ic = 0; ic < cs.Na; ic++) {a1[iel[ic]] = cs.a[found][ic];}
    for (int ic = 0; ic < cs2.Na; ic++) {a2[iel2[ic]] = cs2.a[ix2][ic];}
    for (int ic = 0; ic < naOut; ic++) {
      if (Math.abs(a1[ic] - a2[ic]) > 0.0001) {
        throw new Exception("the " + what + " \"" + namn.ident[found + cs.Na] + "\" is in both files, but the"
                + " stoichiometries are different. Please correct the input files. The files were not merged.");
      }
    }
  }
  //</editor-fold>

  //<editor-fold defaultstate="collapsed" desc="checkPlotInfo">
  private void checkPlotInfo() throws Exception {
    boolean plotMustBeChanged = false, found;
    int compXnew = -1, compYnew = -1, compMainNew = -1;
    if (diagr.plotType < 0 || diagr.compX < 0
        || (diagr.plotType == 0 && (diagr.compY < 0 || diagr.compMain < 0))
        || ((diagr.plotType == 1 || diagr.plotType == 4) && diagr.compY < 0)) {
      plotMustBeChanged = true;
    }
    if (compXname0 != null && !plotMustBeChanged) {
      found = false;
      for (int inew = 0; inew < cs.Na; inew++) {
        if (namn.identC[inew].equals(compXname0)) {compXnew = inew; found = true; break;}
      }
      if (!found) {plotMustBeChanged = true;}
    }
    if ((diagr.plotType == 0 || diagr.plotType == 1 || diagr.plotType == 4)
        && compYname0 != null && !plotMustBeChanged) {
      found = false;
      for (int inew = 0; inew < cs.Na; inew++) {
        if (namn.identC[inew].equals(compYname0)) {compYnew = inew; found = true; break;}
      }
      if (!found) {plotMustBeChanged = true;}
    }
    if (diagr.plotType == 0 && compMainName0 != null && !plotMustBeChanged) {
      found = false;
      for (int inew = 0; inew < cs.Na; inew++) {
        if (namn.identC[inew].equals(compMainName0)) {compMainNew = inew; found = true; break;}
      }
      if (!found) {plotMustBeChanged = true;}
    }
    if (!plotMustBeChanged) {
      if (dgrC == null) {plotMustBeChanged = true;}
      else {
        for (int iold = 0; iold < Na0; iold++) {
          if (dgrC.hur[iold] == 2 || dgrC.hur[iold] == 3 || dgrC.hur[iold] == 5) {
            found = false;
            for (int inew = 0; inew < cs.Na; inew++) {
              if (namn.identC[inew].equals(identC0.get(iold))) {found = true; break;}
            }
            if (!found) {plotMustBeChanged = true; break;}
          }
        }
      }
    }
    int H_present = -1, e_present = -1, e_cmplx = -1;
    for (int inew = 0; inew < cs.Na; inew++) {
      if (Util.isProton(namn.identC[inew])) {H_present = inew;}
      if (Util.isElectron(namn.identC[inew])) {e_present = inew;}
    }
    if (e_present < 0) {
      for (int ix = 0; ix < cs.nx; ix++) {
        if (Util.isElectron(namn.ident[ix + cs.Na])) {e_cmplx = ix; break;}
      }
    }
    if ((diagr.plotType == 6 || diagr.plotType == 8) && !plotMustBeChanged && H_present < 0) {plotMustBeChanged = true;}
    if (diagr.plotType == 5 && !plotMustBeChanged && e_present < 0 && e_cmplx < 0) {plotMustBeChanged = true;}

    if (plotMustBeChanged) {
      diagr.Eh = true; // Spana's default: useEh
      DefaultPlotAndConcs.setDefaultPlot(cs, diagr, dgrC);
    } else {
      diagr.compX = compXnew;
      diagr.compY = compYnew;
      diagr.compMain = compMainNew;
    }

    Chem.DiagrConcs dgrCnew = ch.new DiagrConcs(cs.Na);
    for (int inew = 0; inew < cs.Na; inew++) {
      found = false;
      if (dgrC != null) {
        for (int iold = 0; iold < Na0; iold++) {
          if (namn.identC[inew].equals(identC0.get(iold)) && dgrC.hur[iold] > 0) {
            dgrCnew.hur[inew] = dgrC.hur[iold];
            dgrCnew.cLow[inew] = dgrC.cLow[iold];
            dgrCnew.cHigh[inew] = dgrC.cHigh[iold];
            found = true;
            break;
          }
        }
      }
      if (!found) {DefaultPlotAndConcs.setDefaultConc(inew, namn.identC[inew], dgrCnew, false);}
    }
    ch.diagrConcs = dgrCnew;
    dgrC = ch.diagrConcs;
    DefaultPlotAndConcs.checkConcsInAxesAndMain(namn, diagr, dgrC, false, false);
    storeInitialSystem(ch);
  }
  //</editor-fold>
}
