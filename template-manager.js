(() => {
  "use strict";

  const LIBRARY_KEY = "travel-studio:library:v1";
  const RUNTIME_PREFIX = "travel-plan:runtime:v1";
  const EDITOR_PREFIX = "travel-plan:content-editor:v1";
  const OUTFIT_PREFIX = "travel-plan:outfits:v1";
  const RENTAL_PREFIX = "travel-studio:rental:v1";
  const RESERVATION_PREFIX = "travel-studio:reservations:v1";
  const DEFAULT_MODULES = Object.freeze({
    flights: true,
    overview: true,
    itinerary: true,
    reservations: true,
    todo: true,
    driving: false,
    ledger: true,
    outfits: true
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  function parseLocalDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function formatLocalDate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function dayCountBetween(startDate, endDate) {
    if (!datePattern.test(startDate) || !datePattern.test(endDate)) return 1;
    return Math.max(1, Math.round((parseLocalDate(endDate) - parseLocalDate(startDate)) / 86400000) + 1);
  }

  function slug(value) {
    const normalized = String(value || "trip")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36);
    return normalized || "trip";
  }

  function makeId(destination) {
    return `${slug(destination)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function loadLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((trip) => trip && trip.id && trip.data) : [];
    } catch (error) {
      console.warn("Could not load the trip library", error);
      return [];
    }
  }

  function saveLibrary(trips) {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(trips));
  }

  function createDays(startDate, endDate, destination) {
    const start = parseLocalDate(startDate);
    return Array.from({ length: dayCountBetween(startDate, endDate) }, (_, index) => ({
      id: `day-${index + 1}`,
      day: index + 1,
      date: formatLocalDate(addDays(start, index)),
      title: `第 ${index + 1} 天 · ${destination}`,
      locations: index === 0 ? [destination] : [],
      schedule: [],
      notes: [],
      costReferences: []
    }));
  }

  function createTripData(input) {
    const id = input.id || makeId(input.destination);
    const modules = { ...DEFAULT_MODULES, ...input.modules };
    const days = createDays(input.startDate, input.endDate, input.destination);
    const regionId = slug(input.destination);
    const dayNumbers = days.map((day) => day.day);
    return {
      schemaVersion: "2.0-lite",
      config: {
        schemaVersion: "1.0.0",
        modules: {
          flights: modules.flights,
          overview: modules.overview,
          itinerary: modules.itinerary,
          reservations: modules.reservations,
          todo: modules.todo,
          driving: modules.driving,
          ledger: modules.ledger
        },
        language: "zh-CN",
        persistence: { mode: "local" },
        templateModules: { outfits: modules.outfits }
      },
      metadata: {
        tripId: id,
        title: input.title,
        language: "zh-CN",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
        assets: { routeMaps: ["assets/maps/templates/template-07-compact-basin.svg"] }
      },
      trip: {
        status: "draft",
        heroTitle: input.destination,
        heroEyebrow: "YOUR NEXT JOURNEY",
        startDate: input.startDate,
        endDate: input.endDate,
        dayCount: days.length,
        nightCountAway: Math.max(0, days.length - 1),
        countries: [{
          code: "TRIP",
          name: input.destination,
          nameZh: input.destination,
          nameEn: String(input.destination).toUpperCase()
        }],
        primaryDestinationCountries: ["TRIP"],
        citiesAndAreas: [input.destination],
        routeSummary: input.destination,
        groupSize: 1,
        primaryDestinationName: input.destination,
        primaryDestinationNameEn: String(input.destination).toUpperCase()
      },
      flightJourneys: [],
      flights: [],
      transportOrder: [],
      accommodations: [],
      groundTransport: {
        rentalCar: null,
        rentalChecklist: [],
        drivingNotes: [],
        drivingReferenceLinks: [],
        plannedRoadLegs: [],
        publicTransitAndRail: []
      },
      days,
      places: [],
      restaurants: [],
      bookingsAndTickets: [],
      ticketPlanning: {
        statusStorage: "local",
        statusStorageNote: "门票状态保存在当前浏览器。",
        items: []
      },
      preTrip: {
        packingItems: [],
        preparationsExplicitlyMentioned: [],
        missingNote: "还没有准备事项。"
      },
      mapLinks: {
        providedGoogleMapsLinks: [],
        note: "地点可在 Google Maps 中打开。",
        cityLevelNavigationDisabled: false,
        navigationPolicy: {
          noNavigationTypes: ["flight", "note", "rest"],
          selfNavigationTypes: ["drive", "return", "transfer", "check-in", "check-out", "restaurant", "attraction", "walk", "hike", "ferry", "train"]
        },
        navigationPlaces: []
      },
      issuesAndUncertainties: [],
      map: {},
      routeMap: {
        defaultRegionId: regionId,
        regions: [{
          id: regionId,
          label: input.destination,
          countryCode: "TRIP",
          scope: "template-schematic",
          mapMode: "frozen-template",
          templateId: "compact-basin",
          days: dayNumbers,
          canvas: { width: 1448, height: 1086 },
          projection: { type: "relative-schematic", bounds: null },
          baseImage: "assets/maps/templates/template-07-compact-basin.svg",
          title: `${input.destination} · 旅行路线`,
          ariaLabel: `${input.destination}旅行路线示意图`,
          disclaimer: "当前为可编辑路线模板；添加每日地点后，请使用 Google Maps 查看实际导航。",
          heading: { text: String(input.destination).toUpperCase(), x: 33, y: 105, size: 40 },
          legend: { x: 35, y: 168, gap: 43 },
          annotations: [],
          routes: [],
          places: [],
          overviewPlaceIds: [],
          dailyLayouts: {}
        }]
      }
    };
  }

  function libraryEntryFromData(data, baseCurrency = "CNY") {
    const now = new Date().toISOString();
    return {
      id: data.metadata.tripId,
      title: data.metadata.title,
      destination: data.trip.primaryDestinationName,
      startDate: data.trip.startDate,
      endDate: data.trip.endDate,
      baseCurrency,
      createdAt: now,
      updatedAt: now,
      data
    };
  }

  function queryTripId() {
    return new URL(location.href).searchParams.get("trip") || "";
  }

  function activeEntry() {
    const id = queryTripId();
    return id ? loadLibrary().find((trip) => trip.id === id) || null : null;
  }

  function fallbackTrip() {
    const startDate = formatLocalDate(new Date());
    return createTripData({
      id: "travel-studio-welcome",
      title: "旅匣欢迎页",
      destination: "下一站",
      startDate,
      endDate: formatLocalDate(addDays(parseLocalDate(startDate), 2)),
      modules: DEFAULT_MODULES
    });
  }

  function openTrip(id, hash = "#itinerary") {
    const url = new URL(location.href);
    url.searchParams.set("trip", id);
    url.hash = hash;
    location.assign(url.href);
  }

  function openLibrary() {
    const url = new URL(location.href);
    url.searchParams.delete("trip");
    url.hash = "";
    location.assign(url.href);
  }

  function formatTripRange(entry) {
    const compact = (value) => {
      const [, month, day] = String(value).split("-");
      return `${Number(month)}月${Number(day)}日`;
    };
    return `${compact(entry.startDate)} — ${compact(entry.endDate)}`;
  }

  function formatUpdated(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date) + " 更新";
  }

  function renderLibrary() {
    const root = document.querySelector("#trip-library-grid");
    if (!root) return;
    const trips = loadLibrary().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!trips.length) {
      root.innerHTML = `<button class="trip-empty-card" type="button" data-library-action="create">
        <span aria-hidden="true">＋</span><strong>创建第一次旅行</strong><small>从日期和目的地开始</small>
      </button>`;
      return;
    }
    root.innerHTML = trips.map((trip, index) => {
      const days = dayCountBetween(trip.startDate, trip.endDate);
      return `<article class="trip-library-card" style="--trip-card-index:${index % 4}">
        <button class="trip-library-card__open" type="button" data-library-open="${escapeHtml(trip.id)}">
          <span class="trip-library-card__index">${String(index + 1).padStart(2, "0")}</span>
          <span class="trip-library-card__destination">${escapeHtml(trip.destination)}</span>
          <strong>${escapeHtml(trip.title)}</strong>
          <span class="trip-library-card__date">${escapeHtml(formatTripRange(trip))} · ${days}天</span>
        </button>
        <footer><span>${escapeHtml(formatUpdated(trip.updatedAt))}</span><details><summary aria-label="更多操作">…</summary><div>
          <button type="button" data-library-action="duplicate" data-trip-id="${escapeHtml(trip.id)}">复制旅行</button>
          <button type="button" data-library-action="export" data-trip-id="${escapeHtml(trip.id)}">导出备份</button>
          <button class="is-danger" type="button" data-library-action="delete" data-trip-id="${escapeHtml(trip.id)}">删除旅行</button>
        </div></details></footer>
      </article>`;
    }).join("");
  }

  function openCreateDialog() {
    const dialog = document.querySelector("#trip-create-dialog");
    const form = document.querySelector("#trip-create-form");
    if (!dialog || !form) return;
    const today = new Date();
    const start = addDays(today, 14);
    form.reset();
    form.elements.startDate.value = formatLocalDate(start);
    form.elements.endDate.value = formatLocalDate(addDays(start, 4));
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    requestAnimationFrame(() => form.elements.title.focus());
  }

  function closeCreateDialog() {
    const dialog = document.querySelector("#trip-create-dialog");
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function seedLedgerSettings(tripId, baseCurrency) {
    const key = `${RUNTIME_PREFIX}:${encodeURIComponent(tripId)}`;
    const snapshot = {
      version: 1,
      settings: { baseCurrency, commonCurrencies: [], lastCurrency: baseCurrency },
      bills: [],
      travelers: [],
      todos: [],
      tickets: [],
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(snapshot));
  }

  function createFromForm(form) {
    const values = new FormData(form);
    const startDate = String(values.get("startDate") || "");
    const endDate = String(values.get("endDate") || "");
    if (parseLocalDate(endDate) < parseLocalDate(startDate)) {
      form.elements.endDate.setCustomValidity("返程日期不能早于出发日期。");
      form.elements.endDate.reportValidity();
      return;
    }
    form.elements.endDate.setCustomValidity("");
    const input = {
      title: String(values.get("title") || "").trim(),
      destination: String(values.get("destination") || "").trim(),
      startDate,
      endDate,
      modules: Object.fromEntries(Object.keys(DEFAULT_MODULES).map((key) => [key, values.get(key) === "on"]))
    };
    const baseCurrency = String(values.get("baseCurrency") || "CNY");
    const data = createTripData(input);
    const trips = loadLibrary();
    trips.unshift(libraryEntryFromData(data, baseCurrency));
    saveLibrary(trips);
    seedLedgerSettings(data.metadata.tripId, baseCurrency);
    openTrip(data.metadata.tripId);
  }

  function removeTrip(id) {
    const trip = loadLibrary().find((entry) => entry.id === id);
    if (!trip || !confirm(`删除“${trip.title}”及其在这台设备上的全部数据？\n\n这个操作无法撤销。`)) return;
    saveLibrary(loadLibrary().filter((entry) => entry.id !== id));
    [RUNTIME_PREFIX, EDITOR_PREFIX, OUTFIT_PREFIX, RENTAL_PREFIX, RESERVATION_PREFIX].forEach((prefix) => {
      localStorage.removeItem(`${prefix}:${encodeURIComponent(id)}`);
    });
    renderLibrary();
  }

  function duplicateTrip(id) {
    const source = loadLibrary().find((entry) => entry.id === id);
    if (!source) return;
    const nextId = makeId(source.destination);
    const next = clone(source);
    next.id = nextId;
    next.title = `${source.title}（副本）`;
    next.data.metadata.tripId = nextId;
    next.data.metadata.title = next.title;
    next.createdAt = new Date().toISOString();
    next.updatedAt = next.createdAt;
    const trips = loadLibrary();
    trips.unshift(next);
    saveLibrary(trips);
    const oldEncoded = encodeURIComponent(id);
    const nextEncoded = encodeURIComponent(nextId);
    [RUNTIME_PREFIX, EDITOR_PREFIX, OUTFIT_PREFIX, RENTAL_PREFIX, RESERVATION_PREFIX].forEach((prefix) => {
      const saved = localStorage.getItem(`${prefix}:${oldEncoded}`);
      if (saved !== null) localStorage.setItem(`${prefix}:${nextEncoded}`, saved);
    });
    if (localStorage.getItem(`${RUNTIME_PREFIX}:${nextEncoded}`) === null) {
      seedLedgerSettings(nextId, next.baseCurrency || "CNY");
    }
    renderLibrary();
  }

  function exportTrip(id) {
    const trip = loadLibrary().find((entry) => entry.id === id);
    if (!trip) return;
    const bundle = {
      format: "travel-studio-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      trip,
      localData: {
        runtime: JSON.parse(localStorage.getItem(`${RUNTIME_PREFIX}:${encodeURIComponent(id)}`) || "null"),
        itinerary: JSON.parse(localStorage.getItem(`${EDITOR_PREFIX}:${encodeURIComponent(id)}`) || "null"),
        outfits: JSON.parse(localStorage.getItem(`${OUTFIT_PREFIX}:${encodeURIComponent(id)}`) || "null"),
        rental: JSON.parse(localStorage.getItem(`${RENTAL_PREFIX}:${encodeURIComponent(id)}`) || "null"),
        reservations: JSON.parse(localStorage.getItem(`${RESERVATION_PREFIX}:${encodeURIComponent(id)}`) || "null")
      }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(trip.title)}-backup.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function configureActiveTrip(entry) {
    document.body.classList.toggle("is-library", !entry);
    document.querySelector("#trip-library")?.toggleAttribute("hidden", Boolean(entry));
    const wordmark = document.querySelector("#wordmark");
    if (wordmark) wordmark.hidden = !entry;
    if (!entry) {
      ["#travel-navigation", "#outfit-navigation-link", "#ledger-navigation-link"].forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) element.hidden = true;
      });
      document.title = "旅匣 · 把自由留给旅途";
    }
  }

  function wireInterface() {
    const entry = activeEntry();
    configureActiveTrip(entry);
    if (!entry) renderLibrary();

    ["#hero-create-trip", "#section-create-trip"].forEach((selector) => {
      document.querySelector(selector)?.addEventListener("click", openCreateDialog);
    });
    document.querySelector("#library-navigation")?.addEventListener("click", openLibrary);
    document.querySelectorAll("[data-trip-dialog-close]").forEach((button) => button.addEventListener("click", closeCreateDialog));
    document.querySelector("#trip-create-dialog")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeCreateDialog();
    });
    document.querySelector("#trip-create-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      createFromForm(event.currentTarget);
    });
    document.querySelector("#trip-library-grid")?.addEventListener("click", (event) => {
      const open = event.target.closest("[data-library-open]");
      if (open) return openTrip(open.dataset.libraryOpen);
      const action = event.target.closest("[data-library-action]");
      if (!action) return;
      if (action.dataset.libraryAction === "create") return openCreateDialog();
      if (action.dataset.libraryAction === "delete") return removeTrip(action.dataset.tripId);
      if (action.dataset.libraryAction === "duplicate") return duplicateTrip(action.dataset.tripId);
      if (action.dataset.libraryAction === "export") return exportTrip(action.dataset.tripId);
    });
    window.addEventListener("travel-config:ready", () => {
      const current = activeEntry();
      const outfitsEnabled = current?.data.config.templateModules?.outfits !== false;
      const outfitLink = document.querySelector("#outfit-navigation-link");
      if (outfitLink) outfitLink.hidden = !outfitsEnabled;
    });
  }

  window.TravelTemplateState = {
    getActiveTripData() {
      return clone(activeEntry()?.data || fallbackTrip());
    },
    isLibraryView() {
      return !activeEntry();
    },
    createTripData
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireInterface);
  else wireInterface();
})();
