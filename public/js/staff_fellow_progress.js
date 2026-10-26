const fellowNameFilter = document.getElementById("fellowNameFilter");
const siteFilter = document.getElementById("siteFilter");
const statusFilter = document.getElementById("statusFilter");
const progressRows = document.querySelectorAll(".fellow-progress-row");

function filterFellows() {
  const fellowName = fellowNameFilter.value.toLowerCase().trim();
  const siteName = siteFilter.value.toLowerCase().trim();
  const status = statusFilter.value;

  for (const row of progressRows) {
    const rowFellow = row.dataset.fellow;
    const rowSite = row.dataset.site;
    const rowStatus = row.dataset.status;
    const fellowMatches = rowFellow.includes(fellowName);
    const siteMatches = rowSite.includes(siteName);

    let statusMatches = true;

    if (status !== "") {
      statusMatches = rowStatus === status;
    }

    if (fellowMatches && siteMatches && statusMatches) {
      row.classList.remove("d-none");
    } else {
      row.classList.add("d-none");
    }
  }
}

fellowNameFilter.addEventListener("input", filterFellows);
siteFilter.addEventListener("input", filterFellows);
statusFilter.addEventListener("change", filterFellows);