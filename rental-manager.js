(() => {
  "use strict";

  const PREFIX = "travel-studio:rental:v1";
  let trip = null;
  let rental = null;
  let dialog = null;

  const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const key = () => `${PREFIX}:${encodeURIComponent(trip?.metadata?.tripId || "default-trip")}`;
  const safeUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };
  const mapsSearch = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const compactDate = (value) => {
    const parts = String(value || "").split("-");
    return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : "日期待补充";
  };
  const lines = (value) => String(value || "").split(/\n/).map((item) => item.trim()).filter(Boolean);
  const utcOffset = (value) => {
    const candidate = String(value || "").trim();
    return /^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : "+00:00";
  };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(key()) || "null");
      rental = saved?.rental || trip?.groundTransport?.rentalCar || null;
      if (saved?.rentalChecklist) trip.groundTransport.rentalChecklist = saved.rentalChecklist;
      if (saved?.drivingNotes) trip.groundTransport.drivingNotes = saved.drivingNotes;
    } catch {
      rental = trip?.groundTransport?.rentalCar || null;
    }
    trip.groundTransport.rentalCar = rental;
  }

  function save(checklist, drivingNotes) {
    trip.groundTransport.rentalCar = rental;
    trip.groundTransport.rentalChecklist = checklist;
    trip.groundTransport.drivingNotes = drivingNotes;
    localStorage.setItem(key(), JSON.stringify({ rental, rentalChecklist: checklist, drivingNotes, updatedAt: new Date().toISOString() }));
  }

  function parseMoment(point) {
    const date = point?.date;
    const time = point?.time;
    if (!date || !time) return null;
    const parsed = new Date(`${date}T${time}:00${point.utcOffset || "+00:00"}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function countdown(target, done = "已到时间") {
    if (!target) return "待补充";
    const difference = target.getTime() - Date.now();
    if (difference <= 0) return done;
    const total = Math.floor(difference / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
    return days ? `${days}天 ${clock}` : clock;
  }

  function status() {
    if (!rental) return { label: "租车订单", target: null, complete: false };
    const pickup = parseMoment(rental.pickup);
    const dropoff = parseMoment(rental.dropoff);
    const now = new Date();
    if (pickup && now < pickup) return { label: "距取车", target: pickup, complete: false };
    if (dropoff && now < dropoff) return { label: "距还车", target: dropoff, complete: false };
    return { label: "预约已结束", target: dropoff, complete: true };
  }

  function mapLink(point) {
    const query = [point?.location, point?.address].filter(Boolean).join(" ");
    if (!query) return "";
    return `<a class="rental-map-link" href="${esc(mapsSearch(query))}" target="_blank" rel="noopener noreferrer">在 Google Maps 查看 ↗</a>`;
  }

  function emptyState() {
    document.querySelector("#rental-provider-label").textContent = "RENTAL";
    document.querySelector("#rental-card").innerHTML = `
      <article class="rental-empty-state">
        <span class="rental-empty-state__icon" aria-hidden="true"></span>
        <p>CAR RENTAL</p>
        <h3>还没有租车订单</h3>
        <span>添加取还车时间、地点、车型、费用与保险，页面会自动跟踪倒计时和还车截止时间。</span>
        <button class="content-editor-primary" type="button" data-rental-edit>＋ 添加租车订单</button>
      </article>`;
    document.querySelector("#drive-notes").innerHTML = "";
  }

  function renderNotes() {
    const transport = trip.groundTransport;
    const panels = {
      checklist: transport.rentalChecklist?.length ? transport.rentalChecklist : ["核对车身划痕并拍照留存", "确认油量、里程和还车要求", "检查证件、钥匙和随车物品"],
      insurance: rental.insurance?.length ? rental.insurance : ["保险范围待补充", "免赔额与道路救援条款待确认"],
      driving: transport.drivingNotes?.length ? transport.drivingNotes : ["请核对当地驾照、停车和道路收费规则"]
    };
    const root = document.querySelector("#drive-notes");
    root.innerHTML = `<div class="drive-note-tabs" role="group" aria-label="自驾注意事项">
      <button type="button" aria-expanded="true" data-drive-note="checklist">取还车检查</button>
      <button type="button" aria-expanded="false" data-drive-note="insurance">订单保障</button>
      <button type="button" aria-expanded="false" data-drive-note="driving">驾驶提醒</button>
    </div><div class="drive-note-panel"><ul>${panels.checklist.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`;
    root.onclick = (event) => {
      const button = event.target.closest("[data-drive-note]");
      if (!button) return;
      root.querySelectorAll("[data-drive-note]").forEach((entry) => entry.setAttribute("aria-expanded", String(entry === button)));
      root.querySelector(".drive-note-panel").innerHTML = `<ul>${panels[button.dataset.driveNote].map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
    };
  }

  function render(data = trip) {
    trip = data || trip;
    if (!trip) return;
    load();
    if (!rental) return emptyState();
    const current = status();
    const vehicle = rental.vehicle || {};
    const price = rental.price || {};
    const dropoffMoment = parseMoment(rental.dropoff);
    const urgent = dropoffMoment && dropoffMoment.getTime() - Date.now() <= 86400000;
    document.querySelector("#rental-provider-label").textContent = rental.company || "RENTAL";
    document.querySelector("#rental-card").innerHTML = `
      <article class="rental-panel">
        <div class="return-deadline${urgent ? " is-urgent" : ""}">
          <div class="rental-panel-actions"><span class="return-deadline__label">重要 · 还车截止时间</span><button type="button" data-rental-edit>管理租车</button></div>
          <strong>${esc(compactDate(rental.dropoff?.date))} <time>${esc(rental.dropoff?.time || "--:--")}</time> 前</strong>
          <span>${esc(rental.dropoff?.timeZoneLabel || "当地时间")}</span>
          <p>${esc(rental.dropoff?.location || "还车地点待补充")}</p>
          <div class="return-deadline__timer" id="return-deadline-timer">${esc(dropoffMoment ? `距还车截止 ${countdown(dropoffMoment)}` : "还车截止时间待补充")}</div>
          ${rental.dropoff?.deadlineWarning ? `<p class="return-deadline__warning">${esc(rental.dropoff.deadlineWarning)}</p>` : ""}
          <small>${rental.dropoff?.recommendedArrivalTime ? `建议 ${esc(rental.dropoff.recommendedArrivalTime)} 前抵达还车点，预留验车和后续行程时间。` : "建议为验车和后续行程预留充足时间。"}</small>
        </div>
        <div class="rental-countdown" id="rental-countdown"><span>${esc(current.label)}</span><strong>${esc(current.complete ? "已到预约时间" : countdown(current.target))}</strong><small>${esc(rental.bookingNumber ? `订单号 ${rental.bookingNumber}` : "订单号待补充")} · ${esc(rental.company || "租车公司")}</small></div>
        <div class="rental-details">
          <div class="rental-car">${esc(rental.company || "租车公司")} · ${esc(vehicle.example || "车型待补充")}</div>
          <div class="rental-sub">${esc(vehicle.class || "车组待补充")} · ${rental.unlimitedKilometers ? "无限里程" : "里程条款见订单"}</div>
          <div class="rental-stops">
            <div class="rental-stop"><span class="rental-stop__label">PICK UP</span><div><b>${esc(compactDate(rental.pickup?.date))} ${esc(rental.pickup?.time || "--:--")}</b><span>${esc(rental.pickup?.location || "取车地点待补充")}<br>${esc(rental.pickup?.address || "")}</span>${mapLink(rental.pickup)}</div></div>
            <div class="rental-stop"><span class="rental-stop__label">RETURN</span><div><b>${esc(compactDate(rental.dropoff?.date))} ${esc(rental.dropoff?.time || "--:--")}</b><span>${esc(rental.dropoff?.location || "还车地点待补充")}<br>${esc(rental.dropoff?.address || "")}</span>${mapLink(rental.dropoff)}</div></div>
          </div>
          <div class="rental-price"><span>${esc(price.paymentMethod || "柜台支付")} · ${Number(rental.rentalPeriodDays || 1)} 天</span><strong>${esc(price.currency || "CNY")} ${Number(price.payAtCounter || 0).toFixed(2)}</strong></div>
          <div class="rental-resource-links">${safeUrl(rental.bookingUrl) ? `<a href="${esc(safeUrl(rental.bookingUrl))}" target="_blank" rel="noopener noreferrer">打开租车订单 ↗</a>` : ""}${safeUrl(rental.voucherUrl) ? `<a href="${esc(safeUrl(rental.voucherUrl))}" target="_blank" rel="noopener noreferrer">查看租车凭证 ↗</a>` : ""}</div>
        </div>
      </article>`;
    renderNotes();
  }

  function value(path, fallback = "") {
    return path.split(".").reduce((current, part) => current?.[part], rental) ?? fallback;
  }

  function formMarkup() {
    const start = trip.trip?.startDate || "";
    const end = trip.trip?.endDate || start;
    return `<header class="content-editor-dialog-header"><div><span>CAR RENTAL</span><h2>${rental ? "管理租车" : "添加租车"}</h2></div><button type="button" data-rental-close>关闭</button></header>
      <form class="content-editor-dialog-body content-editor-form rental-editor-form" data-rental-form>
        <div class="rental-form-grid">
          <label><span>租车公司</span><input name="company" required value="${esc(value("company"))}" placeholder="Hertz / Toyota Rent a Car"></label>
          <label><span>订单号</span><input name="bookingNumber" value="${esc(value("bookingNumber"))}" placeholder="选填"></label>
          <label><span>车组</span><input name="vehicleClass" value="${esc(value("vehicle.class"))}" placeholder="紧凑型 SUV"></label>
          <label><span>示例车型</span><input name="vehicleExample" value="${esc(value("vehicle.example"))}" placeholder="Toyota Yaris Cross"></label>
        </div>
        <label class="rental-check"><input type="checkbox" name="unlimitedKilometers" ${value("unlimitedKilometers") ? "checked" : ""}><span>订单包含无限里程</span></label>
        <fieldset><legend>取车信息</legend><div class="rental-form-grid">
          <label><span>日期</span><input type="date" name="pickupDate" required value="${esc(value("pickup.date", start))}"></label>
          <label><span>时间</span><input type="time" name="pickupTime" required value="${esc(value("pickup.time", "10:00"))}"></label>
          <label><span>当地 UTC 时差</span><input name="pickupUtcOffset" required pattern="[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]" value="${esc(value("pickup.utcOffset", "+08:00"))}" placeholder="+08:00"></label>
          <label><span>取车点</span><input name="pickupLocation" required value="${esc(value("pickup.location"))}" placeholder="机场或门店名称"></label>
          <label><span>详细地址</span><input name="pickupAddress" value="${esc(value("pickup.address"))}" placeholder="街道、楼层、柜台"></label>
        </div></fieldset>
        <fieldset><legend>还车信息</legend><div class="rental-form-grid">
          <label><span>日期</span><input type="date" name="dropoffDate" required value="${esc(value("dropoff.date", end))}"></label>
          <label><span>时间</span><input type="time" name="dropoffTime" required value="${esc(value("dropoff.time", "10:00"))}"></label>
          <label><span>当地 UTC 时差</span><input name="dropoffUtcOffset" required pattern="[+-](0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]" value="${esc(value("dropoff.utcOffset", "+08:00"))}" placeholder="+08:00"></label>
          <label><span>还车点</span><input name="dropoffLocation" required value="${esc(value("dropoff.location"))}" placeholder="机场或门店名称"></label>
          <label><span>详细地址</span><input name="dropoffAddress" value="${esc(value("dropoff.address"))}" placeholder="还车入口或停车楼"></label>
          <label><span>建议抵达时间</span><input type="time" name="recommendedArrivalTime" value="${esc(value("dropoff.recommendedArrivalTime"))}"></label>
          <label><span>时区说明</span><input name="timeZoneLabel" value="${esc(value("dropoff.timeZoneLabel", "当地时间"))}"></label>
        </div><label><span>还车提醒</span><textarea name="deadlineWarning" rows="2" placeholder="超时费、油量或航班衔接提醒">${esc(value("dropoff.deadlineWarning"))}</textarea></label></fieldset>
        <fieldset><legend>费用与资料</legend><div class="rental-form-grid">
          <label><span>币种</span><input name="currency" value="${esc(value("price.currency", "CNY"))}" maxlength="3"></label>
          <label><span>金额</span><input name="amount" type="number" min="0" step="0.01" value="${esc(value("price.payAtCounter", ""))}"></label>
          <label><span>付款方式</span><input name="paymentMethod" value="${esc(value("price.paymentMethod", "柜台支付"))}"></label>
          <label><span>订单链接</span><input name="bookingUrl" type="url" value="${esc(value("bookingUrl"))}" placeholder="https://..."></label>
          <label class="rental-form-wide"><span>凭证链接</span><input name="voucherUrl" type="url" value="${esc(value("voucherUrl"))}" placeholder="https://..."></label>
        </div></fieldset>
        <label><span>保险与保障 <small>每行一项</small></span><textarea name="insurance" rows="4">${esc((value("insurance", []) || []).join("\n"))}</textarea></label>
        <label><span>取还车检查 <small>每行一项</small></span><textarea name="checklist" rows="4">${esc((trip.groundTransport.rentalChecklist || []).join("\n"))}</textarea></label>
        <label><span>驾驶提醒 <small>每行一项</small></span><textarea name="drivingNotes" rows="4">${esc((trip.groundTransport.drivingNotes || []).join("\n"))}</textarea></label>
        <div class="content-editor-form-actions">${rental ? `<button class="is-danger" type="button" data-rental-delete>删除订单</button>` : ""}<button type="button" data-rental-close>取消</button><button class="content-editor-primary" type="submit">保存租车</button></div>
      </form>`;
  }

  function openEditor() {
    dialog.innerHTML = formMarkup();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeEditor() {
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  function saveForm(form) {
    const data = new FormData(form);
    const pickupDate = String(data.get("pickupDate"));
    const dropoffDate = String(data.get("dropoffDate"));
    const period = Math.max(1, Math.ceil((new Date(`${dropoffDate}T12:00:00`) - new Date(`${pickupDate}T12:00:00`)) / 86400000));
    rental = {
      company: String(data.get("company") || "").trim(),
      bookingNumber: String(data.get("bookingNumber") || "").trim(),
      bookingUrl: String(data.get("bookingUrl") || "").trim(),
      voucherUrl: String(data.get("voucherUrl") || "").trim(),
      vehicle: { class: String(data.get("vehicleClass") || "").trim(), example: String(data.get("vehicleExample") || "").trim() },
      unlimitedKilometers: data.get("unlimitedKilometers") === "on",
      pickup: { date: pickupDate, time: String(data.get("pickupTime")), location: String(data.get("pickupLocation") || "").trim(), address: String(data.get("pickupAddress") || "").trim(), utcOffset: utcOffset(data.get("pickupUtcOffset")) },
      dropoff: { date: dropoffDate, time: String(data.get("dropoffTime")), location: String(data.get("dropoffLocation") || "").trim(), vehicleReturnPoint: String(data.get("dropoffLocation") || "").trim(), address: String(data.get("dropoffAddress") || "").trim(), recommendedArrivalTime: String(data.get("recommendedArrivalTime") || ""), timeZoneLabel: String(data.get("timeZoneLabel") || "").trim(), deadlineWarning: String(data.get("deadlineWarning") || "").trim(), utcOffset: utcOffset(data.get("dropoffUtcOffset")) },
      price: { currency: String(data.get("currency") || "CNY").trim().toUpperCase(), payAtCounter: Number(data.get("amount") || 0), paymentMethod: String(data.get("paymentMethod") || "").trim() },
      insurance: lines(data.get("insurance")),
      rentalPeriodDays: period
    };
    save(lines(data.get("checklist")), lines(data.get("drivingNotes")));
    closeEditor();
    render();
  }

  function setup() {
    document.body.insertAdjacentHTML("beforeend", '<dialog class="content-editor-dialog rental-editor-dialog" id="rental-editor-dialog"></dialog>');
    dialog = document.querySelector("#rental-editor-dialog");
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-rental-edit]")) openEditor();
      if (button.matches("[data-rental-close]")) closeEditor();
      if (button.matches("[data-rental-delete]") && confirm("删除这份租车订单？")) {
        rental = null;
        save([], []);
        closeEditor();
        render();
      }
    });
    document.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-rental-form]")) return;
      event.preventDefault();
      saveForm(event.target);
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeEditor(); });
  }

  document.addEventListener("DOMContentLoaded", setup);
  document.addEventListener("travel-data-ready", (event) => {
    trip = event.detail;
    load();
  });

  window.TravelRentalManager = {
    render,
    updateCountdown() {
      if (!rental) return;
      const current = status();
      const countdownElement = document.querySelector("#rental-countdown");
      if (countdownElement) {
        countdownElement.querySelector("span").textContent = current.label;
        countdownElement.querySelector("strong").textContent = current.complete ? "已到预约时间" : countdown(current.target);
      }
      const deadline = parseMoment(rental.dropoff);
      const timer = document.querySelector("#return-deadline-timer");
      if (timer && deadline) timer.textContent = deadline.getTime() > Date.now() ? `距还车截止 ${countdown(deadline)}` : "预约还车时间已过";
      document.querySelector(".return-deadline")?.classList.toggle("is-urgent", Boolean(deadline && deadline.getTime() - Date.now() <= 86400000));
    }
  };
})();
