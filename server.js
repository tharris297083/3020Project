import express from "express";
import 'dotenv/config';
import fs from "fs";

const app = express();
const PORT = 3000;

app.use(express.static("public"));

function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

// Convert decimal → American odds
function decimalToAmerican(decimal) {
  if (decimal === null || decimal === undefined) return null;
  if (decimal >= 2.0) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

// Clean sportsbook names
function cleanBookName(name) {
  return name
    .replace(".ag", "")
    .replace(".lv", "")
    .replace(".us", "")
    .replace(".com", "")
    .trim();
}

// Compare American odds correctly
function isBetterAmerican(newPrice, currentBest) {
  if (newPrice === null) return false;
  if (currentBest === null) return true;

  const newPos = newPrice > 0;
  const bestPos = currentBest > 0;

  if (newPos && bestPos) return newPrice > currentBest;
  if (!newPos && !bestPos) return newPrice > currentBest;
  return newPos;
}

// Load previous odds
let previousOdds = {};
try {
  previousOdds = JSON.parse(fs.readFileSync("./data/previousOdds.json"));
} catch {
  previousOdds = {};
}

// Movement arrow logic
function getMovementArrow(current, previous) {
  if (previous === undefined || previous === null) return "";
  if (current > previous) return "↑";
  if (current < previous) return "↓";
  return "";
}

app.get("/nba/tomorrow", async (req, res) => {
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${process.env.API_KEY}&regions=us&markets=h2h`;

  const response = await fetch(url);
  const data = await response.json();

  const gamesArray = Array.isArray(data) ? data : [data];

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  let gamesTomorrow = gamesArray.filter(game => {
    const gameDate = new Date(game.commence_time).toISOString().split("T")[0];
    return gameDate === tomorrowStr;
  });

  if (gamesTomorrow.length === 0 && gamesArray.length > 0) {
    const sorted = [...gamesArray].sort(
      (a, b) => new Date(a.commence_time) - new Date(b.commence_time)
    );
    const nextDate = new Date(sorted[0].commence_time)
      .toISOString()
      .split("T")[0];

    gamesTomorrow = gamesArray.filter(game => {
      const gameDate = new Date(game.commence_time).toISOString().split("T")[0];
      return gameDate === nextDate;
    });
  }

  const matchups = gamesTomorrow.map(game => {
    const teamA = game.home_team;
    const teamB = game.away_team;
    const time = formatTime(game.commence_time);
    return `${teamA} vs ${teamB} — ${time}`;
  });

  const logos = {
    "FanDuel": "/logos/fanduel.png",
    "DraftKings": "/logos/draftkings.png",
    "BetMGM": "/logos/betmgm.png",
    "Caesars": "/logos/caesars.png",
    "PointsBet": "/logos/pointsbet.png",
    "BetRivers": "/logos/betrivers.png",
    "ESPN BET": "/logos/espnbet.png",
    "Bet365": "/logos/bet365.png",
    "Bovada": "/logos/bovada.png",
    "BetOnline": "/logos/betonline.png",
    "LowVig": "/logos/lowvig.png",
    "BetUS": "/logos/betus.png",
    "MyBookie": "/logos/mybookie.png"
  };

  const booksMap = {};

  gamesTomorrow.forEach(game => {
    const gameId = game.id;
    const teamA = game.home_team;
    const teamB = game.away_team;

    game.bookmakers.forEach(book => {
      const cleanName = cleanBookName(book.title);

      const market = book.markets?.find(m => m.key === "h2h");
      const outcomes = market?.outcomes ?? [];

      const decA = outcomes.find(o => o.name === teamA)?.price ?? null;
      const decB = outcomes.find(o => o.name === teamB)?.price ?? null;

      const oddsA = decimalToAmerican(decA);
      const oddsB = decimalToAmerican(decB);

      if (!booksMap[cleanName]) {
        booksMap[cleanName] = {
          book: cleanName,
          logo: logos[cleanName] ?? null,
          prices: {}
        };
      }

      const prevA = previousOdds[cleanName]?.prices?.[gameId]?.rawA;
      const prevB = previousOdds[cleanName]?.prices?.[gameId]?.rawB;

      const moveA = getMovementArrow(oddsA, prevA);
      const moveB = getMovementArrow(oddsB, prevB);

      booksMap[cleanName].prices[gameId] = {
        rawA: oddsA,
        rawB: oddsB,
        teamA: oddsA > 0 ? `+${oddsA}` : `${oddsA}`,
        teamB: oddsB > 0 ? `+${oddsB}` : `${oddsB}`,
        moveA,
        moveB
      };
    });
  });

  const bestPrices = gamesTomorrow.map(game => {
    const gameId = game.id;
    let bestA = null;
    let bestB = null;

    for (const book of Object.values(booksMap)) {
      const price = book.prices[gameId];
      if (!price) continue;

      if (isBetterAmerican(price.rawA, bestA?.price ?? null)) {
        bestA = { book: book.book, price: price.rawA };
      }

      if (isBetterAmerican(price.rawB, bestB?.price ?? null)) {
        bestB = { book: book.book, price: price.rawB };
      }
    }

    return { bestA, bestB };
  });

  // Save updated odds for next refresh
  fs.writeFileSync("./data/previousOdds.json", JSON.stringify(booksMap, null, 2));

  // Convert prices back to array order for frontend
const booksArray = Object.values(booksMap).map(book => {
  return {
    book: book.book,
    logo: book.logo,
    prices: gamesTomorrow.map(game => {
      const gameId = game.id;
      const p = book.prices[gameId];

      return p
        ? p
        : {
            rawA: null,
            rawB: null,
            teamA: "",
            teamB: "",
            moveA: "",
            moveB: ""
          };
    })
  };
});
  res.json({
    games: matchups,
    books: booksArray,
    best: bestPrices
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});