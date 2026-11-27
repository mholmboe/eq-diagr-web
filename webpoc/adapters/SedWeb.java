package simpleEquilibriumDiagrams;

/** Browser build, when eq-diagr has the Swing-free SedCalc class: the small
 * interface that webec.WebSED uses, on top of SedCalc. (Without SedCalc,
 * build-web.sh generates a SedWeb class from SED.java instead.) */
public class SedWeb {
  private final SedCalc calc;
  public SedWeb(java.io.PrintStream out, java.io.PrintStream err) {
    SedCalc.pathApp = "";
    calc = new SedCalc(out, err, null);
    calc.doNotStop = true;   // no dialogs in the browser
  }
  /** @return true if the plot file was written */
  public boolean run(String[] args) {return calc.run(args);}
  public long calcMillis() {return calc.calculationMillis();}
  public int pointsCalculated() {return calc.calculationsOK() ? calc.nSteps + 1 : 0;}
  public int pointsFailed() {return calc.failedPoints();}
}
