import type { ExperimentError } from '../modelcore/experiment'
import type { FeatureProblem, MethodKeyName } from './expTypes'

export const FEATURE_LABELS: Record<string, string> = {
  weekday: 'Wochentag',
  month: 'Monat',
  bankHoliday: 'Feiertag',
  trend: 'Trend über die Jahre',
  corona: 'Corona-Phase',
  ulez: 'ULEZ-Phase',
  lag1: 'NO₂ von gestern',
  lag7: 'NO₂ vor 7 Tagen',
  lag14: 'NO₂ vor 14 Tagen',
  lag28: 'NO₂ vor 28 Tagen',
  mean7: 'NO₂-Mittel der letzten 7 Tage',
  mean28: 'NO₂-Mittel der letzten 28 Tage',
  temperature_2m_mean: 'Temperatur, Mittel',
  temperature_2m_max: 'Temperatur, Höchstwert',
  temperature_2m_min: 'Temperatur, Tiefstwert',
  wind_speed_10m_mean: 'Wind, Mittel',
  wind_speed_10m_max: 'Wind, Spitze',
  wind_direction_10m_dominant: 'Windrichtung',
  precipitation_sum: 'Regen',
  snowfall_sum: 'Schnee',
  relative_humidity_2m_mean: 'Luftfeuchte',
}

export const FEATURE_GROUPS: { title: string; features: string[] }[] = [
  { title: 'Kalender und Ereignisse', features: ['weekday', 'month', 'bankHoliday', 'trend', 'corona', 'ulez'] },
  { title: 'Frühere NO₂-Werte', features: ['lag1', 'lag7', 'lag14', 'lag28', 'mean7', 'mean28'] },
  {
    title: 'Wetter des Tages',
    features: [
      'temperature_2m_mean',
      'temperature_2m_max',
      'temperature_2m_min',
      'wind_speed_10m_mean',
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
      'precipitation_sum',
      'snowfall_sum',
      'relative_humidity_2m_mean',
    ],
  },
]

export function problemText(problem: FeatureProblem, horizon: number): string {
  return problem === 'weather-in-forecast'
    ? 'Das Wetter des Zieltags wäre bei einer echten Prognose noch nicht bekannt. Im Modus „Vorhersagen“ gesperrt.'
    : problem === 'lag-too-short'
      ? `Dieser Wert läge bei einer Prognose ${horizon} Tage im Voraus noch nicht vor. Gesperrt.`
      : 'Unbekanntes Merkmal.'
}

export const METHOD_LABELS: Record<MethodKeyName, string> = {
  model: 'Modell',
  persistence: 'Persistenz (letzter bekannter Wert)',
  naive: 'Saisonal naiv (gleicher Wochentag)',
  mean: 'Mittelwert der Trainingstage',
}

export const MODEL_KIND_LABELS = { linear: 'Linear (Ridge)', boosting: 'Boosting (Browser)' } as const

export function errorText(error: ExperimentError): string {
  switch (error.code) {
    case 'no-features':
      return 'Es ist kein Merkmal aktiv. Wähle mindestens ein Merkmal, das in diesem Modus erlaubt ist.'
    case 'unknown-station':
      return 'Diese Station gibt es nicht.'
    case 'feature-not-allowed':
      return 'Ein Merkmal ist in diesem Modus nicht erlaubt.'
    case 'period':
      return 'Das Training muss vor dem Test enden.'
    case 'train-too-small':
      return `Zu wenige Trainingstage mit Messwert und vollständigen Merkmalen (${error.rows}, nötig sind ${error.needed}).`
    case 'test-too-small':
      return `Zu wenige Testtage (${error.rows}, nötig sind ${error.needed}). Wähle einen längeren Testzeitraum oder weniger Merkmale mit Lücken.`
    case 'no-fit':
      return 'Das Modell konnte nicht angepasst werden.'
  }
}

export const PGE = {
  intro:
    'Hier baust du ein kleines Modell für das NO₂ einer Station: Du wählst, was es wissen darf, wann es lernt und wann es getestet wird.',
  taskTitle: 'Was hier gerechnet wird',
  taskShort:
    'Das Modell lernt einmal auf dem Trainingszeitraum und wird danach nicht mehr angepasst. Jeder Testtag wird so prognostiziert, als läge die Prognose h Tage zurück.',
  taskMore:
    'Für jeden Testtag t darf das Modell alle tatsächlichen NO₂-Werte bis zum Tag t minus h kennen, auch wenn sie im Testzeitraum liegen, denn am Prognosetag wären sie bekannt gewesen. Es gibt keinen festen Prognosestart für den ganzen Testzeitraum, und die Prognosen werden nicht von Tag zu Tag fortgeschrieben. Auch die Trainingszeilen sind so gebaut: Eine Zeile für den Tag t kennt nur, was h Tage vorher bekannt war. Das Ergebnis ist deshalb nicht mit dem Reiter „Modelle“ vergleichbar. Der arbeitet mit festen Prognosestarts alle 91 Tage und längeren Horizonten.',
  modeTitle: 'Modus',
  explain: 'Erklären',
  explainText:
    'Das Wetter des Tages darf mitrechnen. Das Modell sucht historische Zusammenhänge, es prognostiziert nichts. Der Horizont ist ein Tag.',
  forecast: 'Vorhersagen',
  forecastText:
    'Nur, was zum Prognosezeitpunkt bekannt wäre. Das Wetter des Zieltags und zu kurze frühere Werte sind gesperrt.',
  stationLabel: 'Station',
  kindLabel: 'Modell',
  horizonLabel: 'Horizont',
  horizonExplain: '1 Tag (im Modus Erklären fest)',
  horizonDays: (n: number) => (n === 1 ? '1 Tag' : `${n} Tage`),
  paramsTitle: 'Einstellungen des Modells',
  ridge: 'Stärke der Glättung (Ridge)',
  ridgeHint: 'Je höher, desto stärker werden die Gewichte zusammengezogen. 0 heißt: keine Glättung.',
  trees: 'Bäume',
  depth: 'Tiefe',
  rate: 'Lernrate',
  featuresTitle: 'Was das Modell wissen darf',
  featuresHint:
    'Gewählte Merkmale bleiben beim Wechsel des Modus erhalten. Was ein Modus nicht erlaubt, ist grau und wird nicht verwendet, bis der Modus es wieder erlaubt.',
  lockedTitle: 'Gewählt, aber im Moment nicht verwendet',
  lockedNone: 'Alle gewählten Merkmale werden verwendet.',
  activeCount: (n: number) => (n === 1 ? '1 Merkmal wird verwendet.' : `${n} Merkmale werden verwendet.`),
  periodsTitle: 'Zeiträume',
  train: 'Training',
  test: 'Test',
  from: 'von',
  to: 'bis',
  periodOrder: 'Ein Zeitraum läuft rückwärts: „von“ muss vor „bis“ liegen.',
  periodOverlap: 'Das Training muss vor dem Test enden. So kann nichts aus dem Test ins Training gelangen.',
  periodHint: 'Das Training endet immer vor dem Test. Die Zeiträume sind in Tagen genau.',
  run: 'Berechnen',
  running: 'Rechnet …',
  stale: 'Die Einstellungen wurden seit der Berechnung geändert. Die Ergebnisse unten gehören zu den alten Einstellungen.',
  notRunYet: 'Noch nicht berechnet. Stelle oben alles ein und drücke „Berechnen“.',
  // Results
  resultTitle: 'Ergebnis',
  resultHead: (station: string, mode: string, horizon: number, kind: string) =>
    `${station}, ${mode}, ${horizon === 1 ? '1 Tag' : `${horizon} Tage`} Horizont, ${kind}`,
  trainLine: (days: number, measured: number, rows: number, from: string, to: string) =>
    `Training ${from} bis ${to}: ${days} Tage, davon ${measured} mit Messwert, ${rows} mit vollständigen Merkmalen.`,
  testLine: (days: number, measured: number, rows: number, from: string, to: string) =>
    `Test ${from} bis ${to}: ${days} Tage, davon ${measured} mit Messwert. Bewertet wurden ${rows} Tage, an denen alle Verfahren rechnen konnten.`,
  testSmall: 'Wenige Testtage: das Ergebnis ist unsicher.',
  stabilised: 'Zwei Merkmale sind sich so ähnlich, dass die Rechnung leicht stabilisiert werden musste.',
  compareTitle: 'Modell gegen einfache Verfahren',
  compareIntro:
    'Alle Verfahren werden auf genau denselben Testtagen bewertet. Der Fehler ist der mittlere absolute Fehler (MAE): die durchschnittliche Größe der Abweichung zur Messung in µg/m³, ohne Rücksicht auf die Richtung (kleiner ist besser).',
  colMethod: 'Verfahren',
  colMae: 'Mittlerer absoluter Fehler (MAE)',
  colRmse: 'RMSE',
  colBias: 'Verzerrung (Bias)',
  colVs: 'gegen Persistenz',
  biasHint: 'Verzerrung = Prognose minus Messung im Mittel. Über null heißt: zu hoch.',
  rmseHint: 'RMSE bestraft große Fehler stärker als der MAE.',
  coincide:
    'Bei 7 Tagen Horizont sind Persistenz und Saisonal naiv dasselbe Verfahren: beide nehmen den Wert von vor 7 Tagen.',
  explainBaselines:
    'Im Modus Erklären arbeitet das Modell ohne Kenntnis des Vortags, wenn du keinen früheren NO₂-Wert gewählt hast. Die Persistenz ist dann nur eine Referenz: Sie beantwortet eine andere Frage.',
  trainTestTitle: 'Fehler im Training gegen Fehler im Test',
  trainTestText: (train: string, test: string) =>
    `Mittlerer absoluter Fehler (MAE) des Modells auf den Trainingstagen, mit denen es angepasst wurde: ${train} µg/m³. Auf den ungesehenen Testtagen: ${test} µg/m³.`,
  trainTestNote:
    'Der Trainingsfehler ist optimistisch, weil das Modell diese Tage kennt. Er zeigt nur, ob sich das Modell zu stark an die Trainingstage angepasst hat (Überanpassung). Ein fairer Leistungsvergleich ist allein der Testfehler.',
  belowZeroNone: 'Keine Prognose lag unter null.',
  belowZeroSome: (count: number, total: number, percent: string, lowest: string) =>
    `Das Modell sagte an ${count} von ${total} Testtagen (${percent} %) einen Wert unter null voraus, der tiefste war ${lowest} µg/m³. Ein NO₂-Wert unter null kann es nicht geben. Die Werte sind nicht verändert oder abgeschnitten: Das ist eine Grenze dieses Modells.`,
  belowZeroKey: 'Rote Punkte: Prognose unter null',
  actualTitle: 'Messung und Prognose',
  actualLabel: (station: string) => `Messung und Prognose für ${station} über den Testzeitraum`,
  actual: 'Messung',
  residualsTitle: 'Fehler über die Zeit',
  residualsText: 'Prognose minus Messung. Über der Nulllinie war die Prognose zu hoch.',
  residualsLabel: 'Fehler des Modells je Testtag',
  histTitle: 'Verteilung der Fehler',
  histLabel: 'Häufigkeit der Fehler des Modells',
  histText: 'Eine Verteilung um null ohne Schieflage ist gut. Ein langer Schwanz zeigt einzelne große Fehler.',
  axisValue: 'NO₂ (µg/m³)',
  axisError: 'Fehler (µg/m³)',
  axisCount: 'Tage',
  coefTitle: 'Gewichte des linearen Modells',
  coefText:
    'Veränderung der Prognose in µg/m³, wenn das Merkmal um eine Standardabweichung des Trainings steigt und alle anderen gleich bleiben. Gruppen wie Wochentag oder Monat werden gegen die weggelassene Bezugsgruppe gelesen (Montag, Januar, vor Corona, vor ULEZ). Das ist eine Beschreibung des Modells, keine Ursache.',
  importanceTitle: 'Wichtigkeit der Merkmale',
  importanceCaveatTitle: 'Wichtigkeit ist keine Ursache',
  importanceShort:
    'Zeigt, worauf dieses Modell auf diesen Testtagen setzt. Nicht, was das NO₂ in London verursacht.',
  importanceMore:
    'Verfahren: Für ein Merkmal werden die Testtage mit einer festen Zufallszahl vermischt, und es wird gemessen, um wie viel der mittlere absolute Fehler (MAE) des schon trainierten Modells dann wächst. Das ist eine nachträgliche Analyse des fertigen Modells auf den Testdaten, nicht Teil des Lernens. Bei ähnlichen Merkmalen (etwa den drei Temperaturen) verteilt sich die Wichtigkeit auf alle oder wird unterschätzt, weil das Modell auf ein anderes ausweichen kann. Werte um null, auch leicht negative, bedeuten: kein erkennbarer Beitrag. Ein kleiner Wert heißt nur: für dieses Modell auf diesen Tagen kaum nötig. Ein großer Wert heißt nicht, dass das Merkmal das NO₂ verursacht.',
  importanceNote:
    'Nachträgliche Analyse des fertig trainierten Modells auf den Testtagen. Ähnliche Merkmale teilen sich ihre Wichtigkeit.',
  importanceAxis: 'MAE wächst um (µg/m³)',
  noCause: 'Zusammenhang, keine Ursache.',
  topNote: 'Das Modell beschreibt Muster in den Daten. Was es nutzt, ist nicht automatisch das, was das NO₂ verursacht.',
  limitsTitle: 'Grenzen dieser Rechnung',
  limitsShort: 'Eine Aufteilung, ein Modell, keine Unsicherheitsangabe.',
  limitsMore:
    'Es gibt genau eine Aufteilung in Training und Test und kein Wiederholen mit anderen Zeiträumen. Daher gibt es keine Angabe, wie unsicher die Zahlen sind. Das Modell lernt nur einmal und wird im Test nicht nachtrainiert. Ein Trend im linearen Modell wird in die Zukunft fortgeschrieben und kann dort danebenliegen. Das lineare Modell kann Werte unter null vorhersagen, die es in der Wirklichkeit nicht gibt. Sie werden gezählt und nicht abgeschnitten. Die Wichtigkeit der Merkmale wird auf denselben Testtagen berechnet wie die Bewertung; die Testtage dienen damit nicht mehr allein der unabhängigen Prüfung, für eine strengere Auswertung bräuchte man zusätzlich eine eigene Validierungsmenge. Das Boosting ist eine eigene Umsetzung im Browser: ähnlich wie scikit-learn, aber nicht identisch. Das Wetter gilt für ganz Zentrallondon, nicht für die einzelne Station.',
  tooltipDay: 'Tag',
  seriesToggle: 'Anzeigen',
  tableCaption: (what: string) => `Tabelle: ${what}`,
}
