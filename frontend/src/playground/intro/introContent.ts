// The text of the introduction ("i" next to the title). One block of text,
// separate from the components. Only facts that can change come from the
// application (number of stations, period, thresholds, number of examples);
// the explanations themselves are fixed text.

export type IntroFacts = {
  stationCount: number
  firstDay: string // ISO
  lastDay: string // ISO
  days: number
  minGroupDays: number // fewer values than this: "few days"
  minCellDays: number // fewer values than this: no statistics
  exampleCount: number
  minHours: number // distinct hourly values a day needs to count as measured
}

export type IntroItem = { lead?: string; text: string }
export type IntroBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: IntroItem[] }
  | { kind: 'steps'; items: IntroItem[] }
  | { kind: 'warn'; title: string; text: string }

export type IntroSection = { id: string; title: string; summary: string; blocks: IntroBlock[] }
export type IntroTerm = { term: string; text: string }

export type Intro = {
  title: string
  lead: string
  start: { title: string; steps: IntroItem[] }
  toc: { id: string; title: string }[] // six entries; "start" jumps to the box
  sections: IntroSection[]
  glossaryTitle: string
  glossary: IntroTerm[]
}

const WORDS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']

export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : n.toLocaleString('de-DE')
}

export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function buildIntro(f: IntroFacts): Intro {
  const stations = numberWord(f.stationCount)
  const examples = numberWord(f.exampleCount)
  const days = f.days.toLocaleString('de-DE')
  return {
    title: 'Einführung: Was kann ich hier tun?',
    lead: 'Hier kannst du selbst untersuchen, wie sich die Luftbelastung mit Stickstoffdioxid (NO₂) in London über die Jahre, mit dem Wetter und mit dem Alltag verändert. Es gibt drei Arbeitsbereiche, die aufeinander aufbauen: Erkunden, Kombinieren und Experimentieren.',
    start: {
      title: 'Erste Schritte',
      steps: [
        { text: `Scrolle ganz nach unten zu „Beispiel-Experimente“. Es gibt ${examples} davon. Drücke bei einem auf „Laden“, du landest direkt im passenden Arbeitsbereich.` },
        { text: 'Lies den Satz zum Beispiel und schau dir an, was angezeigt wird.' },
        { text: 'Verändere dann selbst etwas: eine andere Station, einen anderen Zeitraum, eine andere Gruppe von Tagen.' },
        { text: 'Du kannst Einstellungen jederzeit ändern und ein Beispiel erneut laden. Wenn du einen Stand behalten möchtest, sichere ihn vorher: mit „Speichern“ (in diesem Browser), „Link kopieren“ oder „Als Datei sichern“.' },
      ],
    },
    toc: [
      { id: 'was', title: 'Was ist der Playground?' },
      { id: 'erkunden', title: 'Erkunden' },
      { id: 'kombinieren', title: 'Kombinieren' },
      { id: 'experimentieren', title: 'Experimentieren' },
      { id: 'lesen', title: 'Ergebnisse richtig lesen' },
      { id: 'start', title: 'Erste Schritte' },
    ],
    sections: [
      {
        id: 'was',
        title: '1. Was ist der Playground?',
        summary: 'Ein Werkzeug zum Ausprobieren, keine fertige Antwort.',
        blocks: [
          { kind: 'p', text: 'Der Playground ist ein Werkzeug zum Ausprobieren, nicht eine fertige Antwort. Er arbeitet mit diesen Daten:' },
          {
            kind: 'list',
            items: [
              {
                lead: 'NO₂-Tageswerte',
                text: `von ${stations} Messstationen in London, vom ${longDate(f.firstDay)} bis ${longDate(f.lastDay)} (${days} Tage). NO₂ ist ein Luftschadstoff, der vor allem bei Verbrennung entsteht, etwa im Straßenverkehr. Aus den Stundenwerten wird je Tag ein Mittel gebildet. Ein Tag zählt nur dann als gemessen, wenn mindestens ${f.minHours} verschiedene Stundenwerte vorliegen. Alle anderen Tage sind Lücken und werden nicht aufgefüllt.`,
              },
              {
                lead: 'Wetter',
                text: `je Tag: Temperatur, Wind, Regen, Schnee und Luftfeuchte. Das Wetter stammt aus der ERA5-Reanalyse. Das sind modellgestützte Wetterdaten für eine gemeinsame Gitterzelle von 0,25 Grad (etwa 25 km), die für alle ${stations} Stationen verwendet wird. Es sind keine Messungen direkt an den Messstationen. Deshalb haben alle Stationen dieselben Wetterwerte.`,
              },
              {
                lead: 'Kalenderfakten',
                text: 'Wochentag, Monat, Bank Holidays in England, die Corona-Phasen (vereinfacht datiert) und die Phasen der Ultra Low Emission Zone (ULEZ), einer Londoner Umweltzone.',
              },
            ],
          },
          { kind: 'p', text: 'Damit kannst du Muster in diesen Daten finden, Gruppen von Tagen vergleichen und kleine Vorhersagemodelle bauen und testen. Der Playground sagt keine kommenden Tage voraus.' },
        ],
      },
      {
        id: 'erkunden',
        title: '2. Erkunden',
        summary: 'Die Daten ansehen, ohne etwas zu vergleichen oder zu rechnen.',
        blocks: [
          {
            kind: 'list',
            items: [
              { lead: 'Stationen', text: 'Wähle oben eine oder mehrere. Jede Station hat in allen Diagrammen ihre eigene Farbe. Streudiagramm, Heatmap, Windrose, Kalender und Jahresvergleich zeigen nur die erste gewählte Station.' },
              { lead: 'Tagesauswahl (der globale Filter)', text: 'Sie bestimmt, welche Tage in allen Diagrammen zählen: Zeitraum, Monate, Wochentage, Bank Holidays (egal, nur oder ohne), Corona- und ULEZ-Phase, Windrichtung und Wertebereiche, zum Beispiel „nur Tage mit mehr als 1 mm Regen“.' },
              { lead: 'Diagramme', text: 'Es gibt neun Arten, unter anderem Zeitverlauf, Verteilung, Boxplot, Balken, Streudiagramm, Heatmap, Windrose, Kalender und Jahresvergleich. Du kannst mehrere untereinander zeigen, hinzufügen, duplizieren und entfernen.' },
              { lead: 'Markieren', text: 'In einem Diagramm kannst du einen Bereich ziehen oder anklicken. Diese Tage werden dann in den anderen Diagrammen hervorgehoben. Eine Markierung ändert keine Zahl und die Tagesauswahl nicht, und sie wird nicht gespeichert. Mit „Als Filter übernehmen“ wird sie zur Tagesauswahl, soweit sie sich genau ausdrücken lässt. Sonst sagt dir die Seite, dass es nicht geht.' },
              { lead: 'Fallzahlen', text: 'Jedes Diagramm sagt, auf wie vielen Tagen es beruht.' },
            ],
          },
          { kind: 'p', text: 'Typische Fragen: Gibt es einen Wochenrhythmus? Aus welcher Richtung weht der Wind an den stark belasteten Tagen? Wird die Luft über die Jahre besser?' },
        ],
      },
      {
        id: 'kombinieren',
        title: '3. Kombinieren',
        summary: 'Zwei Gruppen von Tagen vergleichen.',
        blocks: [
          { kind: 'p', text: 'Hier fragst du: Ist das NO₂ an Tagen vom Typ A anders als an Tagen vom Typ B? Die Tagesauswahl aus „Erkunden“ gilt auch hier, beide Gruppen werden nur aus diesen Tagen gebildet.' },
          {
            kind: 'list',
            items: [
              { lead: 'Gruppe A', text: 'Du baust sie aus Schaltern: Wind, Regen, Schnee, Temperatur, Jahreszeit, Tagesart, Corona und ULEZ.' },
              { lead: 'UND und ODER', text: 'In einer Zeile gilt ODER, zum Beispiel „windig oder normal“. Zwischen den Zeilen gilt UND, zum Beispiel „windig und Winter und Werktag“. Nichts gewählt heißt: alle Tage.' },
              { lead: 'Gruppe B', text: 'Entweder alle übrigen Tage der Tagesauswahl oder eine eigene zweite Kombination. Ein Tag, der beide Beschreibungen erfüllt, zählt nur in A. Die Zahl dieser Tage wird genannt.' },
              { lead: 'Der Vergleich je Station', text: 'Für jede Station getrennt: Tage, Messwerte, Tage ohne Messwert, Mittelwert, Median und der Unterschied A minus B, dazu ein Boxplot. Es gibt keinen gemeinsamen Mittelwert über alle Stationen, damit unterschiedliche Datenabdeckung nicht verdeckt wird.' },
              { lead: 'Fair vergleichen', text: 'Wenn du windige mit ruhigen Tagen vergleichst, beschränke beide Gruppen auf dieselbe Jahreszeit. Sonst misst du Wind und Jahreszeit zugleich.' },
              { lead: 'Gruppe A ansehen', text: '„Gruppe A im Erkunden ansehen“ übernimmt A als Tagesauswahl, wenn das genau möglich ist. A und B bleiben dabei unverändert.' },
            ],
          },
        ],
      },
      {
        id: 'experimentieren',
        title: '4. Experimentieren',
        summary: 'Ein kleines Vorhersagemodell bauen und testen.',
        blocks: [
          { kind: 'p', text: 'Hier trainierst du ein Modell und prüfst, wie gut es ist.' },
          {
            kind: 'list',
            items: [
              { lead: 'Merkmale', text: 'Das sind die Zutaten des Modells, also Informationen, mit denen es rechnet: Kalender (Wochentag, Monat, Feiertag, Trend), frühere NO₂-Werte und das Wetter des Tages.' },
              { lead: 'Training und Test', text: 'Das Modell lernt aus den Trainingstagen. Danach wird es an Testtagen geprüft. Die Testwerte werden nicht zum Training verwendet, und das Training endet immer vor dem Test. Bei späteren Prognosen dürfen aber bereits gemessene NO₂-Werte aus dem vorherigen Testzeitraum als Eingaben dienen, so wie sie am Prognosetag bekannt wären.' },
              { lead: 'Erklären', text: 'Das Wetter des Tages darf mitrechnen. Das Modell sucht historische Zusammenhänge, es prognostiziert nichts.' },
              { lead: 'Vorhersagen', text: 'Es darf nur benutzt werden, was zum Prognosezeitpunkt bekannt wäre. Das Wetter des Zieltags und zu kurze frühere Werte sind gesperrt. Was gesperrt ist, bleibt sichtbar, mit Begründung. Wechselst du den Modus, bleibt deine Auswahl erhalten.' },
              { lead: 'Horizont', text: 'Wie viele Tage im Voraus prognostiziert wird (1, 7 oder 30). Jeder Testtag wird so behandelt, als läge die Prognose so viele Tage zurück.' },
              { lead: 'Zwei Modelle', text: 'Ein lineares Modell (es rechnet mit Gewichten) und ein Boosting (viele kleine Entscheidungsbäume nacheinander, im Browser selbst geschrieben).' },
              { lead: 'Baselines', text: 'Das sind einfache Vergleichsmaßstäbe: der Mittelwert der Trainingstage, „Saisonal naiv“ (derselbe Wochentag der Vorwoche) und „Persistenz“ (der letzte bekannte Wert). Sie helfen einzuschätzen, ob ein komplexeres Modell tatsächlich einen Vorteil bringt. Verglichen wird auf denselben Testtagen. Im Modus Erklären ist Persistenz allerdings nur eine Referenz, weil sie eine andere Frage beantwortet als das Erklärungsmodell. Der Mittelwert der Trainingstage weiß weniger als ein Modell, das frühere Werte kennt.' },
              { lead: 'Ergebnis', text: 'Fehlertabelle, Messung gegen Prognose, Fehler über die Zeit, Verteilung der Fehler, Gewichte (nur beim linearen Modell) und die Wichtigkeit der Merkmale.' },
            ],
          },
          {
            kind: 'warn',
            title: 'Nicht mit dem Reiter „Modelle“ vergleichen',
            text: 'Die Modellbewertung im Playground und der Modellvergleich im Hauptreiter „Modelle“ verwenden unterschiedliche Prognoseaufgaben und Bewertungsverfahren. Ihre Fehlerwerte sind deshalb nicht direkt vergleichbar.',
          },
        ],
      },
      {
        id: 'lesen',
        title: '5. Ergebnisse richtig lesen',
        summary: 'Fallzahlen, Lücken, Zusammenhang und Ursache, Grenzen der Modelle.',
        blocks: [
          {
            kind: 'list',
            items: [
              { lead: 'Fallzahlen', text: `Jede Zahl hängt an einer Anzahl Tage. Je kleiner sie ist, desto unsicherer ist die Zahl. Unter ${f.minGroupDays} Messwerten heißt eine Gruppe „wenige Tage“. Unter ${f.minCellDays} Messwerten gibt es keine Statistik.` },
              { lead: 'Fehlende Daten', text: 'Nicht jede Station hat jeden Tag gemessen. Deshalb kann die Zahl der Messwerte je nach Station und Zeitraum verschieden sein, auch bei gleicher Tagesauswahl. Zwei Diagramme können also auf verschiedenen Fallzahlen beruhen.' },
              { lead: 'Zusammenhang, keine Ursache', text: 'Wenn zwei Dinge zusammen auftreten, hat nicht automatisch das eine das andere verursacht. Windige Tage haben weniger NO₂, aber der Playground beweist nicht, dass allein der Wind der Grund ist.' },
              { lead: 'Wichtigkeit der Merkmale', text: 'Sie zeigt, worauf sich dieses Modell auf den Testtagen stützt, nicht was in London das NO₂ erzeugt. Ähnliche Merkmale teilen sich ihre Wichtigkeit. Sie wird nachträglich auf den Testtagen berechnet, die Testtage sind damit nicht mehr rein unabhängig.' },
              { lead: 'Grenzen der Modelle', text: 'Es gibt eine Aufteilung in Training und Test, kein Wiederholen und keine Angabe der Unsicherheit. Das lineare Modell kann Werte unter null vorhersagen, die es in der Wirklichkeit nicht gibt. Sie werden gezählt und markiert, aber nicht korrigiert. Das Wetter gilt für eine gemeinsame Gitterzelle und nicht für die einzelne Station.' },
            ],
          },
        ],
      },
    ],
    glossaryTitle: 'Begriffe kurz erklärt',
    glossary: [
      { term: 'NO₂', text: 'Stickstoffdioxid, ein Luftschadstoff. Angegeben in µg/m³, also Mikrogramm pro Kubikmeter Luft.' },
      { term: 'Station', text: 'Ort, an dem die Luftqualität gemessen wird.' },
      { term: 'Tagesmittel', text: 'Durchschnitt der gültigen Stundenmesswerte eines Tages.' },
      { term: 'Filter (Tagesauswahl)', text: 'Legt fest, welche Tage in der Auswertung berücksichtigt werden.' },
      { term: 'Markierung', text: 'Hebt ausgewählte Tage in den Diagrammen hervor, ohne die Tagesauswahl zu verändern.' },
      { term: 'Median', text: 'Wert, bei dem die Hälfte der Messwerte darunter und die andere Hälfte darüber liegt.' },
      { term: 'Boxplot', text: 'Diagramm, das Median, die mittleren 50 Prozent und die Spannweite einer Verteilung zeigt.' },
      { term: 'ERA5, Reanalyse', text: 'Wetterdaten, die aus Beobachtungen und einem Wettermodell zusammengerechnet werden. Sie reichen weit zurück, sind aber keine Messung am Ort.' },
      { term: 'ULEZ', text: 'Ultra Low Emission Zone, eine Londoner Umweltzone mit Gebühr für ältere Fahrzeuge.' },
      { term: 'Merkmal', text: 'Eine Information, die ein Modell für seine Berechnung verwendet.' },
      { term: 'Training', text: 'Zeitraum, dessen Daten das Modell zum Lernen verwendet.' },
      { term: 'Test', text: 'Davon getrennter Zeitraum, mit dem die Prognosegüte geprüft wird.' },
      { term: 'Horizont', text: 'Anzahl der Tage zwischen Prognosezeitpunkt und vorherzusagendem Tag.' },
      { term: 'Baseline', text: 'Einfaches Vergleichsverfahren, an dem ein komplexeres Modell gemessen wird.' },
      { term: 'Persistenz', text: 'Baseline: Als Prognose dient der letzte bekannte Messwert.' },
      { term: 'Saisonal naiv', text: 'Baseline: Als Prognose dient der Wert desselben Wochentags der Vorwoche (bei längerem Horizont der entsprechend letzte bekannte).' },
      { term: 'Mittlerer absoluter Fehler (MAE)', text: 'Durchschnittliche Größe der Abweichung zwischen Prognose und Messung, ohne Rücksicht auf die Richtung. In µg/m³, kleiner ist besser.' },
      { term: 'RMSE', text: 'Wurzel des mittleren quadratischen Fehlers. Größere Abweichungen fallen stärker ins Gewicht als beim MAE.' },
      { term: 'Verzerrung (Bias)', text: 'Mittlere Abweichung mit Vorzeichen (Prognose minus Messung). Über null heißt: im Mittel zu hoch, unter null: zu niedrig. Zu hohe und zu niedrige Fehler heben sich hier auf, deshalb ergänzt sie den MAE.' },
      { term: 'Überanpassung', text: 'Ein Modell lernt die Trainingsdaten zu genau und funktioniert deshalb auf neuen Daten schlechter.' },
    ],
  }
}
