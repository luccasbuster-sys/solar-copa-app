const db = require("./database");

const matches = [
  ["A-01", "A", "Mexico", "South Africa", "2026-06-11", "2026-06-11T19:00:00Z", "Mexico City Stadium (Mexico City)"],
  ["A-02", "A", "Korea Republic", "Czechia", "2026-06-12", "2026-06-12T02:00:00Z", "Guadalajara Stadium (Guadalajara)"],
  ["B-01", "B", "Canada", "Bosnia and Herzegovina", "2026-06-12", "2026-06-12T19:00:00Z", "Toronto Stadium (Toronto)"],
  ["D-01", "D", "USA", "Paraguay", "2026-06-13", "2026-06-13T01:00:00Z", "Los Angeles Stadium (Los Angeles)"],
  ["B-02", "B", "Qatar", "Switzerland", "2026-06-13", "2026-06-13T19:00:00Z", "San Francisco Bay Area Stadium (San Francisco Bay Area)"],
  ["C-01", "C", "Brazil", "Morocco", "2026-06-13", "2026-06-13T22:00:00Z", "New York/New Jersey Stadium (New York)"],
  ["C-02", "C", "Haiti", "Scotland", "2026-06-14", "2026-06-14T01:00:00Z", "Boston Stadium (Boston)"],
  ["D-02", "D", "Australia", "Türkiye", "2026-06-14", "2026-06-14T04:00:00Z", "BC Place Vancouver (Vancouver)"],
  ["E-01", "E", "Germany", "Curaçao", "2026-06-14", "2026-06-14T17:00:00Z", "Houston Stadium (Houston)"],
  ["F-01", "F", "Netherlands", "Japan", "2026-06-14", "2026-06-14T20:00:00Z", "Dallas Stadium (Dallas)"],
  ["E-02", "E", "Côte d'Ivoire", "Ecuador", "2026-06-14", "2026-06-14T23:00:00Z", "Philadelphia Stadium (Philadelphia)"],
  ["F-02", "F", "Sweden", "Tunisia", "2026-06-15", "2026-06-15T02:00:00Z", "Monterrey Stadium (Monterrey)"],

  ["H-01", "H", "Spain", "Cabo Verde", "2026-06-15", "2026-06-15T16:00:00Z", "Atlanta Stadium (Atlanta)"],
  ["G-01", "G", "Belgium", "Egypt", "2026-06-15", "2026-06-15T19:00:00Z", "Seattle Stadium (Seattle)"],
  ["H-02", "H", "Saudi Arabia", "Uruguay", "2026-06-15", "2026-06-15T22:00:00Z", "Miami Stadium (Miami)"],
  ["G-02", "G", "IR Iran", "New Zealand", "2026-06-16", "2026-06-16T01:00:00Z", "Los Angeles Stadium (Los Angeles)"],
  ["I-01", "I", "France", "Senegal", "2026-06-16", "2026-06-16T19:00:00Z", "New York/New Jersey Stadium (New York)"],
  ["I-02", "I", "Iraq", "Norway", "2026-06-16", "2026-06-16T22:00:00Z", "Boston Stadium (Boston)"],
  ["J-01", "J", "Argentina", "Algeria", "2026-06-17", "2026-06-17T01:00:00Z", "Kansas City Stadium (Kansas City)"],
  ["J-02", "J", "Austria", "Jordan", "2026-06-17", "2026-06-17T04:00:00Z", "San Francisco Bay Area Stadium (San Francisco Bay Area)"],
  ["K-01", "K", "Portugal", "Congo DR", "2026-06-17", "2026-06-17T17:00:00Z", "Houston Stadium (Houston)"],
  ["L-01", "L", "England", "Croatia", "2026-06-17", "2026-06-17T20:00:00Z", "Dallas Stadium (Dallas)"],
  ["L-02", "L", "Ghana", "Panama", "2026-06-17", "2026-06-17T23:00:00Z", "Toronto Stadium (Toronto)"],
  ["K-02", "K", "Uzbekistan", "Colombia", "2026-06-18", "2026-06-18T02:00:00Z", "Mexico City Stadium (Mexico City)"],

  ["A-03", "A", "Czechia", "South Africa", "2026-06-18", "2026-06-18T16:00:00Z", "Atlanta Stadium (Atlanta)"],
  ["B-03", "B", "Switzerland", "Bosnia and Herzegovina", "2026-06-18", "2026-06-18T19:00:00Z", "Los Angeles Stadium (Los Angeles)"],
  ["B-04", "B", "Canada", "Qatar", "2026-06-18", "2026-06-18T22:00:00Z", "BC Place Vancouver (Vancouver)"],
  ["A-04", "A", "Mexico", "Korea Republic", "2026-06-19", "2026-06-19T01:00:00Z", "Guadalajara Stadium (Guadalajara)"],
  ["D-03", "D", "USA", "Australia", "2026-06-19", "2026-06-19T19:00:00Z", "Seattle Stadium (Seattle)"],
  ["C-03", "C", "Scotland", "Morocco", "2026-06-19", "2026-06-19T22:00:00Z", "Boston Stadium (Boston)"],
  ["C-04", "C", "Brazil", "Haiti", "2026-06-20", "2026-06-20T00:30:00Z", "Philadelphia Stadium (Philadelphia)"],
  ["D-04", "D", "Türkiye", "Paraguay", "2026-06-20", "2026-06-20T03:00:00Z", "San Francisco Bay Area Stadium (San Francisco Bay Area)"],
  ["F-03", "F", "Netherlands", "Sweden", "2026-06-20", "2026-06-20T17:00:00Z", "Houston Stadium (Houston)"],
  ["E-03", "E", "Germany", "Côte d'Ivoire", "2026-06-20", "2026-06-20T20:00:00Z", "Toronto Stadium (Toronto)"],
  ["E-04", "E", "Ecuador", "Curaçao", "2026-06-21", "2026-06-21T00:00:00Z", "Kansas City Stadium (Kansas City)"],
  ["F-04", "F", "Tunisia", "Japan", "2026-06-21", "2026-06-21T04:00:00Z", "Monterrey Stadium (Monterrey)"],

  ["H-03", "H", "Spain", "Saudi Arabia", "2026-06-21", "2026-06-21T16:00:00Z", "Atlanta Stadium (Atlanta)"],
  ["G-03", "G", "Belgium", "IR Iran", "2026-06-21", "2026-06-21T19:00:00Z", "Los Angeles Stadium (Los Angeles)"],
  ["H-04", "H", "Uruguay", "Cabo Verde", "2026-06-21", "2026-06-21T22:00:00Z", "Miami Stadium (Miami)"],
  ["G-04", "G", "New Zealand", "Egypt", "2026-06-22", "2026-06-22T01:00:00Z", "BC Place Vancouver (Vancouver)"],
  ["J-03", "J", "Argentina", "Austria", "2026-06-22", "2026-06-22T17:00:00Z", "Dallas Stadium (Dallas)"],
  ["I-03", "I", "France", "Iraq", "2026-06-22", "2026-06-22T21:00:00Z", "Philadelphia Stadium (Philadelphia)"],
  ["I-04", "I", "Norway", "Senegal", "2026-06-23", "2026-06-23T00:00:00Z", "New York/New Jersey Stadium (New York)"],
  ["J-04", "J", "Jordan", "Algeria", "2026-06-23", "2026-06-23T03:00:00Z", "San Francisco Bay Area Stadium (San Francisco Bay Area)"],
  ["K-03", "K", "Portugal", "Uzbekistan", "2026-06-23", "2026-06-23T17:00:00Z", "Houston Stadium (Houston)"],
  ["L-03", "L", "England", "Ghana", "2026-06-23", "2026-06-23T20:00:00Z", "Boston Stadium (Boston)"],
  ["L-04", "L", "Panama", "Croatia", "2026-06-23", "2026-06-23T23:00:00Z", "Toronto Stadium (Toronto)"],
  ["K-04", "K", "Colombia", "Congo DR", "2026-06-24", "2026-06-24T02:00:00Z", "Guadalajara Stadium (Guadalajara)"],

  ["B-05", "B", "Switzerland", "Canada", "2026-06-24", "2026-06-24T19:00:00Z", "BC Place Vancouver (Vancouver)"],
  ["B-06", "B", "Bosnia and Herzegovina", "Qatar", "2026-06-24", "2026-06-24T19:00:00Z", "Seattle Stadium (Seattle)"],
  ["C-05", "C", "Scotland", "Brazil", "2026-06-24", "2026-06-24T22:00:00Z", "Miami Stadium (Miami)"],
  ["C-06", "C", "Morocco", "Haiti", "2026-06-24", "2026-06-24T22:00:00Z", "Atlanta Stadium (Atlanta)"],
  ["A-05", "A", "Czechia", "Mexico", "2026-06-25", "2026-06-25T01:00:00Z", "Mexico City Stadium (Mexico City)"],
  ["A-06", "A", "South Africa", "Korea Republic", "2026-06-25", "2026-06-25T01:00:00Z", "Monterrey Stadium (Monterrey)"],
  ["E-05", "E", "Curaçao", "Côte d'Ivoire", "2026-06-25", "2026-06-25T20:00:00Z", "Philadelphia Stadium (Philadelphia)"],
  ["E-06", "E", "Ecuador", "Germany", "2026-06-25", "2026-06-25T20:00:00Z", "New York/New Jersey Stadium (New York)"],
  ["F-05", "F", "Japan", "Sweden", "2026-06-25", "2026-06-25T23:00:00Z", "Dallas Stadium (Dallas)"],
  ["F-06", "F", "Tunisia", "Netherlands", "2026-06-25", "2026-06-25T23:00:00Z", "Kansas City Stadium (Kansas City)"],

  ["D-05", "D", "Türkiye", "USA", "2026-06-26", "2026-06-26T02:00:00Z", "Los Angeles Stadium (Los Angeles)"],
  ["D-06", "D", "Paraguay", "Australia", "2026-06-26", "2026-06-26T02:00:00Z", "San Francisco Bay Area Stadium (San Francisco Bay Area)"],
  ["I-05", "I", "Norway", "France", "2026-06-26", "2026-06-26T19:00:00Z", "Boston Stadium (Boston)"],
  ["I-06", "I", "Senegal", "Iraq", "2026-06-26", "2026-06-26T19:00:00Z", "Toronto Stadium (Toronto)"],
  ["H-05", "H", "Cabo Verde", "Saudi Arabia", "2026-06-27", "2026-06-27T00:00:00Z", "Houston Stadium (Houston)"],
  ["H-06", "H", "Uruguay", "Spain", "2026-06-27", "2026-06-27T00:00:00Z", "Guadalajara Stadium (Guadalajara)"],
  ["G-05", "G", "Egypt", "IR Iran", "2026-06-27", "2026-06-27T03:00:00Z", "Seattle Stadium (Seattle)"],
  ["G-06", "G", "New Zealand", "Belgium", "2026-06-27", "2026-06-27T03:00:00Z", "BC Place Vancouver (Vancouver)"],
  ["L-05", "L", "Panama", "England", "2026-06-27", "2026-06-27T21:00:00Z", "New York/New Jersey Stadium (New York)"],
  ["L-06", "L", "Croatia", "Ghana", "2026-06-27", "2026-06-27T21:00:00Z", "Philadelphia Stadium (Philadelphia)"],
  ["K-05", "K", "Colombia", "Portugal", "2026-06-27", "2026-06-27T23:30:00Z", "Miami Stadium (Miami)"],
  ["K-06", "K", "Congo DR", "Uzbekistan", "2026-06-27", "2026-06-27T23:30:00Z", "Atlanta Stadium (Atlanta)"],
  ["J-05", "J", "Algeria", "Austria", "2026-06-28", "2026-06-28T02:00:00Z", "Kansas City Stadium (Kansas City)"],
  ["J-06", "J", "Jordan", "Argentina", "2026-06-28", "2026-06-28T02:00:00Z", "Dallas Stadium (Dallas)"]
];

db.serialize(() => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO matches (
      id,
      group_name,
      home_team,
      away_team,
      match_date,
      kickoff_at,
      venue,
      stage
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Fase de grupos')
  `);

  matches.forEach(match => {
    stmt.run(match);
  });

  stmt.finalize((error) => {
    if (error) {
      console.error("Erro ao inserir jogos:", error.message);
      process.exit(1);
    }

    console.log(`${matches.length} jogos da fase de grupos inseridos no banco.`);
    db.close();
  });
});