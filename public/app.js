async function loadOdds() {
  try {
    const res = await fetch("/nba/tomorrow");
    const data = await res.json();
    console.log("DATA RECEIVED:", data);
    buildTable(data);
  } catch (err) {
    console.error("LOAD ERROR:", err);
  }
}

function buildTable(data) {
  console.log("BUILDING TABLE WITH:", data);

  const container = document.getElementById("table-container");

  let html = "<table><thead><tr><th>Sportsbook</th>";

  data.games.forEach(game => {
    html += `<th>${game}</th>`;
  });

  html += "</tr></thead><tbody>";

  data.books.forEach(book => {
    html += `<tr><td><img src="${book.logo}" width="24"> ${book.book}</td>`;

    book.prices.forEach((price, i) => {
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

      html += `
        <td>
          <div class="${classA}">${price.teamA} ${arrowA}</div>
          <div class="${classB}">${price.teamB} ${arrowB}</div>
        </td>
      `;
    });

    html += "</tr>";
  });

  html += "</tbody></table>";

  container.innerHTML = html;
}

loadOdds();