package predominanceAreaDiagrams;

/** Browser build, when eq-diagr has the Swing-free PredomCalc class: the small
 * interface that webec.WebPredom uses, on top of PredomCalc. (Without
 * PredomCalc, build-web.sh generates a PredomWeb class from Predom.java instead.) */
public class PredomWeb {
  private final PredomCalc calc;
  public PredomWeb(java.io.PrintStream out, java.io.PrintStream err) {
    PredomCalc.pathApp = "";
    calc = new PredomCalc(out, err, null);
    calc.doNotStop = true;   // no dialogs in the browser
  }
  /** @return true if the plot file was written */
  public boolean run(String[] args) {return calc.run(args);}
  public long calcMillis() {return calc.calculationMillis();}
  public int gridSteps() {return calc.nSteps;}
}
