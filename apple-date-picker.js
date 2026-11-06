(() => {
  "use strict";

  let dialog = null;
  let activeInput = null;
  let selected = null;
  let visibleMonth = null;

  const pad = (value) => String(value).padStart(2, "0");
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const monthTitle = (date) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(date);

  function parseValue(value, kind) {
    if (kind === "time") {
      const timeMatch = String(value || "").match(/^(\d{2}):(\d{2})$/);
      if (!timeMatch) return null;
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      if (hours > 23 || minutes > 59) return null;
      const parsedTime = new Date();
      parsedTime.setHours(hours, minutes, 0, 0);
      parsedTime.kind = kind;
      return parsedTime;
    }
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!match) return null;
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0));
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.kind = kind;
    return parsed;
  }

  function rawValue(date, kind) {
    if (kind === "time") return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const base = dateKey(date);
    return kind === "datetime-local" ? `${base}T${pad(date.getHours())}:${pad(date.getMinutes())}` : base;
  }

  function displayValue(value, kind) {
    const parsed = parseValue(value, kind);
    if (!parsed) return kind === "datetime-local" ? "选择日期与时间" : kind === "time" ? "选择时间" : "选择日期";
    if (kind === "time") return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
    return new Intl.DateTimeFormat("zh-CN", kind === "datetime-local"
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(parsed).replace(/\//g, " / ");
  }

  function ensureDialog() {
    if (dialog) return;
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="apple-date-picker" id="apple-date-picker-dialog" aria-labelledby="apple-date-picker-title">
        <div class="apple-date-picker__card">
          <header>
            <div><span>CALENDAR</span><h2 id="apple-date-picker-title">选择日期</h2></div>
            <button type="button" data-apple-date-cancel aria-label="关闭日期选择器">关闭</button>
          </header>
          <div class="apple-date-picker__body"></div>
          <footer><button type="button" data-apple-date-today>今天</button><span></span><button type="button" data-apple-date-cancel>取消</button><button class="apple-date-picker__done" type="button" data-apple-date-save>完成</button></footer>
        </div>
      </dialog>
    `);
    dialog = document.querySelector("#apple-date-picker-dialog");
    dialog.addEventListener("click", handleDialogClick);
    dialog.addEventListener("cancel", () => { activeInput = null; });
  }

  function dayButton(date, currentMonth) {
    const key = dateKey(date);
    const today = key === dateKey(new Date());
    const chosen = selected && key === dateKey(selected);
    const otherMonth = date.getMonth() !== currentMonth;
    return `<button type="button" data-apple-date-day="${key}" aria-pressed="${Boolean(chosen)}" class="${today ? "is-today " : ""}${otherMonth ? "is-outside" : ""}" aria-label="${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日">${date.getDate()}</button>`;
  }

  function timeWheel(part, maximum, current, unit) {
    return `<div class="apple-date-picker__time-wheel" role="listbox" aria-label="${unit}">
      ${Array.from({ length: maximum + 1 }, (_, value) => `<button type="button" role="option" data-apple-time-part="${part}" data-apple-time-value="${value}" aria-selected="${value === current}">${pad(value)}<small>${unit}</small></button>`).join("")}
    </div>`;
  }

  function render() {
    if (!activeInput) return;
    const kind = activeInput.dataset.appleDateKind;
    const hasCalendar = kind !== "time";
    if (hasCalendar && !visibleMonth) return;
    const year = hasCalendar ? visibleMonth.getFullYear() : 0;
    const month = hasCalendar ? visibleMonth.getMonth() : 0;
    const calendar = hasCalendar ? (() => {
      const gridStart = new Date(year, month, 1 - new Date(year, month, 1).getDay());
      const days = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);
        return dayButton(date, month);
      }).join("");
      return `
        <nav class="apple-date-picker__month-nav" aria-label="切换月份">
          <button type="button" data-apple-date-prev aria-label="上个月">‹</button>
          <strong>${monthTitle(visibleMonth)}</strong>
          <button type="button" data-apple-date-next aria-label="下个月">›</button>
        </nav>
        <div class="apple-date-picker__weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
        <div class="apple-date-picker__days">${days}</div>`;
    })() : "";
    const time = kind === "datetime-local" || kind === "time" ? `
      <section class="apple-date-picker__time" aria-label="选择时间">
        <div><span>时间</span><strong>${pad(selected.getHours())}:${pad(selected.getMinutes())}</strong></div>
        <div class="apple-date-picker__time-wheels">
          ${timeWheel("hours", 23, selected.getHours(), "时")}
          ${timeWheel("minutes", 59, selected.getMinutes(), "分")}
        </div>
      </section>` : "";
    dialog.querySelector("#apple-date-picker-title").textContent = kind === "datetime-local" ? "选择日期与时间" : kind === "time" ? "选择时间" : "选择日期";
    dialog.querySelector("[data-apple-date-today]").textContent = kind === "time" ? "现在" : "今天";
    dialog.classList.toggle("is-time-only", kind === "time");
    dialog.querySelector(".apple-date-picker__body").innerHTML = `
      ${calendar}
      ${time}
    `;
  }

  function scrollSelectedTime() {
    requestAnimationFrame(() => dialog.querySelectorAll('.apple-date-picker__time-wheel [aria-selected="true"]').forEach((button) => {
      const wheel = button.closest(".apple-date-picker__time-wheel");
      if (wheel) wheel.scrollTop += button.getBoundingClientRect().top - wheel.getBoundingClientRect().top - wheel.clientHeight / 2 + button.offsetHeight / 2;
    }));
  }

  function openPicker(input) {
    ensureDialog();
    activeInput = input;
    const kind = input.dataset.appleDateKind;
    selected = parseValue(input.value, kind) || new Date();
    if (kind === "date") selected.setHours(12, 0, 0, 0);
    visibleMonth = kind === "time" ? null : new Date(selected.getFullYear(), selected.getMonth(), 1);
    render();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    scrollSelectedTime();
  }

  function closePicker() {
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
    activeInput = null;
  }

  function chooseTime(button) {
    const value = Number(button.dataset.appleTimeValue || 0);
    if (button.dataset.appleTimePart === "hours") selected.setHours(value);
    else selected.setMinutes(value);
    const wheel = button.closest(".apple-date-picker__time-wheel");
    wheel.querySelectorAll("[data-apple-time-part]").forEach((option) => option.setAttribute("aria-selected", String(option === button)));
    const summary = dialog.querySelector(".apple-date-picker__time strong");
    if (summary) summary.textContent = `${pad(selected.getHours())}:${pad(selected.getMinutes())}`;
  }

  function handleDialogClick(event) {
    const button = event.target.closest("button");
    if (!button) {
      if (event.target === dialog) closePicker();
      return;
    }
    if (button.matches("[data-apple-date-cancel]")) return closePicker();
    if (button.matches("[data-apple-date-prev]")) {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
      render();
      return;
    }
    if (button.matches("[data-apple-date-next]")) {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
      render();
      return;
    }
    if (button.dataset.appleDateDay) {
      const [year, month, day] = button.dataset.appleDateDay.split("-").map(Number);
      selected.setFullYear(year, month - 1, day);
      visibleMonth = new Date(year, month - 1, 1);
      render();
      scrollSelectedTime();
      return;
    }
    if (button.matches("[data-apple-time-part]")) return chooseTime(button);
    if (button.matches("[data-apple-date-today]")) {
      const now = new Date();
      selected.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
      if (["datetime-local", "time"].includes(activeInput.dataset.appleDateKind)) selected.setHours(now.getHours(), now.getMinutes());
      visibleMonth = activeInput.dataset.appleDateKind === "time" ? null : new Date(now.getFullYear(), now.getMonth(), 1);
      render();
      scrollSelectedTime();
      return;
    }
    if (button.matches("[data-apple-date-save]")) {
      activeInput.value = rawValue(selected, activeInput.dataset.appleDateKind);
      const trigger = activeInput.parentElement.querySelector("[data-apple-date-open]");
      if (trigger) trigger.querySelector("span").textContent = displayValue(activeInput.value, activeInput.dataset.appleDateKind);
      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
      activeInput.dispatchEvent(new Event("change", { bubbles: true }));
      closePicker();
    }
  }

  function enhance(input) {
    if (input.dataset.appleDateEnhanced) return;
    const kind = input.type;
    if (!new Set(["date", "time", "datetime-local"]).has(kind)) return;
    input.dataset.appleDateEnhanced = "true";
    input.dataset.appleDateKind = kind;
    const wrapper = document.createElement("span");
    wrapper.className = "apple-date-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input);
    input.type = "hidden";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "apple-date-field__trigger";
    trigger.dataset.appleDateOpen = "";
    trigger.dataset.appleDateKind = kind;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-controls", "apple-date-picker-dialog");
    trigger.innerHTML = `<span>${displayValue(input.value, kind)}</span><i aria-hidden="true"></i>`;
    trigger.addEventListener("click", () => openPicker(input));
    wrapper.append(trigger);
  }

  function scan(root = document) {
    root.querySelectorAll?.('input[type="date"], input[type="time"], input[type="datetime-local"]').forEach(enhance);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureDialog();
    scan();
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.('input[type="date"], input[type="time"], input[type="datetime-local"]')) enhance(node);
      scan(node);
    }))).observe(document.body, { childList: true, subtree: true });
  });
})();
