let currentSport = "nba";
let currentMarket = "h2h";
let currentView = "comparison";
let currentTableData = null; // Store original table data for filtering
let globalSearchMode = false; // Track if we're in global search mode
let syncingHorizontalScroll = false;

function updateTopScrollbar() {
  const tableContainer = document.getElementById("table-container");
  const topScrollbar = document.getElementById("top-scrollbar");
  const topScrollbarInner = document.getElementById("top-scrollbar-inner");

  if (!tableContainer || !topScrollbar || !topScrollbarInner) return;

  requestAnimationFrame(() => {
    const needsScrollbar = tableContainer.scrollWidth > tableContainer.clientWidth;

    topScrollbar.style.display = needsScrollbar ? "block" : "none";
    topScrollbarInner.style.width = `${tableContainer.scrollWidth}px`;
    topScrollbar.scrollLeft = tableContainer.scrollLeft;
  });
}

function setupSyncedHorizontalScroll() {
  const tableContainer = document.getElementById("table-container");
  const topScrollbar = document.getElementById("top-scrollbar");

  if (!tableContainer || !topScrollbar) return;

  topScrollbar.addEventListener("scroll", () => {
    if (syncingHorizontalScroll) return;
    syncingHorizontalScroll = true;
    tableContainer.scrollLeft = topScrollbar.scrollLeft;
    syncingHorizontalScroll = false;
  });

  tableContainer.addEventListener("scroll", () => {
    if (syncingHorizontalScroll) return;
    syncingHorizontalScroll = true;
    topScrollbar.scrollLeft = tableContainer.scrollLeft;
    syncingHorizontalScroll = false;
  });

  window.addEventListener("resize", updateTopScrollbar);
}

async function globalSearch(query) {
  try {
    if (!query || query.length < 2) {
      globalSearchMode = false;
      loadOdds(currentSport, currentMarket);
      return;
    }

    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (!data.results || data.results.length === 0) {
      document.getElementById("table-container").innerHTML = 
        "<p style='text-align:center;'>No games match your search.</p>";
      updateTopScrollbar();
      globalSearchMode = false;
      return;
    }

    globalSearchMode = true;
    buildGlobalSearchResults(data.results);
  } catch (err) {
    console.error("GLOBAL SEARCH ERROR:", err);
    document.getElementById("table-container").innerHTML = 
      `<p style="text-align:center;color:red;">Error searching: ${err.message}</p>`;
    updateTopScrollbar();
    globalSearchMode = false;
  }
}

function buildGlobalSearchResults(results) {
  const container = document.getElementById("table-container");
  let html = `<div class="global-search-results">`;

  results.forEach(result => {
    html += `<div class="search-result-game">
      <div class="result-header">
        <h3>${result.game}</h3>
        <span class="result-sport">${result.sport}</span>
      </div>`;

    // Display all three markets for this game
    Object.entries(result.markets).forEach(([marketKey, marketData]) => {
      const bestLines = getBestSearchLines(marketData.books);

      html += `<div class="market-section">
        <h4>${marketData.name}</h4>
        <table class="search-result-table">
          <thead>
            <tr>
              <th>Sportsbook</th>
              <th>Line</th>
              <th>Prob%</th>
              <th>EV%</th>
            </tr>
          </thead>
          <tbody>`;

      marketData.books.forEach(book => {
        const p = book.price;
        if (!p) return;

        const isBestA = p.rawA !== null && p.rawA === bestLines.bestA;
        const isBestB = p.rawB !== null && p.rawB === bestLines.bestB;
        const classA = isBestA ? getBestLineClass(p.rawA) : "";
        const classB = isBestB ? getBestLineClass(p.rawB) : "";
        const bestBadgeA = isBestA ? '<span class="best-line-badge">Best</span>' : "";
        const bestBadgeB = isBestB ? '<span class="best-line-badge">Best</span>' : "";

        html += `<tr>
          <td><img src="${book.logo}" width="20"> ${book.book}</td>
          <td>
            <div class="${classA}">${p.teamA || "—"} ${bestBadgeA}</div>
            <div class="${classB}">${p.teamB || "—"} ${bestBadgeB}</div>
          </td>
          <td>
            <div>${p.probA !== null ? p.probA.toFixed(1) + "%" : "—"}</div>
            <div>${p.probB !== null ? p.probB.toFixed(1) + "%" : "—"}</div>
          </td>
          <td>
            <div>${p.evA !== null && p.evA > 0 ? "+" + p.evA.toFixed(1) + "%" : "—"}</div>
            <div>${p.evB !== null && p.evB > 0 ? "+" + p.evB.toFixed(1) + "%" : "—"}</div>
          </td>
        </tr>`;
      });

      html += `</tbody></table></div>`;
    });

    html += `</div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
  updateTopScrollbar();
}

function isBetterAmerican(newPrice, currentBest) {
  if (newPrice === null || newPrice === undefined) return false;
  if (currentBest === null || currentBest === undefined) return true;

  const newPos = newPrice > 0;
  const bestPos = currentBest > 0;

  if (newPos && bestPos) return newPrice > currentBest;
  if (!newPos && !bestPos) return newPrice > currentBest;
  return newPos;
}

function getBestSearchLines(books) {
  return books.reduce(
    (best, book) => {
      const price = book.price;
      if (!price) return best;

      if (isBetterAmerican(price.rawA, best.bestA)) {
        best.bestA = price.rawA;
      }

      if (isBetterAmerican(price.rawB, best.bestB)) {
        best.bestB = price.rawB;
      }

      return best;
    },
    { bestA: null, bestB: null }
  );
}

function getBestLineClass(price) {
  return price < 0 ? "best-favorite search-best-line" : "best-underdog search-best-line";
}

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
    updateTopScrollbar();
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
    updateTopScrollbar();
  }
}

function buildTable(data) {
  console.log("BUILDING TABLE WITH:", data);

  currentTableData = data; // Store for filtering
  const container = document.getElementById("table-container");
  
  if (!data.games || data.games.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>No games available for this sport.</p>";
    updateTopScrollbar();
    return;
  }

  renderTable(data);
}

function renderTable(data, searchFilter = "") {
  const container = document.getElementById("table-container");
  
  if (!data.games || data.games.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>No games available for this sport.</p>";
    updateTopScrollbar();
    return;
  }

  // Filter games based on search input
  const filteredGames = searchFilter 
    ? data.games.filter(game => game.toLowerCase().includes(searchFilter.toLowerCase()))
    : data.games;

  if (filteredGames.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>No games match your search.</p>";
    updateTopScrollbar();
    return;
  }

  let html = "<table><thead><tr><th>Sportsbook</th>";

  filteredGames.forEach(game => {
    html += `<th>${game}</th>`;
  });

  html += "</tr></thead><tbody>";

  data.books.forEach(book => {
    html += `<tr><td><img src="${book.logo}" width="24"> ${book.book}</td>`;

    book.prices.forEach((price, i) => {
      // Skip if this game is filtered out
      if (!filteredGames.includes(data.games[i])) {
        return;
      }

      console.log("PRICE:", price);

      // ⭐ FIXED: Compare raw odds, not formatted odds
      const isBestA = price.rawA === data.best[i].bestA?.price;
      const isBestB = price.rawB === data.best[i].bestB?.price;

      // ⭐ FIXED: Use raw odds to determine favorite/underdog
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
  updateTopScrollbar();
}

function buildBestBetsTable(data) {
  console.log("BUILDING BEST BETS TABLE:", data);

  const container = document.getElementById("table-container");
  
  if (!data.bets || data.bets.length === 0) {
    container.innerHTML = "<p style='text-align:center;'>No positive EV bets available.</p>";
    updateTopScrollbar();
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
  updateTopScrollbar();
}

function updateViewControls(view) {
  const isComparisonView = view === "comparison";
  const sportSelector = document.getElementById("sport-selector");
  const marketSelector = document.getElementById("market-selector");
  const searchInput = document.getElementById("search-input");

  if (sportSelector) {
    sportSelector.style.display = isComparisonView ? "flex" : "none";
  }

  if (marketSelector) {
    marketSelector.style.display = isComparisonView ? "flex" : "none";
  }

  if (searchInput) {
    searchInput.style.display = isComparisonView ? "block" : "none";
  }
}

// Sport selector and market selector buttons
document.addEventListener("DOMContentLoaded", () => {
  const viewButtons = document.querySelectorAll(".view-btn");
  const sportButtons = document.querySelectorAll(".sport-btn");
  const marketButtons = document.querySelectorAll(".market-btn");
  const searchInput = document.getElementById("search-input");

  setupSyncedHorizontalScroll();
  updateViewControls(currentView);
  
  // Search input listener
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value;
      if (query.length >= 2) {
        globalSearch(query);
      } else if (query.length === 0) {
        globalSearchMode = false;
        if (currentTableData) {
          renderTable(currentTableData, "");
        }
      }
    });
  }

  // View selector
  viewButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const view = e.target.dataset.view;
      
      // Update active button
      viewButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      updateViewControls(view);
      if (searchInput) {
        searchInput.value = ""; // Clear search on view change
      }
      
      // Load appropriate view
      currentView = view;
      document.getElementById("table-container").innerHTML = "Loading...";
      updateTopScrollbar();
      
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
      
      // Clear search and exit global search mode
      if (searchInput) {
        searchInput.value = "";
      }
      globalSearchMode = false;

      // Load new sport
      currentSport = sport;
      document.getElementById("table-container").innerHTML = "Loading...";
      updateTopScrollbar();
      loadOdds(currentSport, currentMarket);
    });
  });

  marketButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const market = e.target.dataset.market;
      
      // Update active button
      marketButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      
      // Clear search and exit global search mode
      if (searchInput) {
        searchInput.value = "";
      }
      globalSearchMode = false;

      // Load new market
      currentMarket = market;
      document.getElementById("table-container").innerHTML = "Loading...";
      updateTopScrollbar();
      loadOdds(currentSport, currentMarket);
    });
  });

  // Load initial sport and market
  loadOdds(currentSport, currentMarket);
});
