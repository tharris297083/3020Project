import express from "express";
import 'dotenv/config';
import fs from "fs";

const app = express();
const PORT = 3000;

app.use(express.static("public"));

// Cache settings
const CACHE_DIR = "./data";
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Market configuration
const MARKETS = {
  h2h: "Head-to-Head",
  spreads: "Point Spreads",
  totals: "Totals"
};

// Sports configuration
const SPORTS = {
  nba: { key: "basketball_nba", name: "NBA" },
  nfl: { key: "americanfootball_nfl", name: "NFL" },
  cfb: { key: "americanfootball_ncaaf", name: "College Football" },
  cbb: { key: "basketball_ncaab", name: "College Basketball" },
  mlb: { key: "baseball_mlb", name: "MLB" }
};

function getCachePath(sport, market) {
  return `${CACHE_DIR}/${sport}_${market}Data.json`;
}

function getCacheMeta(sport, market) {
  return `${CACHE_DIR}/${sport}_${market}Meta.json`;
}

// Check if cache is still valid
function isCacheValid(sport, market) {
  try {
    const metaPath = getCacheMeta(sport, market);
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath));
    return Date.now() - meta.timestamp < CACHE_DURATION;
  } catch {
    return false;
  }
}

// Get cached data
function getCachedData(sport, market) {
  try {
    if (!isCacheValid(sport, market)) return null;
    const dataPath = getCachePath(sport, market);
    return JSON.parse(fs.readFileSync(dataPath));
  } catch {
    return null;
  }
}

// Save to cache
function saveToCache(sport, market, data) {
  try {
    fs.writeFileSync(getCachePath(sport, market), JSON.stringify(data, null, 2));
    fs.writeFileSync(getCacheMeta(sport, market), JSON.stringify({ timestamp: Date.now() }));
  } catch (err) {
    console.error(`Cache save error for ${sport} ${market}:`, err);
  }
}

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

// Calculate implied probability from American odds
function getImpliedProbability(americanOdds) {
  if (americanOdds === null) return null;
  if (americanOdds > 0) {
    return (100 / (americanOdds + 100)) * 100;
  }
  return ((-americanOdds) / (-americanOdds + 100)) * 100;
}

// Calculate +EV percentage
function calculateEV(currentOdds, bestOdds) {
  if (currentOdds === null || bestOdds === null) return null;
  const currentProb = getImpliedProbability(currentOdds);
  const bestProb = getImpliedProbability(bestOdds);
  const ev = bestProb - currentProb;
  return ev > 0 ? ev : 0;
}

// Movement arrow logic
function getMovementArrow(current, previous) {
  if (previous === undefined || previous === null) return "";
  if (current > previous) return "↑";
  if (current < previous) return "↓";
  return "";
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

// Load previous odds for all sports
let previousOdds = {};
for (const sport of Object.keys(SPORTS)) {
  try {
    previousOdds[sport] = JSON.parse(fs.readFileSync(`${CACHE_DIR}/${sport}PreviousOdds.json`));
  } catch {
    previousOdds[sport] = {};
  }
}

// Fetch and process odds for a specific sport
async function fetchOddsForSport(sportKey, sportName, market = "h2h") {
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${process.env.API_KEY}&regions=us&markets=${market}`;

  try {
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
        const bookMarket = book.markets?.find(m => m.key === market);
        const outcomes = bookMarket?.outcomes ?? [];

        if (!booksMap[cleanName]) {
          booksMap[cleanName] = {
            book: cleanName,
            logo: logos[cleanName] ?? null,
            prices: {}
          };
        }

        if (market === "h2h") {
          // Head-to-head odds
          const decA = outcomes.find(o => o.name === teamA)?.price ?? null;
          const decB = outcomes.find(o => o.name === teamB)?.price ?? null;

          const oddsA = decimalToAmerican(decA);
          const oddsB = decimalToAmerican(decB);

          booksMap[cleanName].prices[gameId] = {
            rawA: oddsA,
            rawB: oddsB,
            teamA: oddsA > 0 ? `+${oddsA}` : `${oddsA}`,
            teamB: oddsB > 0 ? `+${oddsB}` : `${oddsB}`,
            probA: getImpliedProbability(oddsA),
            probB: getImpliedProbability(oddsB),
            moveA: "",
            moveB: ""
          };
        } else if (market === "spreads") {
          // Point spreads
          const homeSpread = outcomes.find(o => o.name === teamA);
          const awaySpread = outcomes.find(o => o.name === teamB);

          const homeOdds = homeSpread?.price ? decimalToAmerican(homeSpread.price) : null;
          const awayOdds = awaySpread?.price ? decimalToAmerican(awaySpread.price) : null;

          const homePoint = homeSpread?.point ?? null;
          const awayPoint = awaySpread?.point ?? null;

          booksMap[cleanName].prices[gameId] = {
            rawA: homeOdds,
            rawB: awayOdds,
            teamA: homeOdds ? `${homePoint > 0 ? "+" : ""}${homePoint} (${homeOdds > 0 ? "+" : ""}${homeOdds})` : "—",
            teamB: awayOdds ? `${awayPoint > 0 ? "+" : ""}${awayPoint} (${awayOdds > 0 ? "+" : ""}${awayOdds})` : "—",
            probA: getImpliedProbability(homeOdds),
            probB: getImpliedProbability(awayOdds),
            moveA: "",
            moveB: ""
          };
        } else if (market === "totals") {
          // Over/Under totals
          const over = outcomes.find(o => o.name === "Over");
          const under = outcomes.find(o => o.name === "Under");

          const overOdds = over?.price ? decimalToAmerican(over.price) : null;
          const underOdds = under?.price ? decimalToAmerican(under.price) : null;

          const totalPoints = over?.point ?? null;

          booksMap[cleanName].prices[gameId] = {
            rawA: overOdds,
            rawB: underOdds,
            teamA: overOdds ? `O ${totalPoints} (${overOdds > 0 ? "+" : ""}${overOdds})` : "—",
            teamB: underOdds ? `U ${totalPoints} (${underOdds > 0 ? "+" : ""}${underOdds})` : "—",
            probA: getImpliedProbability(overOdds),
            probB: getImpliedProbability(underOdds),
            moveA: "",
            moveB: ""
          };
        }
      });
    });

    // Calculate best prices AND average for EV
    const bestPrices = gamesTomorrow.map(game => {
      const gameId = game.id;
      let bestA = null;
      let bestB = null;
      let sumOddsA = 0;
      let sumOddsB = 0;
      let countA = 0;
      let countB = 0;

      for (const book of Object.values(booksMap)) {
        const price = book.prices[gameId];
        if (!price) continue;

        if (price.rawA !== null) {
          sumOddsA += getImpliedProbability(price.rawA);
          countA++;
        }
        if (price.rawB !== null) {
          sumOddsB += getImpliedProbability(price.rawB);
          countB++;
        }

        if (isBetterAmerican(price.rawA, bestA?.price ?? null)) {
          bestA = { book: book.book, price: price.rawA };
        }

        if (isBetterAmerican(price.rawB, bestB?.price ?? null)) {
          bestB = { book: book.book, price: price.rawB };
        }
      }

      // Calculate average probabilities for EV comparison
      const avgProbA = countA > 0 ? sumOddsA / countA : null;
      const avgProbB = countB > 0 ? sumOddsB / countB : null;

      return { bestA, bestB, avgProbA, avgProbB };
    });

    const booksArray = Object.values(booksMap).map(book => {
      return {
        book: book.book,
        logo: book.logo,
        prices: gamesTomorrow.map((game, gameIdx) => {
          const gameId = game.id;
          const p = book.prices[gameId];
          const best = bestPrices[gameIdx];

          return p
            ? {
                ...p,
                evA: p.probA && best.avgProbA ? best.avgProbA - p.probA : null,
                evB: p.probB && best.avgProbB ? best.avgProbB - p.probB : null
              }
            : {
                rawA: null,
                rawB: null,
                teamA: "",
                teamB: "",
                probA: null,
                probB: null,
                evA: null,
                evB: null,
                moveA: "",
                moveB: ""
              };
        })
      };
    });

    return {
      games: matchups,
      books: booksArray,
      best: bestPrices,
      sport: sportName,
      market: MARKETS[market],
      updated: new Date().toISOString()
    };
  } catch (err) {
    console.error(`Error fetching ${sportName} ${market}:`, err);
    return null;
  }
}

// Generic endpoint for specific sport and market
app.get("/odds/:sport/:market", async (req, res) => {
  const sportKey = Object.keys(SPORTS).find(key => key === req.params.sport);
  const market = req.params.market;
  
  if (!sportKey || !MARKETS[market]) {
    return res.status(400).json({ error: "Invalid sport or market" });
  }

  // Try cache first
  const cached = getCachedData(sportKey, market);
  if (cached) {
    return res.json(cached);
  }

  // If cache miss, fetch fresh data
  const data = await fetchOddsForSport(SPORTS[sportKey].key, SPORTS[sportKey].name, market);
  if (data) {
    saveToCache(sportKey, market, data);
    res.json(data);
  } else {
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});

// Endpoint to get specific sport with default market
app.get("/odds/:sport", async (req, res) => {
  const sportKey = Object.keys(SPORTS).find(key => key === req.params.sport);
  
  if (!sportKey) {
    return res.status(400).json({ error: "Invalid sport" });
  }

  // Try cache first
  const cached = getCachedData(sportKey, "h2h");
  if (cached) {
    return res.json(cached);
  }

  // If cache miss, fetch fresh data
  const data = await fetchOddsForSport(SPORTS[sportKey].key, SPORTS[sportKey].name, "h2h");
  if (data) {
    saveToCache(sportKey, "h2h", data);
    res.json(data);
  } else {
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});

// Legacy endpoint for backward compatibility
app.get("/nba/tomorrow", async (req, res) => {
  const cached = getCachedData("nba", "h2h");
  if (cached) {
    return res.json(cached);
  }
  
  const data = await fetchOddsForSport(SPORTS.nba.key, SPORTS.nba.name, "h2h");
  if (data) {
    saveToCache("nba", "h2h", data);
    res.json(data);
  } else {
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});

// Background refresh function
async function refreshAllSports() {
  console.log("Starting background refresh...");
  for (const [sportKey, sport] of Object.entries(SPORTS)) {
    for (const [marketKey, marketName] of Object.entries(MARKETS)) {
      if (!isCacheValid(sportKey, marketKey)) {
        console.log(`Refreshing ${sport.name} ${marketName}...`);
        const data = await fetchOddsForSport(sport.key, sport.name, marketKey);
        if (data) {
          saveToCache(sportKey, marketKey, data);
          console.log(`✓ ${sport.name} ${marketName} updated`);
        }
      }
    }
  }
  console.log("Background refresh complete");
}

// Endpoint to get all positive EV bets across all sports and markets
app.get("/best-bets", async (req, res) => {
  const allBets = [];

  for (const [sportKey, sport] of Object.entries(SPORTS)) {
    for (const [marketKey, marketName] of Object.entries(MARKETS)) {
      const data = getCachedData(sportKey, marketKey);
      if (!data) continue;

      data.games.forEach((game, gameIdx) => {
        data.books.forEach(book => {
          const price = book.prices[gameIdx];
          if (!price) return;

          // Side A
          if (price.evA !== null && price.evA >= 0) {
            allBets.push({
              sport: sport.name,
              market: marketName,
              game: game,
              book: book.book,
              logo: book.logo,
              side: price.teamA,
              odds: price.rawA,
              probability: price.probA ? price.probA.toFixed(1) : "—",
              ev: price.evA ? price.evA.toFixed(2) : "0.00"
            });
          }

          // Side B
          if (price.evB !== null && price.evB >= 0) {
            allBets.push({
              sport: sport.name,
              market: marketName,
              game: game,
              book: book.book,
              logo: book.logo,
              side: price.teamB,
              odds: price.rawB,
              probability: price.probB ? price.probB.toFixed(1) : "—",
              ev: price.evB ? price.evB.toFixed(2) : "0.00"
            });
          }
        });
      });
    }
  }

  // Sort by EV descending
  allBets.sort((a, b) => parseFloat(b.ev) - parseFloat(a.ev));

  res.json({
    totalBets: allBets.length,
    bets: allBets
  });
});

// Run background refresh every 15 minutes
setInterval(refreshAllSports, 15 * 60 * 1000);

// Initial refresh on startup
refreshAllSports();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});;
