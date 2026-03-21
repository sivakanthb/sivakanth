/* ============================================================
   Sivakanth Badigenchala — Portfolio Script
   ============================================================ */
(async function () {
  /* --- Mobile nav toggle --- */
  const toggle = document.getElementById("navToggle");
  const navLinks = document.querySelector(".nav-links");
  if (toggle && navLinks) {
    toggle.addEventListener("click", () => navLinks.classList.toggle("open"));
    navLinks.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  /* --- Collapsible section toggles --- */
  document.querySelectorAll(".collapsible-toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const target = document.getElementById(toggle.dataset.target);
      if (target) {
        target.classList.toggle("open");
        const icon = toggle.querySelector(".toggle-icon");
        if (icon) icon.style.transform = target.classList.contains("open") ? "rotate(180deg)" : "";
      }
    });
  });

  /* --- Experience card expand buttons --- */
  document.querySelectorAll(".exp-expand-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".exp-card");
      card.classList.toggle("active");
      const textEl = btn.querySelector(".exp-expand-text");
      if (textEl) textEl.textContent = card.classList.contains("active") ? "Hide Details" : "Show Details";
    });
  });

  /* --- Section summary expand buttons --- */
  document.querySelectorAll(".section-expand-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".section-summary-card");
      card.classList.toggle("active");
      const textEl = btn.querySelector(".section-expand-text");
      if (textEl) textEl.textContent = card.classList.contains("active") ? "Hide Details" : "Show Details";
    });
  });

  /* --- App grid --- */
  const grid = document.getElementById("appGrid");
  const meta = document.getElementById("meta");
  const empty = document.getElementById("emptyState");

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function renderCard(app) {
    const statusClass = (app.status || "live").toLowerCase();
    const statusLabel = statusClass === "wip" ? "WIP" : statusClass.charAt(0).toUpperCase() + statusClass.slice(1);

    return `<a class="app-card" href="${esc(app.url)}" target="_blank" rel="noopener noreferrer">
      <span class="app-card-arrow">&#8599;</span>
      <div class="app-card-icon">${esc(app.icon || "🔗")}</div>
      <div class="app-card-name">${esc(app.name)}</div>
      <div class="app-card-description">${esc(app.description)}</div>
      <div class="app-card-footer">
        <span class="app-card-category">${esc(app.category || "App")}</span>
        <span class="app-card-status ${statusClass}">${statusLabel}</span>
      </div>
    </a>`;
  }

  const viewAllWrap = document.getElementById("viewAllWrap");
  const isProjectsPage = document.body.dataset.page === "projects";

  try {
    const res = await fetch("apps.json");
    if (!res.ok) throw new Error("Failed to load apps.json");
    const apps = await res.json();

    if (!apps.length) {
      empty.classList.remove("hidden");
      return;
    }

    const displayApps = isProjectsPage ? apps : apps.filter(a => a.featured);
    meta.textContent = isProjectsPage ? apps.length + " app" + (apps.length !== 1 ? "s" : "") + " built so far" : "New apps every week";
    grid.innerHTML = displayApps.map(renderCard).join("");

    if (!isProjectsPage && apps.length > displayApps.length && viewAllWrap) {
      viewAllWrap.style.display = "";
    }

    /* --- Category filter (projects page only) --- */
    const filterBar = document.getElementById("filterBar");
    if (isProjectsPage && filterBar) {
      const categories = ["All", ...new Set(apps.map(a => a.category || "App"))];
      filterBar.innerHTML = categories.map((cat, i) =>
        `<button class="filter-btn${i === 0 ? " active" : ""}" data-cat="${esc(cat)}">${esc(cat)}</button>`
      ).join("");

      filterBar.addEventListener("click", e => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;
        filterBar.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const cat = btn.dataset.cat;
        const filtered = cat === "All" ? apps : apps.filter(a => (a.category || "App") === cat);
        grid.innerHTML = filtered.map(renderCard).join("");
        meta.textContent = filtered.length + " app" + (filtered.length !== 1 ? "s" : "") + (cat === "All" ? " built so far" : " in " + cat);
      });
    }
  } catch (err) {
    console.error(err);
    empty.classList.remove("hidden");
    empty.querySelector("p").textContent = "Could not load apps. Please try again.";
  }
})();
