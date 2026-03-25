let currentSport = "nba";
let currentMarket = "h2h";
let currentView = "comparison";

async function loadOdds(sport, market) {
  try {
    console.log("Loading odds for:", sport, market);
    const res = await fetch(`/odds/${sport}/${market}`);
    console.log("Response status:", res.status);
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    console.log("DATA RECEIVED:", data);
    
    if (!data || !data.games || !data.books) {
      throw new Error("Invalid response structure: missing games or books");
    }
    
    buildTable(data);
  } catch (err) {
    console.error("LOAD ERROR:", err);
    document.getElementById("table-container").innerHTML = 
      `<p style="text-align:center;color:red;">Error loading odds: ${err.message}</p>`;
  }
}

async function loadBestBets() {
  try {
    console.log("Loading best bets...");
    const res = await fetch("/best-bets");
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    console.log("BEST BETS DATA:", data);
    
    buildBestBetsTable(data);
  } catch (err) {
    console.error("BEST BETS ERROR:", err);
    document.getElementById("table-container").innerHTML = 
      `<p style="text-align:center;color:red;">Error loading best bets: ${err.message}</p>`;
  }
}

function buildTable(data) {
  console.log("BUILDING TABLE WITH:", data);

  const container = document.getElementById("table-container");
  
  if (!data.games || data.games.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>No games available for this sport.</p>";
    return;
  }

  let html = "<table><thead><tr><th>Sportsbook</th>";

  data.games.forEach(game => {
    html += `<th>${game}</th>`;
  });

  html += "</tr></thead><tbody>";

  data.books.forEach(book => {
    html += `<tr><td><img src="${book.logo}" width="24"> ${book.book}</td>`;

    book.prices.forEach((price, i) => {
      console.log("PRICE:", price);

      //  Compare raw odds, not formatted odds
      const isBestA = price.rawA === data.best[i].bestA?.price;
      const isBestB = price.rawB === data.best[i].bestB?.price;

      //  Use raw odds to determine favorite/underdog
      const classA = isBestA
        ? (price.rawA < 0 ? "best-favorite" : "best-underdog")
        : "";

      const classB = isBestB
        ? (price.rawB < 0 ? "best-favorite" : "best-underdog")
        : "";

      // Movement arrows (already correct)
      const arrowA =
        price.moveA === "↑"
          ? '<span class="arrow-up">↑</span>'
          : price.moveA === "↓"
          ? '<span class="arrow-down">↓</span>'
          : "";

      const arrowB =
        price.moveB === "↑"
          ? '<span class="arrow-up">↑</span>'
          : price.moveB === "↓"
          ? '<span class="arrow-down">↓</span>'
          : "";

      // Format probability and +EV
      const probA = price.probA !== null ? `${price.probA.toFixed(1)}%` : "—";
      const probB = price.probB !== null ? `${price.probB.toFixed(1)}%` : "—";
      const evA = price.evA !== null && price.evA > 0 ? `+${price.evA.toFixed(1)}%` : "—";
      const evB = price.evB !== null && price.evB > 0 ? `+${price.evB.toFixed(1)}%` : "—";

      html += `
        <td>
          <div class="${classA}">
            ${price.teamA} ${arrowA}
            <div class="prob-ev">
              <div class="stat"><span class="label">Prob:</span> <span class="probability">${probA}</span></div>
              <div class="stat"><span class="label">EV:</span> <span class="ev">${evA}</span></div>
            </div>
          </div>
          <div class="${classB}">
            ${price.teamB} ${arrowB}
            <div class="prob-ev">
              <div class="stat"><span class="label">Prob:</span> <span class="probability">${probB}</span></div>
              <div class="stat"><span class="label">EV:</span> <span class="ev">${evB}</span></div>
            </div>
          </div>
        </td>
      `;
    });

    html += "</tr>";
  });

  html += "</tbody></table>";

  container.innerHTML = html;
}

function buildBestBetsTable(data) {
  console.log("BUILDING BEST BETS TABLE:", data);

  const container = document.getElementById("table-container");
  
  if (!data.bets || data.bets.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>No positive EV bets available.</p>";
    return;
  }

  let html = `<div class="best-bets-summary">Total Positive EV Bets: ${data.totalBets}</div>`;
  html += "<table><thead><tr>";
  html += "<th>Rank</th>";
  html += "<th>EV%</th>";
  html += "<th>Book</th>";
  html += "<th>Side</th>";
  html += "<th>Odds</th>";
  html += "<th>Prob%</th>";
  html += "<th>Sport</th>";
  html += "<th>Market</th>";
  html += "<th>Game</th>";
  html += "</tr></thead><tbody>";

  data.bets.forEach((bet, idx) => {
    const evClass = parseFloat(bet.ev) >= 1 ? "best-bet-high" : "best-bet-medium";
    const oddsFormatted = bet.odds > 0 ? `+${bet.odds}` : bet.odds;
    
    html += `<tr class="${evClass}">`;
    html += `<td>${idx + 1}</td>`;
    html += `<td><span class="ev-badge">+${bet.ev}%</span></td>`;
    html += `<td><img src="${bet.logo}" width="20"> ${bet.book}</td>`;
    html += `<td><strong>${bet.side}</strong></td>`;
    html += `<td>${oddsFormatted}</td>`;
    html += `<td>${bet.probability}%</td>`;
    html += `<td>${bet.sport}</td>`;
    html += `<td>${bet.market}</td>`;
    html += `<td>${bet.game}</td>`;
    html += `</tr>`;
  });

  html += "</tbody></table>";

  container.innerHTML = html;
}

// Sport selector and market selector buttons
document.addEventListener("DOMContentLoaded", () => {
  const viewButtons = document.querySelectorAll(".view-btn");
  const sportButtons = document.querySelectorAll(".sport-btn");
  const marketButtons = document.querySelectorAll(".market-btn");
  
  // View selector
  viewButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const view = e.target.dataset.view;
      
      // Update active button
      viewButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      // Show/hide sport and market selectors
      document.getElementById("sport-selector").style.display = view === "comparison" ? "flex" : "none";
      document.getElementById("market-selector").style.display = view === "comparison" ? "flex" : "none";
      
      // Load appropriate view
      currentView = view;
      document.getElementById("table-container").innerHTML = "Loading...";
      
      if (view === "comparison") {
        loadOdds(currentSport, currentMarket);
      } else if (view === "best-bets") {
        loadBestBets();
      }
    });
  });
  
  sportButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const sport = e.target.dataset.sport;
      
      // Update active button
      sportButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      // Load new sport
      currentSport = sport;
      document.getElementById("table-container").innerHTML = "Loading...";
      loadOdds(currentSport, currentMarket);
    });
  });

  marketButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const market = e.target.dataset.market;
      
      // Update active button
      marketButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      // Load new market
      currentMarket = market;
      document.getElementById("table-container").innerHTML = "Loading...";
      loadOdds(currentSport, currentMarket);
    });
  });

  // Load initial sport and market
  loadOdds(currentSport, currentMarket);
});
