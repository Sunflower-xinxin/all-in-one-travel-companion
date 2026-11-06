(() => {
  "use strict";
  let trip = null;
  let flightDialog;
  let itineraryDialog;
  let durationDialog;
  let activeDurationPicker = null;
  let durationDraft = { hours: 0, minutes: 0, seconds: 0 };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const key = (value = trip) => `travel-plan:content-editor:v1:${encodeURIComponent(value?.metadata?.tripId || "default-trip")}`;

  function loadEdits(value) {
    try {
      const saved = JSON.parse(localStorage.getItem(key(value)) || "null");
      if (!saved) return;
      ["flightJourneys", "flights", "days"].forEach((name) => {
        if (Array.isArray(saved[name])) value[name] = copy(saved[name]);
      });
      if (Array.isArray(saved.rails)) value.groundTransport.publicTransitAndRail = copy(saved.rails);
      if (Array.isArray(saved.transportOrder)) value.transportOrder = copy(saved.transportOrder);
    } catch (error) {
      console.warn("Could not load travel edits", error);
    }
  }

  function saveEdits() {
    try {
      localStorage.setItem(key(), JSON.stringify({
        flightJourneys: trip.flightJourneys,
        flights: trip.flights,
        rails: trip.groundTransport?.publicTransitAndRail || [],
        transportOrder: trip.transportOrder || [],
        days: trip.days,
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error("Could not save travel edits", error);
      alert("本地存储空间不足，请换一张更小的图片后重试。");
    }
  }

  function open(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function close(dialog) {
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function installDialogs() {
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="content-editor-dialog" id="flight-editor-dialog"></dialog>
      <dialog class="content-editor-dialog" id="itinerary-editor-dialog"></dialog>
      <dialog class="content-editor-duration-dialog" id="content-editor-duration-dialog" aria-labelledby="content-editor-duration-title"></dialog>
    `);
    flightDialog = document.querySelector("#flight-editor-dialog");
    itineraryDialog = document.querySelector("#itinerary-editor-dialog");
    durationDialog = document.querySelector("#content-editor-duration-dialog");
    [flightDialog, itineraryDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close(dialog);
    }));
    durationDialog.addEventListener("click", (event) => {
      if (event.target === durationDialog) closeDurationDialog();
    });
    installTransportManagerSorting();
  }

  function addFlightButton() {
    if (!trip || document.querySelector("#manage-flights-button")) return;
    const heading = document.querySelector(".flights-section .section-heading");
    const index = document.querySelector("#flight-index");
    if (!heading || !index) return;
    const actions = document.createElement("div");
    actions.className = "section-heading-actions";
    actions.append(index);
    actions.insertAdjacentHTML("beforeend", '<button class="content-editor-primary" id="manage-flights-button" type="button">管理交通</button>');
    heading.append(actions);
  }

  function addItineraryButtons() {
    if (!trip) return;
    trip.days.forEach((day) => {
      const card = document.querySelector(`.day-card[data-day="${day.day}"]`);
      if (!card) return;
      card.querySelectorAll(".schedule-item").forEach((row, index) => {
        const item = day.schedule[index];
        const content = row.querySelector(".schedule-content");
        if (!item || !content || content.querySelector(".schedule-editor-actions")) return;
        content.insertAdjacentHTML("beforeend", `
          <div class="schedule-editor-actions">
            <button type="button" data-schedule-edit="${esc(item.id)}" data-day="${day.day}">修改</button>
            <button class="is-danger" type="button" data-schedule-delete="${esc(item.id)}" data-day="${day.day}">删除</button>
          </div>
        `);
      });
      const detail = card.querySelector(".day-detail");
      if (detail && !detail.querySelector(".day-editor-actions")) {
        detail.insertAdjacentHTML("beforeend", `
          <div class="day-editor-actions">
            <button type="button" data-day-edit="${day.day}">编辑当天概览</button>
            <button class="content-editor-primary" type="button" data-schedule-add="${day.day}">＋ 添加行程</button>
          </div>
        `);
      }
    });
  }

  function orderedManagerEntries() {
    const entries = [
      ...trip.flightJourneys.map((journey) => ({ key: `flight:${journey.id}`, type: "flight", value: journey })),
      ...(trip.groundTransport?.publicTransitAndRail || []).map((rail) => ({ key: `rail:${rail.id}`, type: "rail", value: rail }))
    ];
    const positions = new Map((trip.transportOrder || []).map((entryKey, index) => [entryKey, index]));
    return entries.sort((first, second) =>
      (positions.get(first.key) ?? Number.MAX_SAFE_INTEGER) - (positions.get(second.key) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  function transportManagerRows() {
    return orderedManagerEntries().map((entry, index) => {
      if (entry.type === "rail") {
        const rail = entry.value;
        return `<article class="content-editor-list-row content-editor-transport-row" draggable="true" tabindex="0" data-manager-transport-key="${esc(entry.key)}">
          <span class="content-editor-drag-handle" aria-hidden="true">⋮⋮</span>
          <div class="content-editor-transport-copy"><small>交通 ${String(index + 1).padStart(2, "0")} · 铁路</small><strong>${esc(rail.serviceNumber || "车次待补充")}</strong>
            <span class="content-editor-transport-segment"><span>${esc(rail.departure?.station)} ${esc(rail.departure?.time)} → ${esc(rail.arrival?.station)} ${esc(rail.arrival?.time)}</span><span class="content-editor-transport-segment-actions"><button type="button" data-rail-edit="${esc(rail.id)}">修改</button><button class="is-danger" type="button" data-rail-delete="${esc(rail.id)}">删除</button></span></span>
          </div>
        </article>`;
      }
      const journey = entry.value;
      const flights = trip.flights.filter((flight) => flight.journeyId === journey.id).sort((a, b) => a.sequence - b.sequence);
      return `<article class="content-editor-list-row content-editor-transport-row" draggable="true" tabindex="0" data-manager-transport-key="${esc(entry.key)}">
        <span class="content-editor-drag-handle" aria-hidden="true">⋮⋮</span>
        <div class="content-editor-transport-copy"><small>交通 ${String(index + 1).padStart(2, "0")} · 航班</small><strong>${esc(journey.title || flights.map((flight) => flight.flightNumber).join(" / ") || "航班待补充")}</strong>
          ${flights.map((flight) => `<span class="content-editor-transport-segment"><span>${esc(flight.flightNumber)} · ${esc(flight.departure?.city)} ${esc(flight.departure?.time)} → ${esc(flight.arrival?.city)} ${esc(flight.arrival?.time)}</span><span class="content-editor-transport-segment-actions"><button type="button" data-flight-edit="${esc(flight.id)}">修改</button><button class="is-danger" type="button" data-flight-delete="${esc(flight.id)}">删除</button></span></span>`).join("")}
        </div>
      </article>`;
    }).join("");
  }

  function installTransportManagerSorting() {
    let dragged = null;
    const commit = (focusedKey = "") => {
      const order = [...flightDialog.querySelectorAll("[data-manager-transport-key]")].map((row) => row.dataset.managerTransportKey);
      trip.transportOrder = order;
      saveEdits();
      renderFlights();
      showFlightList();
      if (focusedKey) requestAnimationFrame(() => flightDialog.querySelector(`[data-manager-transport-key="${CSS.escape(focusedKey)}"]`)?.focus());
    };
    flightDialog.addEventListener("dragstart", (event) => {
      const row = event.target.closest("[data-manager-transport-key]");
      if (!row) return;
      dragged = row;
      row.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", row.dataset.managerTransportKey);
    });
    flightDialog.addEventListener("dragover", (event) => {
      if (!dragged) return;
      event.preventDefault();
      const target = event.target.closest("[data-manager-transport-key]");
      if (!target || target === dragged) return;
      const bounds = target.getBoundingClientRect();
      target.parentElement.insertBefore(dragged, event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling);
    });
    flightDialog.addEventListener("drop", (event) => {
      if (!dragged) return;
      event.preventDefault();
      const key = dragged.dataset.managerTransportKey;
      dragged = null;
      commit(key);
    });
    flightDialog.addEventListener("dragend", () => {
      dragged?.classList.remove("is-dragging");
      dragged = null;
    });
    flightDialog.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      const row = event.target.closest("[data-manager-transport-key]");
      const sibling = event.key === "ArrowUp" ? row?.previousElementSibling : row?.nextElementSibling;
      if (!row || !sibling?.matches("[data-manager-transport-key]")) return;
      event.preventDefault();
      if (event.key === "ArrowUp") row.parentElement.insertBefore(row, sibling);
      else row.parentElement.insertBefore(sibling, row);
      commit(row.dataset.managerTransportKey);
    });
  }

  function showFlightList() {
    flightDialog.innerHTML = `
      <header class="content-editor-dialog-header">
        <div><span>TRANSPORT EDITOR</span><h2>管理交通</h2></div>
        <button type="button" data-editor-close>关闭</button>
      </header>
      <div class="content-editor-dialog-body">
        <div class="content-editor-toolbar">
          <p>交通修改保存在当前浏览器中，刷新页面后仍然有效。</p>
          <div class="content-editor-toolbar-actions">
            <button type="button" data-rail-add>＋ 添加铁路</button>
            <button class="content-editor-primary" type="button" data-flight-add>＋ 添加航班</button>
          </div>
        </div>
        <section class="content-editor-group"><h3>交通顺序</h3><p class="content-editor-sort-help">按住左侧手柄上下拖动；键盘可使用 Alt + ↑ / ↓。</p><div class="content-editor-list">${transportManagerRows() || '<p class="content-empty-state">还没有交通行程。</p>'}</div></section>
      </div>
    `;
  }

  const at = (object, path, fallback = "") => path.split(".").reduce((value, name) => value?.[name], object) ?? fallback;

  function showFlightForm(flight) {
    const journey = flight && trip.flightJourneys.find((item) => item.id === flight.journeyId);
    flightDialog.innerHTML = `
      <header class="content-editor-dialog-header">
        <div><span>${flight ? "EDIT FLIGHT" : "NEW FLIGHT"}</span><h2>${flight ? "修改航班" : "添加航班"}</h2></div>
        <button type="button" data-flight-back>返回列表</button>
      </header>
      <form class="content-editor-dialog-body content-editor-form content-editor-transport-form" data-flight-form data-flight-id="${esc(flight?.id || "")}">
        <div class="content-editor-grid">
          <label><span>航空公司</span><input name="airline" required value="${esc(at(flight, "airline.nameZh"))}"></label>
          <label><span>航班号</span><input name="number" required value="${esc(flight?.flightNumber || "")}"></label>
        </div>
        ${flightEndpointFields("出发", "departure", flight, "+08:00")}
        ${flightEndpointFields("抵达", "arrival", flight, "+07:00")}
        <label><span>行程名称</span><input name="journeyTitle" value="${esc(journey?.title || "")}" placeholder="留空时自动生成"></label>
        <div class="content-editor-form-actions">
          <button type="button" data-flight-back>取消</button>
          <button class="content-editor-primary" type="submit">保存航班</button>
        </div>
      </form>
    `;
  }

  function flightEndpointFields(label, prefix, flight, offset) {
    return `
      <fieldset><legend>${label}</legend><div class="content-editor-grid">
        <label><span>机场代码</span><input name="${prefix}Code" maxlength="3" required value="${esc(at(flight, prefix + ".airportCode"))}"></label>
        <label><span>城市</span><input name="${prefix}City" required value="${esc(at(flight, prefix + ".city"))}"></label>
        <label><span>日期</span><input name="${prefix}Date" type="date" required value="${esc(at(flight, prefix + ".date", trip.trip.startDate))}"></label>
        <label><span>时间</span><input name="${prefix}Time" type="time" required value="${esc(at(flight, prefix + ".time"))}"></label>
        <label><span>UTC 时差</span><input name="${prefix}Offset" required pattern="[+-][0-9]{2}:[0-9]{2}" value="${esc(at(flight, prefix + ".utcOffset", offset))}"></label>
      </div></fieldset>
    `;
  }

  function endpoint(values, prefix) {
    return {
      airportCode: String(values.get(prefix + "Code")).trim().toUpperCase(),
      city: String(values.get(prefix + "City")).trim(),
      date: String(values.get(prefix + "Date")),
      time: String(values.get(prefix + "Time")),
      utcOffset: String(values.get(prefix + "Offset"))
    };
  }

  function showRailForm(rail) {
    flightDialog.innerHTML = `
      <header class="content-editor-dialog-header">
        <div><span>${rail ? "EDIT RAIL" : "NEW RAIL"}</span><h2>${rail ? "修改铁路行程" : "添加铁路行程"}</h2></div>
        <button type="button" data-flight-back>返回列表</button>
      </header>
      <form class="content-editor-dialog-body content-editor-form content-editor-transport-form" data-rail-form data-rail-id="${esc(rail?.id || "")}">
        <label><span>车次</span><input name="serviceNumber" required value="${esc(rail?.serviceNumber || "")}" placeholder="例如：G897"></label>
        <fieldset><legend>出发</legend><div class="content-editor-grid">
          <label><span>车站</span><input name="departureStation" required value="${esc(rail?.departure?.station || "")}"></label>
          <label><span>日期</span><input name="departureDate" type="date" required value="${esc(rail?.departure?.date || trip.trip.startDate)}"></label>
          <label><span>时间</span><input name="departureTime" type="time" required value="${esc(rail?.departure?.time || "")}"></label>
        </div></fieldset>
        <fieldset><legend>抵达</legend><div class="content-editor-grid">
          <label><span>车站</span><input name="arrivalStation" required value="${esc(rail?.arrival?.station || "")}"></label>
          <label><span>日期</span><input name="arrivalDate" type="date" required value="${esc(rail?.arrival?.date || trip.trip.startDate)}"></label>
          <label><span>时间</span><input name="arrivalTime" type="time" required value="${esc(rail?.arrival?.time || "")}"></label>
        </div></fieldset>
        <label><span>预计行程时间</span><input name="duration" required value="${esc(rail?.duration || "")}" placeholder="例如：9 小时 56 分钟"></label>
        <div class="content-editor-form-actions">
          <button type="button" data-flight-back>取消</button>
          <button class="content-editor-primary" type="submit">保存铁路信息</button>
        </div>
      </form>
    `;
  }

  function refreshFlights() {
    saveEdits();
    renderFlights();
    addFlightButton();
    showFlightList();
  }

  function saveFlight(form) {
    const values = new FormData(form);
    const existing = trip.flights.find((flight) => flight.id === form.dataset.flightId);
    const stamp = Date.now();
    const journeyId = existing?.journeyId || `journey-custom-${stamp}`;
    const fields = {
      airline: { nameZh: String(values.get("airline")).trim() },
      flightNumber: String(values.get("number")).trim().toUpperCase(),
      departure: endpoint(values, "departure"),
      arrival: endpoint(values, "arrival")
    };
    if (existing) Object.assign(existing, fields);
    else {
      trip.flights.push({ id: `flight-custom-${stamp}`, journeyId, sequence: 1, status: "confirmed", ...fields });
      trip.flightJourneys.push({ id: journeyId, status: "confirmed", title: "" });
    }
    const journey = trip.flightJourneys.find((item) => item.id === journeyId);
    journey.title = String(values.get("journeyTitle")).trim() || `${fields.departure.city} → ${fields.arrival.city}`;
    journey.placeholder = false;
    if (["pending", "missing"].includes(journey.status)) journey.status = "confirmed";
    refreshFlights();
  }

  function removeFlight(id) {
    const flight = trip.flights.find((item) => item.id === id);
    if (!flight || !confirm(`删除航班 ${flight.flightNumber}？`)) return;
    trip.flights = trip.flights.filter((item) => item.id !== id);
    const remaining = trip.flights.filter((item) => item.journeyId === flight.journeyId);
    remaining.sort((a, b) => a.sequence - b.sequence).forEach((item, index) => { item.sequence = index + 1; });
    if (!remaining.length) trip.flightJourneys = trip.flightJourneys.filter((item) => item.id !== flight.journeyId);
    refreshFlights();
  }

  function saveRail(form) {
    const values = new FormData(form);
    const rails = trip.groundTransport.publicTransitAndRail;
    const existing = rails.find((rail) => rail.id === form.dataset.railId);
    const fields = {
      type: "train",
      serviceNumber: String(values.get("serviceNumber")).trim().toUpperCase(),
      departure: {
        station: String(values.get("departureStation")).trim(),
        date: String(values.get("departureDate")),
        time: String(values.get("departureTime")),
        utcOffset: "+08:00"
      },
      arrival: {
        station: String(values.get("arrivalStation")).trim(),
        date: String(values.get("arrivalDate")),
        time: String(values.get("arrivalTime")),
        utcOffset: "+08:00"
      },
      duration: String(values.get("duration")).trim()
    };
    if (existing) Object.assign(existing, fields);
    else rails.push({ id: `rail-custom-${Date.now()}`, ...fields });
    refreshFlights();
  }

  function removeRail(id) {
    const rails = trip.groundTransport.publicTransitAndRail;
    const rail = rails.find((item) => item.id === id);
    if (!rail || !confirm(`删除铁路行程 ${rail.serviceNumber}？`)) return;
    trip.groundTransport.publicTransitAndRail = rails.filter((item) => item.id !== id);
    refreshFlights();
  }

  function day(number) {
    return trip.days.find((item) => item.day === Number(number));
  }

  function itemPlace(item) {
    if (item?.place) return item.place;
    const ids = Array.isArray(item?.placeIds) && item.placeIds.length
      ? item.placeIds
      : item?.placeId ? [item.placeId] : [];
    const place = trip.places.find((entry) => entry.id === ids.at(-1));
    return place?.nameZh || place?.name || "";
  }

  function readImage(file) {
    if (!file) return Promise.resolve("");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("图片格式无法识别"));
        image.onload = () => {
          const limit = 1400;
          const scale = Math.min(1, limit / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function durationParts(totalSeconds) {
    const value = Math.max(0, Math.min(43200, Math.round(Number(totalSeconds) || 0)));
    return {
      hours: Math.floor(value / 3600),
      minutes: Math.floor((value % 3600) / 60),
      seconds: value % 60
    };
  }

  function durationPicker(prefix, totalSeconds, label) {
    const current = durationParts(totalSeconds);
    return `<div class="content-editor-duration-picker content-editor-duration-picker--hms" role="group" aria-label="${esc(label)}" data-duration-picker data-duration-label="${esc(label)}">
      <span class="content-editor-duration-icon" aria-hidden="true">◷</span>
      <input type="hidden" name="${prefix}Hours" value="${current.hours}">
      <input type="hidden" name="${prefix}Minutes" value="${current.minutes}">
      <input type="hidden" name="${prefix}Seconds" value="${current.seconds}">
      <button class="content-editor-duration-trigger" type="button" data-duration-open aria-haspopup="dialog" aria-controls="content-editor-duration-dialog">
        <span data-duration-summary>${durationSummary(current)}</span><i aria-hidden="true">⌄</i>
      </button>
    </div>`;
  }

  function durationSummary(parts) {
    return `${String(parts.hours).padStart(2, "0")}时 ${String(parts.minutes).padStart(2, "0")}分 ${String(parts.seconds).padStart(2, "0")}秒`;
  }

  function durationWheel(part, maximum, suffix) {
    return `<div class="content-editor-duration-wheel" role="listbox" aria-label="${suffix}">
      ${Array.from({ length: maximum + 1 }, (_, value) => `<button type="button" role="option" data-duration-option data-duration-part="${part}" data-duration-value="${value}" aria-selected="${durationDraft[part] === value}">${String(value).padStart(2, "0")}<small>${suffix}</small></button>`).join("")}
    </div>`;
  }

  function renderDurationDialog() {
    const label = activeDurationPicker?.dataset.durationLabel || "选择时间";
    durationDialog.innerHTML = `
      <header>
        <div><span>TIME PICKER</span><h2 id="content-editor-duration-title">${esc(label)}</h2></div>
        <button type="button" data-duration-cancel aria-label="关闭时间选择器">关闭</button>
      </header>
      <div class="content-editor-duration-dialog__body">
        <p data-duration-dialog-summary>${durationSummary(durationDraft)}</p>
        <div class="content-editor-duration-wheels">
          ${durationWheel("hours", 12, "时")}
          ${durationWheel("minutes", 59, "分")}
          ${durationWheel("seconds", 59, "秒")}
        </div>
      </div>
      <footer><button type="button" data-duration-cancel>取消</button><button class="content-editor-primary" type="button" data-duration-save>完成</button></footer>
    `;
  }

  function scrollDurationSelectionIntoView() {
    requestAnimationFrame(() => durationDialog.querySelectorAll('[data-duration-option][aria-selected="true"]').forEach((button) => {
      const wheel = button.closest(".content-editor-duration-wheel");
      if (wheel) wheel.scrollTop += button.getBoundingClientRect().top - wheel.getBoundingClientRect().top - wheel.clientHeight / 2 + button.offsetHeight / 2;
    }));
  }

  function showDurationDialog(button) {
    activeDurationPicker = button.closest("[data-duration-picker]");
    if (!activeDurationPicker) return;
    durationDraft = {
      hours: Number(activeDurationPicker.querySelector('[name$="Hours"]')?.value || 0),
      minutes: Number(activeDurationPicker.querySelector('[name$="Minutes"]')?.value || 0),
      seconds: Number(activeDurationPicker.querySelector('[name$="Seconds"]')?.value || 0)
    };
    renderDurationDialog();
    open(durationDialog);
    scrollDurationSelectionIntoView();
  }

  function updateDurationOption(button) {
    const part = button.dataset.durationPart;
    if (!Object.hasOwn(durationDraft, part)) return;
    durationDraft[part] = Number(button.dataset.durationValue || 0);
    durationDialog.querySelectorAll(`[data-duration-option][data-duration-part="${part}"]`).forEach((option) => {
      option.setAttribute("aria-selected", String(option === button));
    });
    const summary = durationDialog.querySelector("[data-duration-dialog-summary]");
    if (summary) summary.textContent = durationSummary(durationDraft);
  }

  function saveDurationDialog() {
    if (!activeDurationPicker) return closeDurationDialog();
    const names = { hours: "Hours", minutes: "Minutes", seconds: "Seconds" };
    Object.entries(names).forEach(([part, suffix]) => {
      const field = activeDurationPicker.querySelector(`[name$="${suffix}"]`);
      if (field) field.value = String(durationDraft[part]);
    });
    const summary = activeDurationPicker.querySelector("[data-duration-summary]");
    if (summary) summary.textContent = durationSummary(durationDraft);
    activeDurationPicker.dispatchEvent(new Event("change", { bubbles: true }));
    const inlineDay = activeDurationPicker.dataset.inlineStayDay;
    const inlineItem = activeDurationPicker.dataset.inlineStayItem;
    if (inlineDay && inlineItem) {
      const currentDay = day(inlineDay);
      const item = currentDay?.schedule.find((entry) => entry.id === inlineItem);
      if (item) {
        const seconds = Math.min(43200, Math.max(0, durationDraft.hours * 3600 + durationDraft.minutes * 60 + durationDraft.seconds));
        item.stayDurationSeconds = seconds;
        item.stayDurationHours = seconds / 3600;
        window.TravelScheduleTime?.apply?.(currentDay);
      }
      closeDurationDialog();
      if (currentDay) refreshDay(currentDay.day);
      return;
    }
    closeDurationDialog();
  }

  function closeDurationDialog() {
    close(durationDialog);
    activeDurationPicker = null;
  }

  function durationFromValues(values, prefix) {
    const hours = Number(values.get(`${prefix}Hours`) || 0);
    const minutes = Number(values.get(`${prefix}Minutes`) || 0);
    const seconds = Number(values.get(`${prefix}Seconds`) || 0);
    return Math.min(43200, Math.max(0, hours * 3600 + minutes * 60 + seconds));
  }

  function durationText(totalSeconds) {
    const { hours, minutes, seconds } = durationParts(totalSeconds);
    return [hours ? `${hours}小时` : "", minutes ? `${minutes}分钟` : "", seconds ? `${seconds}秒` : ""].filter(Boolean).join("");
  }

  function showScheduleForm(currentDay, item) {
    const inferredStaySeconds = Number(window.TravelScheduleTime?.staySeconds?.(item));
    const hasSavedStay = item?.stayDurationSeconds !== undefined && Number.isFinite(Number(item.stayDurationSeconds));
    const staySeconds = hasSavedStay ? Number(item.stayDurationSeconds) : inferredStaySeconds > 0 ? inferredStaySeconds : 3600;
    const itemIndex = item ? currentDay.schedule.findIndex((entry) => entry.id === item.id) : -1;
    const previousItem = itemIndex > 0 ? currentDay.schedule[itemIndex - 1] : null;
    const previousTransit = window.TravelScheduleTime?.isTransit?.(previousItem) ? previousItem : null;
    const itemIsTransit = Boolean(window.TravelScheduleTime?.isTransit?.(item));
    const commuteTarget = itemIsTransit ? item : previousTransit || item;
    const targetHasCommute = commuteTarget?.estimatedDurationSeconds !== undefined
      || Boolean(commuteTarget?.estimatedDuration)
      || Boolean(commuteTarget?.travelMode);
    const itemHasLegacyCommute = commuteTarget !== item && (
      item?.estimatedDurationSeconds !== undefined
      || Boolean(item?.estimatedDuration)
      || Boolean(item?.travelMode)
    );
    const commuteSource = targetHasCommute ? commuteTarget : itemHasLegacyCommute ? item : commuteTarget;
    const transitTypes = new Set(["transfer", "walk", "ferry", "train", "flight", "return", "drive", "rental-car"]);
    const travelDurationSource = commuteSource?.estimatedDuration || (transitTypes.has(commuteSource?.type) ? commuteSource?.text : "");
    const hasSavedTravel = commuteSource?.estimatedDurationSeconds !== undefined && Number.isFinite(Number(commuteSource.estimatedDurationSeconds));
    const travelSeconds = hasSavedTravel
      ? Number(commuteSource.estimatedDurationSeconds)
      : Number(window.TravelScheduleTime?.durationSeconds?.(travelDurationSource)) || 0;
    const travelMode = commuteSource?.travelMode || "transit";
    const displayedTime = item
      ? window.TravelScheduleTime?.displayTimes?.(currentDay)?.get(item.id) || item.time || ""
      : "";
    itineraryDialog.innerHTML = `
      <header class="content-editor-dialog-header">
        <div><span>DAY ${String(currentDay.day).padStart(2, "0")}</span><h2>${item ? "修改行程" : "添加行程"}</h2></div>
        <button type="button" data-editor-close>关闭</button>
      </header>
      <form class="content-editor-dialog-body content-editor-form" data-schedule-form data-day="${currentDay.day}" data-item-id="${esc(item?.id || "")}" data-commute-item-id="${esc(commuteTarget?.id || "")}" data-original-time="${esc(displayedTime)}">
        <label><span>地点</span><input name="place" required value="${esc(itemPlace(item))}" placeholder="输入地点名称"></label>
        <button class="content-editor-map-preview" type="button" data-place-search>在 Google Maps 搜索此地点 ↗</button>
        <label><span>时间</span><input name="time" required value="${esc(displayedTime)}" placeholder="14:30 或 待确认"><small>手动修改后会作为当天自动排程的新时间锚点。</small></label>
        <label><span>行程内容</span><textarea name="text" rows="4" required>${esc(item?.text || "")}</textarea></label>
        <label class="content-editor-duration"><span>预计停留时间</span>${durationPicker("stay", staySeconds, "预计停留时间")}<small>点击时钟区域后可分别滑动选择小时、分钟和秒，最高 12 小时。</small></label>
        <label><span>网址链接 <small>选填</small></span><input name="url" type="url" value="${esc(item?.url || "")}" placeholder="https://..."></label>
        <label class="content-editor-file"><span>上传图片 <small>选填</small></span><input name="image" type="file" accept="image/*"></label>
        ${item?.imageData ? `<div class="content-editor-image-preview"><img src="${item.imageData}" alt="当前行程图片"><label><input name="removeImage" type="checkbox"> 删除当前图片</label></div>` : ""}
        <fieldset class="content-editor-commute"><legend>从上一地点到这里</legend><div class="content-editor-grid content-editor-commute-grid">
          <label><span>交通方式</span><select name="travelMode">
            <option value="transit" ${travelMode === "transit" ? "selected" : ""}>公共交通</option>
            <option value="walking" ${travelMode === "walking" ? "selected" : ""}>步行</option>
            <option value="driving" ${travelMode === "driving" ? "selected" : ""}>驾车</option>
            <option value="bicycling" ${travelMode === "bicycling" ? "selected" : ""}>骑行</option>
          </select></label>
          <label class="content-editor-duration"><span>预计时间</span>${durationPicker("travel", travelSeconds, "预计通勤时间")}<small>可分别选择小时、分钟和秒。</small></label>
        </div></fieldset>
        <div class="content-editor-form-actions">
          <button type="button" data-editor-close>取消</button>
          <button class="content-editor-primary" type="submit">保存行程</button>
        </div>
      </form>
    `;
    open(itineraryDialog);
  }

  function showDayForm(currentDay) {
    itineraryDialog.innerHTML = `
      <header class="content-editor-dialog-header">
        <div><span>DAY ${String(currentDay.day).padStart(2, "0")}</span><h2>编辑当天概览</h2></div>
        <button type="button" data-editor-close>关闭</button>
      </header>
      <form class="content-editor-dialog-body content-editor-form" data-day-form data-day="${currentDay.day}">
        <label><span>日期</span><input name="date" type="date" required value="${esc(currentDay.date)}"></label>
        <label><span>地点顺序</span><textarea name="locations" rows="6">${esc((currentDay.locations || []).join("\\n"))}</textarea><small>每行一个地点。</small></label>
        <div class="content-editor-form-actions">
          <button type="button" data-editor-close>取消</button>
          <button class="content-editor-primary" type="submit">保存概览</button>
        </div>
      </form>
    `;
    open(itineraryDialog);
  }

  function refreshDay(number) {
    saveEdits();
    renderTimeline();
    addItineraryButtons();
    const card = document.querySelector(`.day-card[data-day="${number}"]`);
    const toggle = card?.querySelector(".day-toggle");
    const detail = card?.querySelector(".day-detail");
    if (toggle && detail) {
      toggle.setAttribute("aria-expanded", "true");
      detail.hidden = false;
      state.expandedDay = Number(number);
    }
  }

  async function saveSchedule(form) {
    const currentDay = day(form.dataset.day);
    const values = new FormData(form);
    const item = currentDay.schedule.find((entry) => entry.id === form.dataset.itemId);
    const commuteItem = currentDay.schedule.find((entry) => entry.id === form.dataset.commuteItemId) || item;
    const stayDurationSeconds = durationFromValues(values, "stay");
    const estimatedDurationSeconds = durationFromValues(values, "travel");
    const fields = {
      place: String(values.get("place")).trim(),
      time: String(values.get("time")).trim(),
      text: String(values.get("text")).trim(),
      type: item?.type || "attraction",
      url: String(values.get("url") || "").trim(),
      stayDurationSeconds,
      stayDurationHours: stayDurationSeconds / 3600
    };
    const commuteFields = {
      travelMode: String(values.get("travelMode") || "transit"),
      estimatedDurationSeconds,
      estimatedDuration: durationText(estimatedDurationSeconds)
    };
    const timeChanged = fields.time !== String(form.dataset.originalTime || "");
    fields.timeMode = !item || timeChanged ? "manual" : item.timeMode || "auto";
    const file = form.elements.image?.files?.[0];
    if (file) fields.imageData = await readImage(file);
    else if (item?.imageData && !values.get("removeImage")) fields.imageData = item.imageData;
    else fields.imageData = "";
    if (item) {
      Object.assign(item, fields);
      Object.assign(commuteItem, commuteFields);
      if (commuteItem !== item) {
        delete item.travelMode;
        delete item.estimatedDurationSeconds;
        delete item.estimatedDuration;
      }
    } else {
      currentDay.schedule.push({ id: `schedule-custom-${Date.now()}`, ...fields, ...commuteFields });
    }
    window.TravelScheduleTime?.apply?.(currentDay);
    close(itineraryDialog);
    refreshDay(currentDay.day);
  }

  function removeSchedule(dayNumber, id) {
    const currentDay = day(dayNumber);
    const item = currentDay?.schedule.find((entry) => entry.id === id);
    if (!item || !confirm(`删除“${item.text}”？`)) return;
    currentDay.schedule = currentDay.schedule.filter((entry) => entry.id !== id);
    refreshDay(currentDay.day);
  }

  function saveDay(form) {
    const currentDay = day(form.dataset.day);
    const values = new FormData(form);
    currentDay.date = String(values.get("date"));
    currentDay.locations = String(values.get("locations")).split(/\\n|→/).map((value) => value.trim()).filter(Boolean);
    close(itineraryDialog);
    refreshDay(currentDay.day);
  }

  function clicked(event) {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.matches("[data-duration-open]")) return showDurationDialog(target);
    if (target.matches("[data-duration-option]")) return updateDurationOption(target);
    if (target.matches("[data-duration-save]")) return saveDurationDialog();
    if (target.matches("[data-duration-cancel]")) return closeDurationDialog();
    if (target.matches("[data-editor-close]")) return close(target.closest("dialog"));
    if (target.id === "manage-flights-button") { showFlightList(); return open(flightDialog); }
    if (target.matches("[data-flight-add]")) return showFlightForm();
    if (target.matches("[data-rail-add]")) return showRailForm();
    if (target.matches("[data-flight-back]")) return showFlightList();
    if (target.dataset.flightEdit) return showFlightForm(trip.flights.find((flight) => flight.id === target.dataset.flightEdit));
    if (target.dataset.flightDelete) return removeFlight(target.dataset.flightDelete);
    if (target.dataset.railEdit) return showRailForm(trip.groundTransport.publicTransitAndRail.find((rail) => rail.id === target.dataset.railEdit));
    if (target.dataset.railDelete) return removeRail(target.dataset.railDelete);
    if (target.dataset.scheduleEdit) {
      const currentDay = day(target.dataset.day);
      return showScheduleForm(currentDay, currentDay.schedule.find((item) => item.id === target.dataset.scheduleEdit));
    }
    if (target.dataset.scheduleAdd) return showScheduleForm(day(target.dataset.scheduleAdd));
    if (target.dataset.scheduleDelete) return removeSchedule(target.dataset.day, target.dataset.scheduleDelete);
    if (target.dataset.dayEdit) return showDayForm(day(target.dataset.dayEdit));
    if (target.matches("[data-place-search]")) {
      const place = target.closest("form")?.elements.place?.value.trim();
      if (place) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`, "_blank", "noopener");
    }
  }

  async function submitted(event) {
    if (event.target.matches("[data-flight-form]")) { event.preventDefault(); return saveFlight(event.target); }
    if (event.target.matches("[data-rail-form]")) { event.preventDefault(); return saveRail(event.target); }
    if (event.target.matches("[data-schedule-form]")) { event.preventDefault(); return saveSchedule(event.target); }
    if (event.target.matches("[data-day-form]")) { event.preventDefault(); return saveDay(event.target); }
  }

  document.addEventListener("DOMContentLoaded", () => {
    installDialogs();
    document.addEventListener("click", clicked);
    document.addEventListener("submit", submitted);
  });
  document.addEventListener("travel-data-ready", (event) => {
    trip = event.detail;
    loadEdits(trip);
    queueMicrotask(addFlightButton);
  });
  document.addEventListener("travel-flights:rendered", addFlightButton);
  document.addEventListener("travel-itinerary:rendered", addItineraryButtons);
  document.addEventListener("travel-transport:reordered", (event) => {
    if (!trip || !Array.isArray(event.detail?.order)) return;
    trip.transportOrder = [...event.detail.order];
    saveEdits();
  });
})();
