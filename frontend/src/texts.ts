// All user-facing German texts of the explorer live here.
// Model keys are the exact names used in the result files.

export type Term = {
  title: string
  short: string
  more?: string
}

export type ModelInfo = {
  label: string
  short: string
  more: string
}

export const MODEL_INFO: Record<string, ModelInfo> = {
  Mean: {
    label: 'Mittelwert',
    short:
      'Sagt für jeden Tag denselben Wert voraus: den Durchschnitt der letzten 365 Tage vor dem Prognosestart.',
    more: 'Das einfachste denkbare Modell. Es kennt weder Wochentage noch Jahreszeiten. Es dient als einfache Vergleichsgröße: Ein komplexeres Modell sollte möglichst einen geringeren Prognosefehler erreichen.',
  },
  'Seasonal Naive (7)': {
    label: 'Seasonal Naive',
    short:
      'Wiederholt die zuletzt beobachtete Woche: Jeder Wochentag bekommt den Wert des gleichen Wochentags der Vorwoche.',
    more: 'Die 7 steht für den Wochenrhythmus. Bei längeren Horizonten wird die letzte beobachtete Woche immer wieder aneinandergereiht. Eine einfache Vergleichsgröße für Daten mit Wochenmuster.',
  },
  SARIMA: {
    label: 'SARIMA',
    short:
      'Klassisches Statistikmodell. Es nutzt, dass der Wert von heute dem von gestern ähnelt und dass sich der Wochenrhythmus wiederholt.',
    more: 'Verwendet wird die Konfiguration (1,0,1)(1,0,1,7) mit konstantem Trend: je ein autoregressiver und ein gleitender Term, einmal für Tage und einmal für Wochen. Die Parameter werden bei jedem Prognosestart neu geschätzt.',
  },
  'Prophet (Woche + Jahr explizit)': {
    label: 'Prophet',
    short:
      'Prognosemodell, ursprünglich von Facebook (heute Meta) entwickelt. Es setzt eine Trendlinie mit einem Wochenmuster und einem Jahresmuster zusammen.',
    more: 'Wochen- und Jahresmuster sind bei uns ausdrücklich eingeschaltet. Prophet würde den Jahresrhythmus bei weniger als zwei Jahren Trainingsdaten sonst abschalten. Alle übrigen Einstellungen sind Prophets Voreinstellung. Feiertage und Ereignisse wurden in dieser Auswertung nicht verwendet, auch wenn Prophet sie grundsätzlich berücksichtigen kann.',
  },
  'GBM rekursiv': {
    label: 'GBM rekursiv',
    short:
      'Maschinelles Lernen mit vielen kleinen Entscheidungsbäumen (Gradient Boosting). Es schaut auf die Werte von vor 1, 7, 14 und 28 Tagen sowie auf Wochentag, Monat und Tag im Jahr.',
    more: 'Es sagt Tag für Tag voraus und nutzt jede eigene Prognose als Eingabe für den nächsten Tag (rekursiv). Bei langen Horizonten können sich Fehler dadurch aufsummieren. Technisch: HistGradientBoostingRegressor aus scikit-learn.',
  },
  'GBM Kalender': {
    label: 'GBM Kalender',
    short:
      'Dasselbe Verfahren, aber ohne die letzten Messwerte: Es kennt nur den Kalender, nämlich Wochentag, Monat und Tag im Jahr.',
    more: 'Weil keine Werte der Vortage nötig sind, baut sich kein Fehler über den Horizont auf. Das Modell zeigt, wie viel der Kalender allein erklärt. Technisch: HistGradientBoostingRegressor aus scikit-learn.',
  },
}

export const TERMS: Record<string, Term> = {
  mae: {
    title: 'MAE: mittlerer Prognosefehler',
    short:
      'Wir vergleichen die vorhergesagten Werte mit den tatsächlich gemessenen. Der MAE ist der durchschnittliche Abstand dazwischen, in µg/m³. Ein Wert von 7,6 heißt: Die Prognose liegt im Schnitt um 7,6 µg/m³ daneben. Kleiner ist besser.',
    more: 'Mittelwert der absoluten Abweichungen zwischen Prognose und Messwert (Mean Absolute Error), gemittelt über alle Prognosestarts. Gezählt werden nur Testtage mit tatsächlicher Messung.',
  },
  horizon: {
    title: 'Prognosehorizont',
    short:
      'Wie viele Tage im Voraus vorhergesagt wird. „7 T“ heißt: Ab dem Prognosestart werden die nächsten 7 Tage vorhergesagt.',
    more: 'Der Fehler eines Horizonts ist der Durchschnitt über alle Tage dieses Zeitraums. Bei längeren Prognosezeiträumen können die Vorhersagen schwieriger werden. Die Ergebnisse verschiedener Horizonte sollten deshalb getrennt betrachtet werden.',
  },
  method: {
    title: 'So testen wir',
    short:
      'Wir tun so, als würden wir an vielen verschiedenen Tagen eine Prognose machen: Das Modell sieht nur die 365 Tage davor, und wir prüfen die Vorhersage gegen die danach gemessenen Werte. Das wiederholen wir alle 91 Tage ab 2018.',
    more: 'Jeder Startpunkt heißt Prognosestart. Das Verfahren heißt Rolling-Origin-Cross-Validation. So entsteht ein Durchschnitt über viele Situationen statt eines einzelnen Glückstreffers.',
  },
  strict: {
    title: 'Strenge Auswertung (80 %)',
    short:
      'Ein Prognosestart zählt nur, wenn genug Messwerte vorhanden waren. Eine Zelle der Tabelle erscheint nur, wenn mindestens 80 % der Prognosestarts zählen. Das ist unsere Referenz.',
    more: 'Pro Prognosestart müssen im Trainings- und im Testzeitraum jeweils mindestens 80 % der Tage gemessen sein. Pro Tabellenzelle müssen mindestens 80 % der Prognosestarts diese Bedingung erfüllen. Fehlende Tage im Trainingsfenster werden linear aufgefüllt, zählen dabei aber nicht als gemessen. Im Testzeitraum wird nie aufgefüllt. Die Regel wurde festgelegt, bevor die Ergebnisse bekannt waren.',
  },
  relaxed: {
    title: 'Gelockerte Regel (70 %)',
    short:
      'Eine zusätzliche Auswertung mit weniger strengen Anforderungen an die Datenabdeckung. Sie wurde erst nach den ersten Ergebnissen ergänzt und ist deshalb nicht direkt mit der strengen Auswertung vergleichbar.',
    more: 'Sie liefert zusätzliche Vergleichswerte für Stationen mit mehr Messlücken. Die Schwellen für die Abdeckung im Training, im Test und für den Anteil zählender Prognosestarts liegen bei 70 % statt bei 80 %. Die Regel wurde festgelegt, nachdem die Ergebnisse der strengen Regel bekannt waren, und ersetzt die Hauptauswertung nie.',
  },
  final: {
    title: 'Gegenprobe ab November 2025',
    short:
      'Ein einzelner Prognosezeitraum ab dem 2. November 2025, der in keinem der Tests oben vorkam. Er zeigt, wie sich die Modelle bei einem einzigen frischen Start schlagen.',
    more: 'Weil es nur ein Zeitraum ist, kann das Ergebnis Zufall sein. Es gelten dieselben Auswertungsregeln wie oben, und die Gegenprobe beeinflusst keine Modellwahl.',
  },
  na: {
    title: 'Nicht auswertbar',
    short:
      'Für diese Zelle erfüllten zu wenige Prognosestarts die Anforderungen an die Datenabdeckung. Wir zeigen deshalb keinen Wert und setzen keinen Ersatzwert ein.',
  },
  best: {
    title: 'Niedrigster Fehler',
    short:
      'Fett und blau hinterlegt ist der niedrigste mittlere Fehler unter den auswertbaren Modellen dieser Spalte. Das ist keine Aussage über statistische Signifikanz.',
  },
  monthly: {
    title: 'Monatsmittel',
    short:
      'Der Durchschnitt aller gültigen Tageswerte eines Monats. Ein Tag ist gültig, wenn dafür mindestens 18 verschiedene Stundenwerte gemessen wurden.',
    more: 'Monate ohne gültigen Tag bleiben leer, es wird nichts aufgefüllt. Die Linie dient nur zum Ansehen. Die Modelle rechnen mit den einzelnen Tageswerten, nicht mit Monatsmitteln.',
  },
  outlook: {
    title: 'Ausblick',
    short:
      'Eine echte Prognose für das nächste Jahr: Jedes Modell schaut auf die letzten 365 Tage und schreibt sie fort.',
    more: 'Für diese Tage gibt es noch keine Messwerte, deshalb lässt sich nicht sagen, wer richtig liegt. In einem Jahr können wir die Linien mit der Wirklichkeit vergleichen.',
  },
  backtest: {
    title: 'Rückblick',
    short:
      'Ein Test an der Vergangenheit: Wir tun so, als wären wir an einem früheren Tag gewesen, lassen die Modelle von dort aus raten und legen die gemessenen Werte daneben.',
    more: 'Das Modell kennt dabei nur die 365 Tage vor dem Prognosestart, nie die Tage danach. Aus denselben Starts entstehen die Zahlen im Tab Modelle.',
  },
  origin: {
    title: 'Prognosestart',
    short:
      'Der Tag, an dem die Prognose beginnt. Alles davor darf das Modell kennen, alles danach muss es vorhersagen.',
    more: 'Im Ausblick markiert die gestrichelte Linie diesen Tag, im Rückblick wählst du ihn mit dem Regler.',
  },
}

export const UI = {
  tabHistory: 'Verlauf',
  tabModels: 'Modelle',
  loading: 'Daten werden geladen …',
  loadError: 'Die Daten für diese Station konnten nicht geladen werden.',
  modelColumn: 'Modell',
  naCell: 'n. a.',
  strictTitle: 'Strenge Auswertung (80 %)',
  relaxedTitle: 'Gelockerte Regel (70 %)',
  unitLine:
    'Mittlerer Prognosefehler (MAE) in µg/m³ je Prognosehorizont. Kleiner ist besser.',
  relaxedWarning:
    'Zusätzliche Auswertung, nachträglich ergänzt. Sie verlangt weniger Datenabdeckung. Die Ergebnisse sind deshalb nicht direkt mit der strengen Auswertung vergleichbar.',
  legendBest:
    'Fett und blau: niedrigster Fehler unter den auswertbaren Modellen. Kein Signifikanztest.',
  legendNa: 'n. a. = nicht auswertbar',
  toggleLabel: 'Zusätzlich die gelockerte Regel (70 %) zeigen',
  toggleHint: 'Nachträglich ergänzt. Die strenge Auswertung bleibt die Referenz.',
  noStrictTitle: 'Kein strenger Modellvergleich möglich',
  noStrictHint:
    'Schalte unten die gelockerte Regel ein, um eine zusätzliche Auswertung zu sehen.',
  noStrictFinal:
    'Das betrifft den Vergleich über viele Prognosestarts. Die Gegenprobe ab November 2025 wird davon unabhängig bewertet.',
  finalTitle: 'Gegenprobe ab November 2025',
  finalSubtitle: 'ein einzelner Zeitraum',
  moreLabel: 'Genauer',
  closeLabel: 'Schließen',
  historyTitle: 'Gemessener Verlauf',
  historyUnit: 'NO₂ in µg/m³, Monatsmittel',
  historyLegendGap:
    'Eine Lücke in der Linie heißt: In diesem Monat gab es keinen einzigen gültigen Messtag. Hohle Punkte: weniger als die Hälfte der Tage gemessen.',
  historyHint: 'Mit dem Finger oder der Maus über die Grafik fahren, um einen Monat zu sehen.',
  historyFinalBand: 'Gegenprobe',
  historyEmpty: 'Für diese Station liegen keine Messwerte vor.',
  howToReadTitle: 'So liest du die Tabelle',
  howToRead:
    'Jede Zahl zeigt, wie viele µg/m³ die Prognose im Durchschnitt pro Tag danebenlag. Kleiner ist besser. Das sind keine Vorhersagen für die Zukunft, sondern Rückblick-Tests: Jedes Modell rät an vielen vergangenen Startpunkten, und wir vergleichen mit dem, was tatsächlich gemessen wurde.',
}

export function horizonLabel(days: number): string {
  return `${days} T`
}

export function noStrictBody(maxSharePercent: number): string {
  return `Je nach Modell und Prognosehorizont erfüllten höchstens ${maxSharePercent} % der Prognosestarts die Anforderungen an die Datenabdeckung. Gefordert sind mindestens 80 %. Deshalb zeigen wir hier keine vergleichbaren Fehlerwerte.`
}

export function cellTip(
  counted: number,
  total: number,
  from?: string,
  to?: string,
): string {
  const base = `Mittelwert über ${counted} von ${total} Prognosestarts`
  if (!from || !to) return `${base}.`
  return `${base}, gestartet zwischen ${monthLabel(from)} und ${monthLabel(to)}.`
}

export function naTip(counted: number, total: number): string {
  return `Nur ${counted} von ${total} Prognosestarts erfüllten die Anforderungen an die Datenabdeckung.`
}

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`
}

function germanDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}

export function historyCoverage(
  measured: number,
  total: number,
  firstDay: string,
  lastDay: string,
): string {
  const percent = Math.round((measured / total) * 100)
  return `An ${measured.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Tagen gemessen (${percent} %). Erster gültiger Messtag: ${germanDate(firstDay)}, letzter: ${germanDate(lastDay)}.`
}

export function historyReadout(
  yearMonth: string,
  mean: number | null,
  days: number,
  daysInMonth: number,
): string {
  if (mean === null) {
    return `${monthLabel(yearMonth)}: kein gültiger Messtag`
  }
  return `${monthLabel(yearMonth)}: ${oneDecimal.format(mean)} µg/m³, ${days} von ${daysInMonth} Tagen gemessen`
}

export function formatDay(iso: string): string {
  return germanDate(iso)
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function weekdayDate(iso: string): string {
  const weekday = WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]
  return `${weekday}, ${germanDate(iso)}`
}

export const PG = {
  tab: 'Prognose',
  modeOutlook: 'Ausblick',
  modeBacktest: 'Rückblick',
  outlookTitle: 'So könnte das nächste Jahr aussehen',
  backtestTitle: 'Wie gut hätten die Modelle richtig gelegen?',
  backtestIntro:
    'Wähle einen Prognosestart in der Vergangenheit. Jedes Modell sieht nur die 365 Tage davor und sagt die folgenden Tage voraus. Die dunkle Linie zeigt, was tatsächlich gemessen wurde.',
  outlookNote:
    'Die Modelle laufen mit Standardeinstellungen und können danebenliegen. Die Linien zeigen nur, was jedes Modell aus den letzten 365 Tagen fortschreibt.',
  horizonLabel: 'Prognosehorizont',
  startLabel: 'Prognosestart',
  finalBadge: 'Gegenprobe',
  modelsLabel: 'Modelle',
  measured: 'Gemessen',
  hint: 'Mit dem Finger oder der Maus über die Grafik fahren, um einzelne Tage zu sehen.',
  tableModel: 'Modell',
  tableError: 'Ø Fehler in µg/m³',
  tableLevel: 'Ø Prognose in µg/m³',
  tableErrorNote:
    'Mittlerer Abstand zur Messung, nur an gemessenen Tagen. Kleiner ist besser. Fett: niedrigster angezeigter Wert.',
  tableLevelNote: 'Durchschnitt der Prognose über die gesamten 364 Tage.',
  unavailableTitle: 'Für diese Station gibt es keine Prognose',
  unavailableBody:
    'Die Messreihe vor dem Prognosestart ist zu lückenhaft, um ein Modell sinnvoll zu trainieren. Wir füllen keine Lücken auf, um trotzdem eine Linie zu zeigen.',
  noStarts: 'Für diese Station gibt es zu diesem Horizont keine Rückblick-Prognosen.',
  smooth: 'Wochenmittel zeigen (glättet die Zacken)',
}

export function horizonDays(days: number): string {
  return `${days} Tage`
}

export function outlookIntro(origin: string, dataUntil: string): string {
  return `Jedes Modell blickt auf die 365 Tage bis zum ${germanDate(dataUntil)} und schreibt daraus die nächsten 364 Tage ab dem ${germanDate(origin)} fort. Das ist eine echte Prognose: Ob sie stimmt, lässt sich erst in einem Jahr überprüfen.`
}

export function coverageNote(valid: number, total: number): string {
  const percent = Math.round((valid / total) * 100)
  const base = `An ${valid} von ${total} Tagen gemessen (${percent} %).`
  return percent < 80
    ? `${base} In der Gesamtauswertung würde dieser Start deshalb nicht zählen.`
    : base
}

export type HistoryEvent = {
  letter: string
  from: string
  to?: string
  text: string
}

export const EVENTS: HistoryEvent[] = [
  { letter: 'A', from: '2019-04-08', text: 'Die ULEZ startet im Zentrum Londons.' },
  {
    letter: 'B',
    from: '2020-03-23',
    to: '2021-07-19',
    text: 'Corona: vom ersten Lockdown bis zum Ende der meisten Beschränkungen in England.',
  },
  {
    letter: 'C',
    from: '2021-10-25',
    text: 'Die ULEZ wird bis zur North/South Circular Road ausgeweitet.',
  },
  { letter: 'D', from: '2023-08-29', text: 'Die ULEZ gilt in ganz Greater London.' },
]

export const EVENTS_INFO: Term = {
  title: 'Ereignisse',
  short:
    'Die Markierungen zeigen, wann etwas passiert ist, nicht, was es bewirkt hat.',
  more: 'Die ULEZ (Ultra Low Emission Zone) ist eine Londoner Umweltzone mit Gebühr für ältere Fahrzeuge. Ob Corona oder die ULEZ die Werte verändert haben, lässt sich aus einem Monatsmittel allein nicht sagen. Wetter, Verkehr und der Standort der Station spielen ebenfalls mit.',
}

export const PLAYGROUND = {
  tab: 'Spielwiese',
  title: 'NO₂ Playground',
  tagline: 'Erkunden. Kombinieren. Experimentieren.',
  close: 'Spielwiese schließen',
  stationsLabel: 'Stationen',
  sections: {
    explore: 'Erkunden',
    combine: 'Kombinieren',
    experiment: 'Experimentieren',
  },
  soon: 'Dieser Bereich entsteht in einer der nächsten Stufen. Die Daten sind schon geladen.',
  loadError: 'Die Daten für die Spielwiese konnten nicht geladen werden.',
  examplesTitle: 'Beispiel-Experimente',
  examples: [
    {
      title: 'Wie viel macht Wind aus?',
      text: 'Windige gegen windstille Tage, bei sonst gleichen Bedingungen.',
    },
    {
      title: 'Wie anders sind Feiertage?',
      text: 'Bank Holidays gegen normale Werktage und Wochenenden.',
    },
    {
      title: 'Corona: Lockdown gegen Normalbetrieb',
      text: 'Lockdown-Tage gegen vergleichbare Tage in anderen Jahren.',
    },
  ] as { title: string; text: string }[],
  dataTitle: 'Datenbasis',
  holidaysLine: (count: number) => `${count} Bank Holidays in England`,
  weatherNote:
    'Wetter: Reanalyse ERA5 (über Open-Meteo), ein Wert für ganz Zentrallondon. Temperatur und Luftfeuchte sind der Mittelwert der fünf höhenkorrigierten Stationswerte.',
}

export function playgroundDays(days: number, first: string, last: string): string {
  return `${days.toLocaleString('de-DE')} Tage, ${formatDay(first)} bis ${formatDay(last)}`
}

export function playgroundMeasured(
  code: string,
  measured: number,
  days: number,
): string {
  const percent = Math.round((measured / days) * 100)
  return `${code}: ${measured.toLocaleString('de-DE')} gemessene Tage (${percent} %)`
}