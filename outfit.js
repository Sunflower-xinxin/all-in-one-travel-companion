(() => {
  "use strict";
  let trip = null;
  let outfits = {};
  let weather = { byDate: {}, loading: true };
  let dialog = null;
  const root = () => document.querySelector("#outfit-root");
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const storageKey = () => `travel-plan:outfits:v1:${encodeURIComponent(trip?.metadata?.tripId || "default-trip")}`;

  function load() {
    try {
      outfits = JSON.parse(localStorage.getItem(storageKey()) || "{}") || {};
    } catch {
      outfits = {};
    }
  }

  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(outfits));
    } catch (error) {
      console.error("Could not save outfit", error);
      alert("本地存储空间不足，请换一张更小的图片后重试。");
    }
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
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

  function formatDate(date) {
    const [, month, day] = date.split("-");
    return `${Number(month)}月${Number(day)}日`;
  }

  function weatherMarkup(date) {
    const item = weather.byDate?.[date];
    if (item) return `<div class="outfit-weather">
      <span class="outfit-weather__icon" aria-hidden="true">${esc(item.icon)}</span>
      <div class="outfit-weather__main"><strong>${esc(item.min)}° — ${esc(item.max)}° · ${esc(item.condition)}</strong><span>降雨 ${esc(item.rain)}% · 最大风速 ${esc(item.wind)} km/h</span></div>
      <p class="outfit-weather__advice">${esc(item.advice)}</p>
    </div>`;
    const message = weather.loading ? "正在获取天气…" : weather.error ? "天气暂时无法更新" : "暂未进入可预报日期范围";
    return `<div class="outfit-weather is-pending"><span class="outfit-weather__icon" aria-hidden="true">○</span><div class="outfit-weather__main"><strong>${message}</strong><span>天气仅作穿搭参考，请在出发前再次确认。</span></div></div>`;
  }

  function render() {
    if (!trip || !root()) return;
    root().innerHTML = `
      <section class="outfit-hero">
        <p>DAILY OUTFITS</p>
        <h1>每日服装搭配</h1>
        <span>按日期保存穿搭文字、图片与参考链接</span>
        <div class="outfit-weather-summary"><i aria-hidden="true"></i><span>${weather.source ? `${esc(weather.destination || "目的地")}实时天气 · ${esc(weather.source)}` : "天气会根据目的地和日期自动更新"}</span></div>
      </section>
      <section class="outfit-grid">
        ${trip.days.map((day) => {
          const outfit = outfits[day.date] || {};
          const link = safeUrl(outfit.url);
          return `
            <article class="outfit-card">
              <header><span>DAY ${String(day.day).padStart(2, "0")}</span><strong>${formatDate(day.date)}</strong></header>
              ${outfit.imageData ? `<img src="${outfit.imageData}" alt="${esc(day.date)} 服装搭配">` : '<div class="outfit-placeholder" aria-hidden="true">LOOK</div>'}
              <div class="outfit-card-body">
                <h2>${esc(day.title)}</h2>
                ${weatherMarkup(day.date)}
                <p>${outfit.text ? esc(outfit.text) : "尚未添加当天穿搭"}</p>
                ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开穿搭参考 ↗</a>` : ""}
                <div class="outfit-actions">
                  ${outfit.text || outfit.imageData || outfit.url ? `<button class="is-danger" type="button" data-outfit-clear="${day.date}">清空</button>` : ""}
                  <button class="content-editor-primary" type="button" data-outfit-edit="${day.date}">${outfit.text || outfit.imageData || outfit.url ? "修改搭配" : "＋ 添加搭配"}</button>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </section>
    `;
  }

  function openEditor(date) {
    const day = trip.days.find((item) => item.date === date);
    const outfit = outfits[date] || {};
    dialog.innerHTML = `
      <header class="content-editor-dialog-header">
        <div><span>${formatDate(date)}</span><h2>服装搭配</h2></div>
        <button type="button" data-outfit-close>关闭</button>
      </header>
      <form class="content-editor-dialog-body content-editor-form" data-outfit-form data-date="${date}">
        <p class="outfit-form-day">${esc(day?.title || "")}</p>
        <label><span>搭配说明 <small>选填</small></span><textarea name="text" rows="5" placeholder="例如：薄外套、短袖、舒适运动鞋">${esc(outfit.text || "")}</textarea></label>
        <label><span>参考网址 <small>选填</small></span><input name="url" type="url" value="${esc(outfit.url || "")}" placeholder="https://..."></label>
        <label class="content-editor-file"><span>上传搭配图片 <small>选填</small></span><input name="image" type="file" accept="image/*"></label>
        ${outfit.imageData ? `<div class="content-editor-image-preview outfit-image-preview" data-outfit-image-preview>
          <img src="${outfit.imageData}" alt="当前服装图片">
          <input name="removeImage" type="hidden" value="">
          <div class="outfit-image-delete-actions" role="group" aria-label="当前图片操作">
            <button class="outfit-image-delete-button is-danger" type="button" data-outfit-remove-image>删除图片</button>
            <button class="outfit-image-cancel-button" type="button" data-outfit-cancel-remove>取消删除</button>
          </div>
          <p class="outfit-image-delete-status" data-outfit-image-status aria-live="polite">当前图片会保留</p>
        </div>` : ""}
        <div class="content-editor-form-actions">
          <button type="button" data-outfit-close>取消</button>
          <button class="content-editor-primary" type="submit">保存搭配</button>
        </div>
      </form>
    `;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeEditor() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  async function submit(form) {
    const date = form.dataset.date;
    const current = outfits[date] || {};
    const values = new FormData(form);
    const next = {
      text: String(values.get("text") || "").trim(),
      url: String(values.get("url") || "").trim(),
      imageData: values.get("removeImage") ? "" : current.imageData || ""
    };
    const file = form.elements.image?.files?.[0];
    if (file) next.imageData = await readImage(file);
    outfits[date] = next;
    save();
    closeEditor();
    render();
  }

  function setup() {
    document.body.insertAdjacentHTML("beforeend", '<dialog class="content-editor-dialog" id="outfit-editor-dialog"></dialog>');
    dialog = document.querySelector("#outfit-editor-dialog");
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeEditor();
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-outfit-remove-image]")) {
        const preview = button.closest("[data-outfit-image-preview]");
        const removeField = preview?.querySelector('[name="removeImage"]');
        const status = preview?.querySelector("[data-outfit-image-status]");
        if (removeField) removeField.value = "1";
        preview?.classList.add("is-pending-delete");
        button.disabled = true;
        button.setAttribute("aria-pressed", "true");
        if (status) status.textContent = "保存搭配后将删除当前图片";
        return;
      }
      if (button.matches("[data-outfit-cancel-remove]")) {
        const preview = button.closest("[data-outfit-image-preview]");
        const removeField = preview?.querySelector('[name="removeImage"]');
        const removeButton = preview?.querySelector("[data-outfit-remove-image]");
        const status = preview?.querySelector("[data-outfit-image-status]");
        if (removeField) removeField.value = "";
        preview?.classList.remove("is-pending-delete");
        if (removeButton) {
          removeButton.disabled = false;
          removeButton.setAttribute("aria-pressed", "false");
        }
        if (status) status.textContent = "已取消删除，当前图片会保留";
        return;
      }
      if (button.matches("[data-outfit-close]")) closeEditor();
      if (button.dataset.outfitEdit) openEditor(button.dataset.outfitEdit);
      if (button.dataset.outfitClear && confirm("清空这一天的服装搭配？")) {
        delete outfits[button.dataset.outfitClear];
        save();
        render();
      }
    });
    document.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-outfit-form]")) return;
      event.preventDefault();
      void submit(event.target);
    });
  }

  document.addEventListener("DOMContentLoaded", setup);
  document.addEventListener("travel-data-ready", (event) => {
    trip = event.detail;
    load();
    render();
  });
  window.addEventListener("travel-weather-ready", (event) => {
    weather = event.detail || { byDate: {} };
    render();
  });
})();
