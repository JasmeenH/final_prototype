const entryFellowFilter = document.getElementById("entryFellowFilter");
const entrySiteFilter = document.getElementById("entrySiteFilter");
const entryAreaFilter = document.getElementById("entryAreaFilter");
const entryTypeFilter = document.getElementById("entryTypeFilter");
const entryRows = document.querySelectorAll(".service-entry-row");

function filterEntries() {
    const fellowName = entryFellowFilter.value.toLowerCase().trim();
    const siteName = entrySiteFilter.value.toLowerCase().trim();
    const areaName = entryAreaFilter.value.toLowerCase().trim();

    const serviceType = entryTypeFilter.value;

    for (const row of entryRows) {
        const rowFellow = row.dataset.fellow;
        const rowSite = row.dataset.site;
        const rowArea = row.dataset.area;
        const rowType = row.dataset.type;
        const fellowMatches = rowFellow.includes(fellowName);
        const siteMatches = rowSite.includes(siteName);
        const areaMatches = rowArea.includes(areaName);

        let typeMatches = true;

        if (serviceType !== "") {
            typeMatches = rowType === serviceType;
        }

        if (fellowMatches && siteMatches && areaMatches && typeMatches) {
            row.classList.remove("d-none");
        } else {
            row.classList.add("d-none");
        }
    }
}

entryFellowFilter.addEventListener("input", filterEntries);
entrySiteFilter.addEventListener("input", filterEntries);
entryAreaFilter.addEventListener("input", filterEntries);
entryTypeFilter.addEventListener("change", filterEntries);