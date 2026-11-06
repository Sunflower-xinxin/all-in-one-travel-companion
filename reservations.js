(() => {
  "use strict";

  const PREFIX = "travel-studio:reservations:v1";
  const CATEGORIES = {
    ticket: { label: "门票", icon: "◇" },
    restaurant: { label: "餐厅", icon: "○" },
    experience: { label: "体验", icon: "△" },
    event: { label: "演出活动", icon: "☆" },
    service: { label: "服务", icon: "□" }
  };
  const STATUSES = {
    idea: "想去",
    planning: "待预约",
    waitlist: "候补中",
    booked: "已预约",
    confirmed: "已确认",
    cancelled: "已取消"
  };
  let trip = null;
  let items = [];
  let activeTab = "discover";
  let categoryFilter = "all";
  let dialog = null;
  let liveResults = [];
  let liveQuery = "";
  let liveState = "offline";
  let liveMessage = "连接 Google Places 与票务/餐厅渠道后，将显示实时评分、照片和可预约状态。";

  const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const key = () => `${PREFIX}:${encodeURIComponent(trip?.metadata?.tripId || "default-trip")}`;
  const destination = () => trip?.trip?.primaryDestinationName || trip?.trip?.citiesAndAreas?.[0] || "目的地";
  const safeUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };
  const mapsSearch = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const itemMap = (item) => safeUrl(item.mapUrl) || mapsSearch([item.title, item.address, destination()].filter(Boolean).join(" "));
  const makeId = () => `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(key()) || "[]");
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }
  }

  function save() {
    localStorage.setItem(key(), JSON.stringify(items));
  }

  function readImage(file) {
    if (!file) return Promise.resolve("");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("图片无法识别"));
        image.onload = () => {
          const limit = 1400;
          const scale = Math.min(1, limit / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", .82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function discoveryCards() {
    const city = destination();
    const cards = [
      { type: "ticket", title: `${city}热门景点与门票`, copy: "先比较官网、授权平台和现场政策，再确认入场时段。", query: `${city} 热门景点 门票` },
      { type: "restaurant", title: `${city}高评分餐厅`, copy: "优先确认营业时间、预约渠道、低消和取消政策。", query: `${city} 高评分餐厅` },
      { type: "experience", title: `${city}当地体验`, copy: "寻找展览、游船、工作坊、导览和限时活动。", query: `${city} 当地体验 活动` }
    ];
    return cards.map((card) => `<a class="reservation-discovery-card is-${card.type}" href="${esc(mapsSearch(card.query))}" target="_blank" rel="noopener noreferrer">
      <span class="reservation-discovery-card__art" aria-hidden="true"><i>${CATEGORIES[card.type].icon}</i></span>
      <span class="reservation-discovery-card__copy"><small>${esc(CATEGORIES[card.type].label)} · GOOGLE MAPS</small><strong>${esc(card.title)}</strong><span>${esc(card.copy)}</span><b>开始探索 ↗</b></span>
    </a>`).join("");
  }

  function liveResultCard(item, index) {
    const title = item.title || item.name || "未命名地点";
    const mapsUrl = safeUrl(item.mapsUrl || item.mapUrl) || mapsSearch([title, item.address, destination()].filter(Boolean).join(" "));
    const photo = safeUrl(item.photoUrl || item.imageUrl);
    const booking = safeUrl(item.bookingUrl);
    const meta = [item.rating ? `★ ${item.rating}${item.reviewCount ? ` · ${item.reviewCount} 条评价` : ""}` : "", item.priceLevel || "", item.availability || item.availabilityText || ""].filter(Boolean).join(" · ");
    return `<article class="reservation-live-result">
      ${photo ? `<img src="${esc(photo)}" alt="${esc(title)}">` : `<span class="reservation-live-result__placeholder" aria-hidden="true">${esc((CATEGORIES[item.category] || CATEGORIES.ticket).icon)}</span>`}
      <div class="reservation-live-result__body"><strong>${esc(title)}</strong>${meta ? `<div class="reservation-live-result__meta">${esc(meta)}</div>` : ""}${item.address ? `<div class="reservation-live-result__address">${esc(item.address)}</div>` : ""}<div class="reservation-live-result__actions"><a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>${booking ? `<a href="${esc(booking)}" target="_blank" rel="noopener noreferrer">查看余位 / 预约 ↗</a>` : ""}<button type="button" data-reservation-import="${index}">保存到清单</button></div></div>
    </article>`;
  }

  function livePanel() {
    const stateLabel = liveState === "ready" ? "实时服务已连接" : liveState === "loading" ? "正在搜索" : "服务端待连接";
    return `<section class="reservation-live-panel" aria-label="实时商户与票务推荐">
      <div class="reservation-live-panel__heading"><strong>实时商户、门票与订位</strong><span class="reservation-provider-state ${liveState === "ready" ? "is-live" : ""}">${stateLabel}</span></div>
      <form class="reservation-live-search" data-reservation-live-search><input name="query" value="${esc(liveQuery)}" placeholder="搜索餐厅、景点、展览或体验" aria-label="搜索实时推荐"><button type="submit" ${liveState === "loading" ? "disabled" : ""}>${liveState === "loading" ? "搜索中…" : "搜索"}</button></form>
      <p class="reservation-live-note" role="status">${esc(liveMessage)}</p>
      ${liveResults.length ? `<div class="reservation-live-results">${liveResults.map(liveResultCard).join("")}</div>` : ""}
    </section>`;
  }

  async function searchLive(form) {
    liveQuery = String(new FormData(form).get("query") || "").trim();
    if (!liveQuery) return;
    liveState = "loading";
    liveMessage = `正在为 ${destination()} 搜索“${liveQuery}”…`;
    render();
    try {
      const url = new URL("/api/recommendations", location.origin);
      url.searchParams.set("destination", destination());
      url.searchParams.set("query", liveQuery);
      url.searchParams.set("category", categoryFilter === "all" ? "" : categoryFilter);
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`provider-${response.status}`);
      const payload = await response.json();
      liveResults = Array.isArray(payload.results) ? payload.results : [];
      liveState = "ready";
      liveMessage = liveResults.length ? `已找到 ${liveResults.length} 个实时结果，评分与可预约状态以渠道页面为准。` : "没有找到结果，可以换一个关键词。";
    } catch {
      liveResults = [];
      liveState = "offline";
      liveMessage = "本地审批版尚未配置服务端密钥。Google Places、票务与餐厅合作渠道会在安全部署后从这里返回实时结果。";
    }
    render();
  }

  function importLiveResult(index) {
    const item = liveResults[index];
    if (!item) return;
    const title = item.title || item.name || "推荐地点";
    items.unshift({
      id: makeId(),
      title,
      category: item.category || "ticket",
      status: "idea",
      reason: item.summary || (item.rating ? `实时评分 ${item.rating}` : "来自实时推荐"),
      address: item.address || "",
      mapUrl: item.mapsUrl || item.mapUrl || "",
      bookingUrl: item.bookingUrl || "",
      officialUrl: item.officialUrl || "",
      imageUrl: item.photoUrl || item.imageUrl || "",
      rating: item.rating || "",
      reviewCount: item.reviewCount || "",
      availability: item.availability || item.availabilityText || "",
      channel: item.channel || item.provider || "实时推荐",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    save();
    render();
  }

  function statusClass(status) {
    return ["booked", "confirmed"].includes(status) ? "is-confirmed" : status === "cancelled" ? "is-cancelled" : status === "waitlist" ? "is-waitlist" : "is-planning";
  }

  function itemCard(item) {
    const category = CATEGORIES[item.category] || CATEGORIES.ticket;
    const booking = safeUrl(item.bookingUrl);
    const official = safeUrl(item.officialUrl);
    const image = /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(item.imageData || "")) || /^https?:\/\//.test(String(item.imageUrl || ""))
      ? item.imageData || item.imageUrl : "";
    const time = [item.reservationDate, item.reservationTime].filter(Boolean).join(" ");
    return `<article class="reservation-card ${statusClass(item.status)}" data-reservation-id="${esc(item.id)}">
      <div class="reservation-card__image ${image ? "has-image" : `is-${esc(item.category)}`}">${image ? `<img src="${esc(image)}" alt="${esc(item.title)}">` : `<span aria-hidden="true">${category.icon}</span>`}<small>${esc(category.label)}</small></div>
      <div class="reservation-card__body">
        <header><div><span class="reservation-status">${esc(STATUSES[item.status] || STATUSES.idea)}</span><h3>${esc(item.title)}</h3></div><button type="button" data-reservation-edit="${esc(item.id)}">修改</button></header>
        ${item.reason ? `<p class="reservation-card__reason">${esc(item.reason)}</p>` : ""}
        ${item.address ? `<a class="reservation-card__address" href="${esc(itemMap(item))}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">⌖</span>${esc(item.address)} · Google Maps ↗</a>` : `<a class="reservation-card__address" href="${esc(itemMap(item))}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">⌖</span>在 Google Maps 确认地址 ↗</a>`}
        <dl class="reservation-card__facts">
          ${time ? `<div><dt>时间</dt><dd>${esc(time)}</dd></div>` : ""}
          ${item.partySize ? `<div><dt>人数</dt><dd>${esc(item.partySize)} 人</dd></div>` : ""}
          ${item.price ? `<div><dt>费用</dt><dd>${esc(item.currency || "CNY")} ${esc(item.price)}</dd></div>` : ""}
          ${item.rating ? `<div><dt>评分</dt><dd>★ ${esc(item.rating)}${item.reviewCount ? ` · ${esc(item.reviewCount)} 条` : ""}</dd></div>` : ""}
          ${item.availability ? `<div><dt>余位状态</dt><dd>${esc(item.availability)}</dd></div>` : ""}
          ${item.channel ? `<div><dt>渠道</dt><dd>${esc(item.channel)}</dd></div>` : ""}
          ${item.confirmationNumber ? `<div><dt>确认号</dt><dd>${esc(item.confirmationNumber)}</dd></div>` : ""}
          ${item.cancellationDeadline ? `<div><dt>取消截止</dt><dd>${esc(item.cancellationDeadline.replace("T", " "))}</dd></div>` : ""}
        </dl>
        ${item.notes ? `<p class="reservation-card__notes">${esc(item.notes)}</p>` : ""}
        <footer>
          <div>${booking ? `<a href="${esc(booking)}" target="_blank" rel="noopener noreferrer">打开预约渠道 ↗</a>` : ""}${official ? `<a href="${esc(official)}" target="_blank" rel="noopener noreferrer">官方网站 ↗</a>` : ""}</div>
          ${["idea", "planning", "waitlist"].includes(item.status) ? `<button class="reservation-book-button" type="button" data-reservation-booked="${esc(item.id)}">标记已预约</button>` : ""}
        </footer>
      </div>
    </article>`;
  }

  function visibleItems() {
    const filtered = categoryFilter === "all" ? items : items.filter((item) => item.category === categoryFilter);
    return activeTab === "bookings" ? filtered.filter((item) => ["booked", "confirmed", "waitlist"].includes(item.status)) : filtered;
  }

  function render() {
    const root = document.querySelector("#reservation-root");
    if (!root || !trip) return;
    const booked = items.filter((item) => ["booked", "confirmed"].includes(item.status)).length;
    document.querySelector("#reservation-count").textContent = `${booked} BOOKED / ${items.length}`;
    const list = visibleItems();
    root.innerHTML = `
      <div class="reservation-overview">
        <div><span>预约进度</span><strong>${booked}<small> / ${items.length}</small></strong><p>已确定的门票、餐厅和体验</p></div>
        <button class="content-editor-primary" type="button" data-reservation-add>＋ 添加推荐或预约</button>
      </div>
      <div class="reservation-tabs" role="tablist" aria-label="预约与推荐">
        <button type="button" role="tab" data-reservation-tab="discover" aria-selected="${activeTab === "discover"}">发现与清单</button>
        <button type="button" role="tab" data-reservation-tab="bookings" aria-selected="${activeTab === "bookings"}">我的预约 <span>${booked}</span></button>
      </div>
      ${activeTab === "discover" ? `<section class="reservation-discovery"><div class="reservation-subheading"><div><small>START HERE</small><h3>在 ${esc(destination())} 找到值得预约的地方</h3></div><p>实时服务将汇总评分、照片、地址与预约渠道；保存前仍建议查看官方退改规则。</p></div>${livePanel()}<div class="reservation-discovery-grid">${discoveryCards()}</div></section>` : ""}
      <section class="reservation-saved-list">
        <div class="reservation-list-heading"><div><small>${activeTab === "bookings" ? "CONFIRMED PLANS" : "SAVED PLACES"}</small><h3>${activeTab === "bookings" ? "我的预约" : "推荐与预约清单"}</h3></div><div class="reservation-filters">${[["all", "全部"], ["ticket", "门票"], ["restaurant", "餐厅"], ["experience", "体验"]].map(([value, label]) => `<button type="button" data-reservation-filter="${value}" aria-pressed="${categoryFilter === value}">${label}</button>`).join("")}</div></div>
        <div class="reservation-card-list">${list.length ? list.map(itemCard).join("") : `<div class="reservation-empty"><span>◇</span><h3>${activeTab === "bookings" ? "还没有确定的预约" : "还没有保存推荐"}</h3><p>添加门票、餐厅或体验，并记录预约渠道、取消期限与凭证。</p><button type="button" data-reservation-add>添加第一项</button></div>`}</div>
      </section>`;
  }

  function fieldValue(item, name, fallback = "") {
    return item?.[name] ?? fallback;
  }

  function formMarkup(item = null) {
    const status = fieldValue(item, "status", "planning");
    return `<header class="content-editor-dialog-header"><div><span>RESERVATION</span><h2>${item ? "修改推荐与预约" : "添加推荐或预约"}</h2></div><button type="button" data-reservation-close>关闭</button></header>
      <form class="content-editor-dialog-body content-editor-form reservation-editor-form" data-reservation-form data-id="${esc(item?.id || "")}">
        <div class="reservation-form-grid">
          <label class="reservation-form-wide"><span>名称</span><input name="title" required value="${esc(fieldValue(item, "title"))}" placeholder="景点、餐厅或活动名称"></label>
          <label><span>类型</span><select name="category">${Object.entries(CATEGORIES).map(([value, meta]) => `<option value="${value}" ${fieldValue(item, "category", "ticket") === value ? "selected" : ""}>${meta.label}</option>`).join("")}</select></label>
          <label><span>状态</span><select name="status">${Object.entries(STATUSES).map(([value, label]) => `<option value="${value}" ${status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="reservation-form-wide"><span>推荐理由</span><textarea name="reason" rows="2" placeholder="为什么值得去，有什么需要提前注意">${esc(fieldValue(item, "reason"))}</textarea></label>
          <label class="reservation-form-wide"><span>地址</span><input name="address" value="${esc(fieldValue(item, "address"))}" placeholder="完整地址，保存后可跳转 Google Maps"></label>
          <label><span>预约日期</span><input name="reservationDate" type="date" value="${esc(fieldValue(item, "reservationDate"))}"></label>
          <label><span>预约时间</span><input name="reservationTime" type="time" value="${esc(fieldValue(item, "reservationTime"))}"></label>
          <label><span>人数</span><input name="partySize" type="number" min="1" max="99" value="${esc(fieldValue(item, "partySize", "1"))}"></label>
          <label><span>预约渠道</span><input name="channel" value="${esc(fieldValue(item, "channel"))}" placeholder="官网 / 电话 / 平台"></label>
          <label><span>价格</span><input name="price" type="number" min="0" step="0.01" value="${esc(fieldValue(item, "price"))}"></label>
          <label><span>币种</span><input name="currency" maxlength="3" value="${esc(fieldValue(item, "currency", "CNY"))}"></label>
          <label class="reservation-form-wide"><span>预约链接</span><input name="bookingUrl" type="url" value="${esc(fieldValue(item, "bookingUrl"))}" placeholder="https://..."></label>
          <label class="reservation-form-wide"><span>官方网站</span><input name="officialUrl" type="url" value="${esc(fieldValue(item, "officialUrl"))}" placeholder="https://..."></label>
          <label class="reservation-form-wide"><span>图片链接 <small>选填</small></span><input name="imageUrl" type="url" value="${esc(fieldValue(item, "imageUrl"))}" placeholder="https://.../photo.jpg"></label>
          <label><span>确认号 / 取票码</span><input name="confirmationNumber" value="${esc(fieldValue(item, "confirmationNumber"))}"></label>
          <label><span>取消截止时间</span><input name="cancellationDeadline" type="datetime-local" value="${esc(fieldValue(item, "cancellationDeadline"))}"></label>
          <label class="reservation-form-wide content-editor-file"><span>上传图片 <small>选填</small></span><input name="image" type="file" accept="image/*"></label>
          ${item?.imageData || item?.imageUrl ? `<label class="reservation-form-wide reservation-remove-image"><input name="removeImage" type="checkbox"><span>删除当前图片</span></label>` : ""}
          <label class="reservation-form-wide"><span>备注</span><textarea name="notes" rows="3" placeholder="取票方式、着装要求、忌口、排队或退改提醒">${esc(fieldValue(item, "notes"))}</textarea></label>
        </div>
        <div class="reservation-form-hint"><strong>预约前建议确认</strong><span>官方或授权渠道 · 实名与证件要求 · 取消时限 · 现场入场规则</span></div>
        <div class="content-editor-form-actions">${item ? `<button class="is-danger" type="button" data-reservation-delete="${esc(item.id)}">删除</button>` : ""}<button type="button" data-reservation-close>取消</button><button class="content-editor-primary" type="submit">保存</button></div>
      </form>`;
  }

  function openEditor(id = "") {
    const item = items.find((entry) => entry.id === id) || null;
    dialog.innerHTML = formMarkup(item);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeEditor() {
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
  }

  async function submit(form) {
    const old = items.find((item) => item.id === form.dataset.id) || null;
    const data = new FormData(form);
    const next = {
      id: old?.id || makeId(),
      title: String(data.get("title") || "").trim(),
      category: String(data.get("category") || "ticket"),
      status: String(data.get("status") || "planning"),
      reason: String(data.get("reason") || "").trim(),
      address: String(data.get("address") || "").trim(),
      reservationDate: String(data.get("reservationDate") || ""),
      reservationTime: String(data.get("reservationTime") || ""),
      partySize: String(data.get("partySize") || ""),
      channel: String(data.get("channel") || "").trim(),
      price: String(data.get("price") || ""),
      currency: String(data.get("currency") || "CNY").toUpperCase(),
      bookingUrl: String(data.get("bookingUrl") || "").trim(),
      officialUrl: String(data.get("officialUrl") || "").trim(),
      imageUrl: String(data.get("imageUrl") || "").trim(),
      confirmationNumber: String(data.get("confirmationNumber") || "").trim(),
      cancellationDeadline: String(data.get("cancellationDeadline") || ""),
      notes: String(data.get("notes") || "").trim(),
      imageData: old?.imageData || "",
      createdAt: old?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (data.get("removeImage")) {
      next.imageData = "";
      next.imageUrl = "";
    }
    const file = form.elements.image?.files?.[0];
    if (file) next.imageData = await readImage(file);
    const index = items.findIndex((item) => item.id === next.id);
    if (index >= 0) items[index] = next;
    else items.unshift(next);
    save();
    closeEditor();
    render();
  }

  function setup() {
    document.body.insertAdjacentHTML("beforeend", '<dialog class="content-editor-dialog reservation-editor-dialog" id="reservation-editor-dialog"></dialog>');
    dialog = document.querySelector("#reservation-editor-dialog");
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-reservation-add]")) return openEditor();
      if (button.dataset.reservationEdit) return openEditor(button.dataset.reservationEdit);
      if (button.matches("[data-reservation-close]")) return closeEditor();
      if (button.dataset.reservationTab) { activeTab = button.dataset.reservationTab; return render(); }
      if (button.dataset.reservationFilter) { categoryFilter = button.dataset.reservationFilter; return render(); }
      if (button.dataset.reservationBooked) {
        const item = items.find((entry) => entry.id === button.dataset.reservationBooked);
        if (item) { item.status = "booked"; item.updatedAt = new Date().toISOString(); save(); render(); }
      }
      if (button.dataset.reservationImport) return importLiveResult(Number(button.dataset.reservationImport));
      if (button.dataset.reservationDelete && confirm("删除这条推荐或预约？")) {
        items = items.filter((item) => item.id !== button.dataset.reservationDelete);
        save(); closeEditor(); render();
      }
    });
    document.addEventListener("submit", (event) => {
      if (event.target.matches("[data-reservation-live-search]")) {
        event.preventDefault();
        void searchLive(event.target);
        return;
      }
      if (!event.target.matches("[data-reservation-form]")) return;
      event.preventDefault();
      void submit(event.target);
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeEditor(); });
  }

  document.addEventListener("DOMContentLoaded", setup);
  document.addEventListener("travel-data-ready", (event) => {
    trip = event.detail;
    load();
    queueMicrotask(render);
  });
})();
