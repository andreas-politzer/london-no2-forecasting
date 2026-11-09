import type { ChartConfig, Grouping, NumericVariable } from './state'

// All German texts of the playground's charts and filter in one place.

export const VARIABLE_LABELS: Record<NumericVariable, string> = {
  no2: 'NO₂ (µg/m³)',
  temperature_2m_mean: 'Temperatur, Tagesmittel (°C)',
  temperature_2m_max: 'Temperatur, Tageshöchstwert (°C)',
  temperature_2m_min: 'Temperatur, Tagestiefstwert (°C)',
  wind_speed_10m_max: 'Wind, Tagesspitze (km/h)',
  wind_speed_10m_mean: 'Wind, Tagesmittel (km/h)',
  wind_direction_10m_dominant: 'Windrichtung (°)',
  precipitation_sum: 'Regen (mm)',
  snowfall_sum: 'Schnee (cm)',
  relative_humidity_2m_mean: 'Luftfeuchte (%)',
}

export const VARIABLE_SHORT: Record<NumericVariable, string> = {
  no2: 'NO₂',
  temperature_2m_mean: 'Temp Ø',
  temperature_2m_max: 'Temp max',
  temperature_2m_min: 'Temp min',
  wind_speed_10m_max: 'Wind max',
  wind_speed_10m_mean: 'Wind Ø',
  wind_direction_10m_dominant: 'Richtung',
  precipitation_sum: 'Regen',
  snowfall_sum: 'Schnee',
  relative_humidity_2m_mean: 'Feuchte',
}

export const GROUPING_LABELS: Record<Grouping, string> = {
  none: 'ohne Gruppierung',
  windClass: 'Windstärke',
  rainClass: 'Regen',
  snowDay: 'Schnee',
  temperatureClass: 'Temperatur',
  season: 'Jahreszeit',
  dayType: 'Tagesart',
  weekday: 'Wochentag',
  month: 'Monat',
  year: 'Jahr',
  corona: 'Corona',
  ulez: 'ULEZ',
  windSector: 'Windrichtung',
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const SECTOR_SHORT = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']

const numbered = (labels: string[], from: number) =>
  Object.fromEntries(labels.map((label, i) => [String(from + i), label]))

// Labels of the groups inside each grouping (the keys come from the engine).
export const GROUP_KEY_LABELS: Record<Grouping, Record<string, string>> = {
  none: { all: 'alle Tage' },
  windClass: { calm: 'ruhig', normal: 'mittel', windy: 'windig' },
  rainClass: { dry: 'trocken', wet: 'nass', veryWet: 'sehr nass' },
  snowDay: { snow: 'Schneetag', noSnow: 'kein Schnee' },
  temperatureClass: { frost: 'Frost', mild: 'mild', summer: 'Sommertag' },
  season: { winter: 'Winter', spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst' },
  dayType: { workday: 'Werktag', weekend: 'Wochenende', bankHoliday: 'Feiertag' },
  weekday: numbered(WEEKDAY_SHORT, 0),
  month: numbered(MONTH_SHORT, 1),
  year: {},
  corona: { '0': 'außerhalb Corona', '1': 'Corona ohne Lockdown', '2': 'Lockdown' },
  ulez: { '0': 'vor ULEZ', '1': 'ULEZ Zentrum', '2': 'ULEZ erweitert', '3': 'ULEZ London-weit' },
  windSector: numbered(SECTOR_SHORT, 0),
}

export function groupLabel(grouping: Grouping, key: string): string {
  return GROUP_KEY_LABELS[grouping][key] ?? key
}

export function chartTitle(typeLabel: string, config: ChartConfig): string {
  const y = config.y ? VARIABLE_LABELS[config.y] : null
  const x = config.x ? VARIABLE_LABELS[config.x] : null
  const group = config.group && config.group !== 'none' ? GROUPING_LABELS[config.group] : null
  const subject = x && y ? `${y} gegen ${x}` : (y ?? x)
  return [typeLabel, subject].filter(Boolean).join(': ') + (group ? ` nach ${group}` : '')
}

// Names of the parts of a state that a repair can touch (see parseState).
export const REPAIR_LABELS: Record<string, string> = {
  state: 'ganzer Zustand',
  version: 'Version',
  mode: 'Bereich',
  stations: 'Stationen',
  selection: 'Tagesauswahl',
  'selection.period': 'Zeitraum',
  'selection.months': 'Monate',
  'selection.weekdays': 'Wochentage',
  'selection.holiday': 'Feiertage',
  'selection.corona': 'Corona',
  'selection.ulez': 'ULEZ',
  'selection.windSectors': 'Windrichtung',
  'selection.ranges': 'Wertebereiche',
  charts: 'Diagramme',
  'charts.id': 'Diagramm-Kennung',
  'charts.type': 'Diagrammart',
  'charts.stations': 'Stationen eines Diagramms',
  'charts.x': 'x-Achse',
  'charts.y': 'y-Achse',
  'charts.group': 'Gruppierung',
  'charts.options': 'Einstellungen eines Diagramms',
  compare: 'Vergleich',
  'compare.a': 'Gruppe A',
  'compare.b': 'Gruppe B',
  model: 'Modell',
  'model.period': 'Zeiträume des Modells',
  'model.features': 'Merkmale des Modells',
  'model.overlap': 'Training und Test überschneiden sich',
  'model.kind': 'Modellart',
  'model.mode': 'Modus des Modells',
  'model.horizon': 'Prognosehorizont',
  'model.station': 'Station des Modells',
  'model.params': 'Einstellungen des Modells',
}

export function repairLabel(code: string): string {
  return REPAIR_LABELS[code] ?? code
}

export const PGU = {
  filterTitle: 'Tagesauswahl',
  filterIntro: 'Der Filter bestimmt, welche Tage in allen Diagrammen zählen.',
  period: 'Zeitraum',
  from: 'von',
  to: 'bis',
  months: 'Monate',
  weekdays: 'Wochentage',
  holidays: 'Feiertage',
  holidayModes: { any: 'alle Tage', only: 'nur Feiertage', exclude: 'ohne Feiertage' },
  corona: 'Corona',
  coronaChips: ['außerhalb', 'ohne Lockdown', 'Lockdown'],
  ulez: 'ULEZ',
  ulezChips: ['vor ULEZ', 'Zentrum', 'erweitert', 'London-weit'],
  sectors: 'Windrichtung',
  ranges: 'Wertebereiche',
  rangeFrom: 'ab',
  rangeTo: 'bis',
  rangeAdd: 'Bereich hinzufügen',
  rangeRemove: 'Bereich entfernen',
  chipHint: 'Ein Klick wählt nur diesen Eintrag, weitere Klicks fügen hinzu oder nehmen weg. Nichts gewählt heißt: alle.',
  daysSelected: (selected: number, total: number) =>
    `${selected.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Tagen ausgewählt`,
  noDays: 'Keine Tage ausgewählt. Lockere den Filter.',
  reset: 'Filter zurücksetzen',

  addChart: 'Diagramm hinzufügen',
  chartType: 'Diagrammart',
  settings: 'Einstellungen',
  duplicate: 'Duplizieren',
  remove: 'Entfernen',
  variable: 'Größe',
  xVariable: 'x-Achse',
  groupBy: 'Gruppieren nach',
  stations: 'Stationen',
  stationsInherit: 'wie oben',
  stationsOwn: 'eigene Auswahl',
  stationsShared: 'Stationen wie oben',
  notAvailable: 'Diese Diagrammart folgt in einem der nächsten Schritte.',
  weatherSingle: 'Wetterwerte gelten für ganz Zentrallondon und sind an allen Stationen gleich. Darum erscheint hier nur eine Reihe.',
  tooManyGroups: (limit: number) => `Diese Gruppierung hat mehr als ${limit} Gruppen. Wähle eine andere oder nutze ein Balkendiagramm.`,

  basisDays: (days: number) => `${days.toLocaleString('de-DE')} Tage im Filter`,
  basisValues: (code: string, values: number) => `${code}: ${values.toLocaleString('de-DE')} Messwerte`,
  basisMarked: (days: number) => `${days.toLocaleString('de-DE')} Tage markiert`,
  smallWarning: 'wenige Tage',
  nInfoTitle: 'Wie viele Tage stecken dahinter?',
  nInfoShort:
    'Jede Kennzahl hängt an einer Zahl von Tagen (n). Je kleiner n, desto stärker wackelt der Wert. Unter 30 Werten wird eine Gruppe als „wenige Tage" markiert.',
  nInfoMore:
    'Die 30 ist eine Warnschwelle, kein Gütesiegel: Auch mit mehr als 30 Werten beweist ein Unterschied nichts. Dieselbe Wetterlage kommt oft an aufeinanderfolgenden Tagen vor, die Tage sind also nicht unabhängig. Und ein Zusammenhang in den Daten ist noch keine Ursache.',

  highlightTitle: 'Markierung',
  highlightDays: (days: number) => `${days.toLocaleString('de-DE')} Tage markiert`,
  highlightClear: 'Markierung aufheben',
  highlightApply: 'Als Filter übernehmen',
  highlightCannot: 'Diese Markierung lässt sich nicht genau als Filter ausdrücken.',
  highlightHint: 'Eine Markierung hebt Tage nur hervor. Sie ändert keine Fallzahl und wird nicht gespeichert.',

  statLabel: 'Kennzahl',
  statMean: 'Mittelwert',
  statMedian: 'Median',

  smoothLabel: 'Glättung',
  smoothDaily: 'Tageswerte',
  smoothDays: (days: number) => (days === 365 ? 'ein Jahr (365 Tage)' : `${days} Tage`),
  timelineSmoothed: (days: number) => `gleitender Mittelwert über ${days} Tage`,
  timelineDaily: 'Tageswerte',
  timelineHint: 'Ziehen markiert einen Zeitraum. Mit der Tastatur: Pfeiltasten bewegen, Eingabe setzt Anfang und Ende.',
  timelineGaps: 'Lücken: Tage außerhalb der Tagesauswahl oder ohne Messwert.',
  timelineMarkedStrip: 'Markierte Tage liegen im dunklen Streifen unten.',
  timelineOutside: 'außerhalb der Auswahl oder ohne Wert',
  timelineAverage: (days: number) => `Ø ${days} Tage`,
  timelineDay: 'Tag',
  timelineYearly: 'Jahresmittel',
  timelineAnchor: 'Anfang gesetzt. Mit Eingabe das Ende setzen, mit Escape abbrechen.',

  distMode: 'Darstellung',
  distHistogram: 'Histogramm',
  distDensity: 'Dichtekurve',
  distBins: 'Klassen',
  distBinsAuto: 'automatisch',
  distBandwidth: 'Glättung der Kurve',
  distBandwidthChoices: { narrow: 'schmal', normal: 'normal', wide: 'breit' },
  distAxisShare: 'Anteil der Tage (%)',
  distAxisDensity: 'Dichte (% je Einheit)',
  distMarkedSeries: 'dunkel: markierte Tage',
  distFirstStation: (code: string) => `Mit Gruppierung zeigt dieses Diagramm nur die Station ${code}.`,
  distNoValues: 'keine Werte',
  distNone: 'Keine Werte in der Auswahl.',
  distHint: 'Ziehen markiert einen Wertebereich. Mit der Tastatur: Pfeiltasten bewegen, Eingabe setzt Anfang und Ende.',
  distAllDays: 'Alle Tage',
  distBin: (from: string, to: string) => `${from} bis ${to}`,

  singleStation: (code: string) => `Dieses Diagramm zeigt nur die Station ${code}.`,

  boxBox: 'Boxplot',
  boxViolin: 'Violine',
  boxHint:
    'Die Box reicht vom unteren bis zum oberen Viertel der Tage, der dicke Strich ist der Median. Die Linien reichen bis zum letzten Wert innerhalb des 1,5-Fachen der Boxhöhe, Punkte darüber sind Ausreißer.',
  boxHintViolin:
    'Je breiter die Form, desto häufiger kommt der Wert vor. Der dunkle Strich ist der Median. Gestrichelt heißt: wenige Tage.',

  scatterTitle: 'Streudiagramm',
  scatterAgainst: 'gegen',
  scatterAll: 'alle Tage',
  scatterFewDays: 'wenige Tage',
  scatterManyDays: (n: number) => `bis ${n.toLocaleString('de-DE')} Tage je Feld`,
  scatterHint:
    'Jeder Punkt ist ein Tag. Die Linie ist eine einfache lineare Trendlinie, R² sagt, wie viel der Schwankung sie erklärt. Ein Zusammenhang ist noch keine Ursache. Ziehen markiert einen Bereich.',
  scatterRangeNote: 'Ein markierter NO₂-Bereich gilt für den Mittelwert der gewählten Stationen.',

  heatCross: 'Kombinationen',
  heatCorrelation: 'Korrelation',
  heatSpearman: 'Rangkorrelation nach Spearman',
  heatPearson: 'Pearson',
  heatCrossNote:
    'Je dunkler ein Feld, desto höher der Mittelwert. Ein Klick auf eine Überschrift markiert diese Tage.',
  heatHatched: 'Schraffiert heißt: wenige Tage.',
  heatCorrelationNote:
    'Werte nahe 1 oder -1 heißen: die Größen laufen meist gemeinsam oder gegenläufig. Nahe 0 heißt: kein gleichmäßiger Zusammenhang. Eine Korrelation ist keine Ursache.',
  heatMethod: 'Methode',
  heatRows: 'Zeilen',
  heatForm: 'Ansicht',
  heatFormCross: 'Kombinationen',
  heatFormCorrelation: 'Korrelation',

  roseTitle: 'Windrose',
  roseDays: 'Windrichtung: Anteil der Tage',
  roseNo2: 'NO₂ je Windrichtung',
  roseSpeed: 'Windstärke',
  roseSpeedNames: ['ruhig', 'mittel', 'windig'],
  roseShow: 'Anzeige',
  roseShowDays: 'Anteil der Tage',
  roseShowNo2: 'NO₂ je Richtung',
  roseDaysNote: (total: number) =>
    `Die Richtung ist die vorherrschende des Tages, ${total.toLocaleString('de-DE')} Tage mit Richtung und Geschwindigkeit. Ein Klick markiert die Tage dieser Richtung.`,
  roseNo2Note: 'Länge der Keile: mittleres NO₂ an Tagen mit dieser Windrichtung.',

  calTitle: 'Kalender',
  calYear: 'Jahr',
  calOutside: 'außerhalb der Auswahl',
  calHint: 'Ein Klick markiert einen Tag, Umschalt plus Klick den Zeitraum bis dahin. Mit der Tastatur: Zeitraum im Filter wählen.',
  calMarked: 'Dunkle Punkte sind Tage, die in anderen Diagrammen markiert sind.',

  yearGrid: 'Jahresvergleich',
  yearLines: 'Jahresvergleich als Linien',
  yearGridNote: (n: number) => `Je Monat der Mittelwert. Schraffiert heißt: weniger als ${n} Werte im Monat.`,
  yearLinesNote: (n: number) => `Offene Punkte: weniger als ${n} Werte im Monat. Ältere Jahre sind heller, neuere dunkler.`,
  formLabel: 'Darstellung',
  formBox: 'Boxplot',
  formViolin: 'Violine',
  formPoints: 'Punkte',
  formHexbin: 'Felder (Hexagone)',
  formGrid: 'Tabelle',
  formLines: 'Linien',

  sessionShare: 'Link kopieren',
  sessionShared: 'Link kopiert. Er enthält die ganze Einstellung.',
  sessionLinkManual: 'Kopieren hat nicht geklappt. Hier ist der Link:',
  sessionSaveName: 'Name des Experiments',
  sessionSave: 'Speichern',
  sessionSaved: (name: string) => `„${name}" gespeichert.`,
  sessionSaveNameMissing: 'Bitte einen Namen eingeben.',
  sessionSaveFull: 'Es sind schon 50 Experimente gespeichert. Lösche eines.',
  sessionSaveFailed: 'Speichern im Browser hat nicht geklappt (privates Fenster oder voller Speicher).',
  sessionLoad: 'Laden',
  sessionDelete: 'Löschen',
  sessionDeleteFailed: 'Löschen hat nicht geklappt.',
  sessionSavedTitle: 'Gespeichert in diesem Browser',
  sessionNone: 'Noch nichts gespeichert.',
  sessionExport: 'Als Datei sichern',
  sessionImport: 'Aus Datei laden',
  sessionImported: (name: string) => `„${name}" geladen.`,
  sessionImportFailed: {
    json: 'Die Datei ist kein gültiges JSON.',
    format: 'Das ist keine Datei aus dem NO₂ Playground.',
    version: 'Die Datei stammt aus einer anderen Version und kann hier nicht geladen werden.',
    state: 'Der Inhalt der Datei ist keine gültige Einstellung.',
  },
  sessionReset: 'Alles zurücksetzen',
  noticeBroken: 'Der Link in der Adresszeile konnte nicht gelesen werden. Die Spielwiese startet mit der Grundeinstellung.',
  noticeVersion: 'Der Link stammt aus einer anderen Version der Spielwiese. Sie startet mit der Grundeinstellung.',
  noticeRepaired: (parts: string) => `Der Link war nicht ganz in Ordnung. Zurückgesetzt wurde: ${parts}.`,
  noticeClose: 'Hinweis schließen',
}

// Combine: two groups of days compared inside the day filter.
export const PGC = {
  intro:
    'Baue aus Schaltern zwei Gruppen von Tagen und vergleiche das NO₂. Gruppe B sind alle anderen Tage der Tagesauswahl oder eine zweite Kombination.',
  groupA: 'Gruppe A',
  groupB: 'Gruppe B',
  bRest: 'alle anderen Tage',
  bOwn: 'eigene Kombination',
  bLabel: 'Gruppe B besteht aus',
  switchHint:
    'Nichts gewählt heißt: alle Tage. In einer Zeile heißt mehrere Einträge „oder“, verschiedene Zeilen heißen „und“.',
  overlap: (days: number) =>
    `${days.toLocaleString('de-DE')} Tage passen zu beiden Beschreibungen. Sie zählen nur in Gruppe A.`,
  emptyFilter: 'In der Tagesauswahl sind keine Tage. Lockere den Filter links.',
  stationTitle: (code: string, place: string) => `${code} · ${place}`,
  colGroup: 'Gruppe',
  colDays: 'Tage',
  colValues: 'Messwerte',
  colMean: 'Mittelwert',
  colMedian: 'Median',
  rowA: 'A',
  rowB: 'B',
  tooFew: 'zu wenige',
  colMissing: 'ohne Messwert',
  noCause: 'Zusammenhang, keine Ursache.',
  noCauseText:
    'Der Unterschied zwischen A und B beschreibt die Daten, er erklärt nicht, warum. Die Gruppen unterscheiden sich fast immer auch in anderem (Jahreszeit, Jahr, Verkehr).',
  scope: (selected: number, total: number) =>
    `Der Vergleich gilt nur innerhalb der Tagesauswahl: ${selected.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Tagen.`,
  groupDays: (label: string, days: number) => `${label}: ${days.toLocaleString('de-DE')} Tage`,
  applyKeeps: 'Die Gruppen hier bleiben unverändert. Vergleiche gelten danach nur innerhalb der neuen Tagesauswahl.',
  fewDays: 'wenige Tage',
  unit: 'µg/m³',
  diffTitle: 'Unterschied (A minus B)',
  diffMean: (diff: string, percent: string | null) =>
    `Mittelwert: ${diff} µg/m³${percent ? ` (${percent})` : ''}`,
  diffMedian: (diff: string) => `Median: ${diff} µg/m³`,
  notComparable: (min: number) =>
    `Für einen Vergleich braucht jede Gruppe mindestens ${min} Messwerte.`,
  axis: 'NO₂ (µg/m³)',
  plotLabel: (code: string) => `Verteilung des NO₂ an der Station ${code}, Gruppe A und B`,
  plotNote:
    'Die Box zeigt die mittlere Hälfte der Tage, der Strich darin ist der Median, der Punkt der Mittelwert. Gestrichelt heißt: wenige Tage.',
  caveatTitle: 'Wie liest man den Vergleich?',
  caveatShort:
    'Der Unterschied sagt, wie sich die Gruppen unterscheiden, nicht warum. Die Gruppen unterscheiden sich fast immer auch in anderem, zum Beispiel in Jahreszeit, Jahr oder Verkehr.',
  caveatMore:
    'Windige Tage kommen zum Beispiel öfter im Winter vor, und im Winter ist das NO₂ aus mehreren Gründen höher. Ein Unterschied zwischen zwei Gruppen kann deshalb vom Wind kommen oder von etwas, das mit dem Wind zusammenfällt. Mit der Tagesauswahl links lässt sich das eingrenzen, zum Beispiel auf einen Monat. Aufeinanderfolgende Tage sind nicht unabhängig, darum gibt es hier bewusst keinen Signifikanztest. Beachte immer die Zahl der Tage.',
  apply: 'Gruppe A im Erkunden ansehen',
  applyCannot:
    'Gruppe A lässt sich mit den Reglern der Tagesauswahl nicht genau ausdrücken (zum Beispiel „mittel“, „trocken“, „Frost“ oder „Sommertag“). Der Vergleich hier funktioniert trotzdem.',
  applyHint: 'Übernimmt Gruppe A als Tagesauswahl und wechselt zu „Erkunden“. Gruppe A und B bleiben hier unverändert.',
  noStations: 'Wähle oben mindestens eine Station.',
  thresholds: {
    calm: (kmh: string) => `Windtagesmittel bis ${kmh} km/h (unteres Viertel der Tage)`,
    normal: 'dazwischen',
    windy: (kmh: string) => `Windtagesmittel ab ${kmh} km/h (oberes Viertel der Tage)`,
    dry: (mm: string) => `weniger als ${mm} mm Regen`,
    wet: (from: string, to: string) => `${from} bis unter ${to} mm Regen`,
    veryWet: (mm: string) => `ab ${mm} mm Regen`,
    snow: (cm: string) => `ab ${cm} cm Schnee`,
    noSnow: 'weniger Schnee',
    frost: (deg: string) => `Tagestiefstwert unter ${deg} °C`,
    mild: 'dazwischen',
    summer: (deg: string) => `Tageshöchstwert über ${deg} °C`,
  },
}
