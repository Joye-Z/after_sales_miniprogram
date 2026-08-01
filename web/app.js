const appRoot = document.getElementById("app");
const storageKeys = {
  token: "aftersales_token",
  role: "aftersales_role",
  user: "aftersales_user",
};

const state = {
  token: localStorage.getItem(storageKeys.token) || "",
  role: localStorage.getItem(storageKeys.role) || "",
  user: loadJson(storageKeys.user, null),
  engineers: [],
  orders: [],
  taskOrders: [],
  historyOrders: [],
  profile: null,
  modalOrderId: null,
  pending: false,
  error: "",
  orderStats: {},
};

const faultTypes = ["机械故障", "电气控制故障", "液压/气动泄漏", "软件/程序异常", "其他故障"];
const paidanTabs = [
  { key: "create", label: "新建工单" },
  { key: "orders", label: "工单列表" },
  { key: "engineers", label: "工程师" },
  { key: "mine", label: "我的" },
];
const engineerTabs = [
  { key: "tasks", label: "待处理" },
  { key: "working", label: "维修上报" },
  { key: "history", label: "历史记录" },
  { key: "mine", label: "我的" },
];
const demoAccounts = [
  { role: "paidan", username: "PD001", password: "123456", label: "派单员" },
  { role: "engineer", username: "SH001", password: "123456", label: "工程师" },
];

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveSession(payload) {
  localStorage.setItem(storageKeys.token, payload.access_token);
  localStorage.setItem(storageKeys.role, payload.role);
  localStorage.setItem(storageKeys.user, JSON.stringify(payload.user));
  state.token = payload.access_token;
  state.role = payload.role;
  state.user = payload.user;
  state.pending = false;
}

function clearSession() {
  Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
  state.token = "";
  state.role = "";
  state.user = null;
  state.engineers = [];
  state.orders = [];
  state.taskOrders = [];
  state.historyOrders = [];
  state.profile = null;
  state.modalOrderId = null;
  state.pending = false;
  setHash("login");
}

function getHashRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return raw || "login";
}

function setHash(route) {
  const target = `#/${route}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    render();
  }
}

function getApiBase() {
  if (window.AFTERSALES_API_BASE) return window.AFTERSALES_API_BASE;
  return window.location.origin;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const response = await fetch(`${getApiBase()}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    clearSession();
    throw new Error("登录已失效，请重新登录");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || "请求失败");
  }
  return payload;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function currentDateTime() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function durationText(minutes) {
  if (!minutes && minutes !== 0) return "-";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}小时${rest ? `${rest}分钟` : ""}`;
  }
  return `${minutes}分钟`;
}

function statusMeta(status) {
  return {
    pending: { text: "待处理", className: "pending" },
    assigned: { text: "已指派", className: "processing" },
    processing: { text: "处理中", className: "processing" },
    done: { text: "已完成", className: "done" },
  }[status] || { text: status, className: "processing" };
}

function normalizeImage(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `${getApiBase()}${url}`;
}

function getActiveTab() {
  const route = getHashRoute();
  if (!state.role) return "login";
  if (route === "login") return state.role === "paidan" ? "create" : "tasks";
  return route;
}

function getModalOrder() {
  return [...state.orders, ...state.taskOrders, ...state.historyOrders].find((item) => item.id === state.modalOrderId) || null;
}

async function refreshData() {
  if (!state.token || !state.role) return;
  if (state.role === "paidan") {
    const [ordersData, engineers] = await Promise.all([api("/workorders"), api("/engineers")]);
    state.orders = ordersData.items || [];
    state.orderStats = ordersData.stats || {};
    state.engineers = engineers || [];
  } else {
    const [tasks, history, profile] = await Promise.all([
      api("/workorders/me/tasks"),
      api("/workorders/me/history"),
      api("/engineers/me/profile").catch(() => state.user),
    ]);
    state.taskOrders = tasks || [];
    state.historyOrders = history || [];
    state.profile = profile || state.user;
  }
}

function render() {
  if (!state.token || !state.role) {
    appRoot.innerHTML = renderLogin();
    bindLoginEvents();
    return;
  }
  const activeTab = getActiveTab();
  const content = state.role === "paidan" ? renderPaidan(activeTab) : renderEngineer(activeTab);
  appRoot.innerHTML = `${content}${renderOrderModal()}`;
  bindAppEvents();
}

function renderLogin() {
  return `
    <div class="login-shell">
      <div class="login-card">
        <div class="login-brand">
          <div class="eyebrow">After-sales Service</div>
          <h1>售后服务 Web 主体</h1>
          <p class="subtle">浏览器和小程序共用一套页面能力，小程序只负责作为 web-view 壳承载入口。</p>
        </div>
        <form id="login-form">
          <div class="role-switch">
            <button class="chip active" type="button" data-role-switch="paidan">派单员</button>
            <button class="chip" type="button" data-role-switch="engineer">工程师</button>
          </div>
          <input type="hidden" name="role" value="paidan">
          <div class="field">
            <label>账号</label>
            <input name="username" placeholder="输入登录账号" value="PD001">
          </div>
          <div class="field">
            <label>密码</label>
            <input name="password" type="password" placeholder="输入密码" value="123456">
          </div>
          <button class="primary-btn" type="submit">${state.pending ? "登录中..." : "登录并进入系统"}</button>
          <p class="helper">演示账号：${demoAccounts.map((item) => `${item.label} ${item.username}/${item.password}`).join("；")}</p>
          ${state.error ? `<div class="error-box">${escapeHtml(state.error)}</div>` : ""}
        </form>
      </div>
    </div>
  `;
}

function renderPaidan(activeTab) {
  const stats = state.orderStats || {};
  return `
    <div class="shell">
      ${renderTopbar("售后服务平台", state.user?.name || state.user?.username || "派单员")}
      <section class="hero">
        <div>
          <div class="eyebrow">Dispatch Center</div>
          <h1>工单派发、履约追踪、人员管理合并到同一个 Web 主体</h1>
          <p class="subtle">参考 CRM 小程序的形态，小程序端不再承载原生业务页面，而是只保留入口壳层。</p>
        </div>
        <div class="hero-side">
          <div class="action-card">
            <strong>当前未完工工单</strong>
            <div class="stat-value">${stats.pending || 0}</div>
            <p>状态覆盖待处理、已指派、处理中。</p>
          </div>
        </div>
      </section>
      <section class="section grid-3">
        ${renderStatCard("待处理工单", stats.pending || 0)}
        ${renderStatCard("累计完成", stats.completed || 0)}
        ${renderStatCard("本月完成", stats.completed_this_month || 0)}
      </section>
      ${renderPaidanPage(activeTab)}
      ${renderNav(paidanTabs, activeTab)}
    </div>
  `;
}

function renderEngineer(activeTab) {
  return `
    <div class="shell">
      ${renderTopbar("工程师工作台", state.profile?.name || state.user?.name || "工程师")}
      <section class="hero">
        <div>
          <div class="eyebrow">Field Service</div>
          <h1>任务接收、维修上报、历史归档统一在线流转</h1>
          <p class="subtle">工程师在浏览器或小程序里看到的是同一套交互，不再维护双份页面。</p>
        </div>
        <div class="hero-side">
          <div class="action-card">
            <strong>当前待处理任务</strong>
            <div class="stat-value">${state.taskOrders.length}</div>
            <p>点击任务即可打开详情或直接上报维修记录。</p>
          </div>
        </div>
      </section>
      <section class="section grid-3">
        ${renderStatCard("待处理", state.taskOrders.length)}
        ${renderStatCard("历史完成", state.historyOrders.length)}
        ${renderStatCard("最近完工时长", durationText(state.historyOrders[0]?.duration || 0))}
      </section>
      ${renderEngineerPage(activeTab)}
      ${renderNav(engineerTabs, activeTab)}
    </div>
  `;
}

function renderTopbar(title, userName) {
  return `
    <div class="topbar">
      <div>
        <div class="brand">${title}</div>
        <div class="subtle">统一入口：Web 应用 + 微信小程序壳</div>
      </div>
      <div class="topbar-meta">
        <span class="mini-tag">${escapeHtml(state.role === "paidan" ? "派单员" : "工程师")}</span>
        <span class="mini-tag">${escapeHtml(userName)}</span>
        <button class="ghost-btn" type="button" data-action="logout">退出登录</button>
      </div>
    </div>
  `;
}

function renderStatCard(label, value) {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function renderPaidanPage(activeTab) {
  if (activeTab === "orders") return renderOrdersSection(state.orders, true);
  if (activeTab === "engineers") return renderEngineersSection();
  if (activeTab === "mine") return renderPaidanMine();
  return renderCreateSection();
}

function renderEngineerPage(activeTab) {
  if (activeTab === "working") return renderWorkingSection();
  if (activeTab === "history") return renderHistorySection();
  if (activeTab === "mine") return renderEngineerMine();
  return renderTasksSection();
}

function renderCreateSection() {
  const engineerOptions = state.engineers
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} - ${escapeHtml(item.department || "")}</option>`)
    .join("");
  return `
    <section class="section">
      <div class="section-title"><h2>创建并派发工单</h2></div>
      <div class="form-card">
        <form id="create-order-form" class="form-grid">
          ${renderInput("customer_name", "客户名称")}
          ${renderInput("device_name", "设备名称")}
          ${renderInput("sn_code", "设备 SN")}
          ${renderInput("address", "服务地址")}
          <div class="field">
            <label>故障类型</label>
            <select name="fault_type">${faultTypes.map((item) => `<option value="${item}">${escapeHtml(item)}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label>指派工程师</label>
            <select name="engineer_id">${engineerOptions}</select>
          </div>
          <div class="field form-span-2">
            <label>故障描述</label>
            <textarea name="fault_desc" placeholder="输入故障现象、客户诉求、现场背景"></textarea>
          </div>
          <div class="form-actions form-span-2">
            <button class="primary-btn" type="submit">创建工单</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderOrdersSection(orders, includeHeader) {
  const rows = orders.length
    ? orders.map((order) => {
        const meta = statusMeta(order.status);
        return `
          <div class="table-row clickable" data-order-id="${order.id}">
            <div><strong>${escapeHtml(order.order_no)}</strong><div class="subtle">${escapeHtml(order.customer_name)}</div></div>
            <div>${escapeHtml(order.device_name)}</div>
            <div>${escapeHtml(order.engineer_name || "-")}</div>
            <div><span class="badge ${meta.className}">${meta.text}</span></div>
            <div>${formatDate(order.created_at)}</div>
          </div>
        `;
      }).join("")
    : `<div class="empty">暂无工单</div>`;
  return `
    <section class="section">
      ${includeHeader ? `<div class="section-title"><h2>工单总览</h2></div>` : ""}
      <div class="table-card">
        <div class="table-head">
          <span>工单</span>
          <span>设备</span>
          <span>工程师</span>
          <span>状态</span>
          <span>创建时间</span>
        </div>
        ${rows}
      </div>
    </section>
  `;
}

function renderEngineersSection() {
  const rows = state.engineers.length
    ? state.engineers.map((engineer) => `
        <div class="record-card">
          <div class="record-title">
            <strong>${escapeHtml(engineer.name)}</strong>
            <div class="form-actions">
              <button class="secondary-btn" type="button" data-edit-engineer="${engineer.id}">编辑</button>
              <button class="danger-btn" type="button" data-delete-engineer="${engineer.id}">删除</button>
            </div>
          </div>
          <div class="tile-meta">${escapeHtml(engineer.department || "-")} / ${escapeHtml(engineer.specialty || "未填写专长")}</div>
          <div class="helper">手机号：${escapeHtml(engineer.phone || "-")}｜登录账号：${escapeHtml(engineer.login_username || "自动生成")}</div>
        </div>
      `).join("")
    : `<div class="empty">暂无工程师</div>`;
  return `
    <section class="section">
      <div class="section-title"><h2>工程师管理</h2></div>
      <div class="grid-2">
        <div class="table-card">${rows}</div>
        <div class="form-card">
          <form id="engineer-form" class="form-grid">
            <input type="hidden" name="engineer_id" value="">
            ${renderInput("name", "姓名")}
            ${renderInput("phone", "手机号")}
            ${renderInput("department", "部门")}
            ${renderInput("specialty", "专长")}
            <div class="form-actions form-span-2">
              <button class="primary-btn" type="submit">保存工程师</button>
              <button class="ghost-btn" type="button" data-action="reset-engineer-form">清空</button>
            </div>
          </form>
          <p class="helper">新增工程师时后端会自动生成登录账号和默认密码。</p>
        </div>
      </div>
    </section>
  `;
}

function renderPaidanMine() {
  return `
    <section class="section">
      <div class="section-title"><h2>账号信息</h2></div>
      <div class="grid-2">
        <div class="meta-box"><strong>姓名</strong>${escapeHtml(state.user?.name || "-")}</div>
        <div class="meta-box"><strong>账号</strong>${escapeHtml(state.user?.username || "-")}</div>
        <div class="meta-box"><strong>角色</strong>派单员</div>
        <div class="meta-box"><strong>电话</strong>${escapeHtml(state.user?.phone || "-")}</div>
      </div>
    </section>
  `;
}

function renderTasksSection() {
  const rows = state.taskOrders.length
    ? state.taskOrders.map((order) => `
        <div class="tile">
          <div class="record-title">
            <strong>${escapeHtml(order.order_no)}</strong>
            <span class="badge ${statusMeta(order.status).className}">${statusMeta(order.status).text}</span>
          </div>
          <div class="tile-title">${escapeHtml(order.customer_name)} / ${escapeHtml(order.device_name)}</div>
          <div class="tile-meta">${escapeHtml(order.address || "未填写服务地址")}</div>
          <div class="helper">故障：${escapeHtml(order.fault_type)}｜${escapeHtml(order.fault_desc)}</div>
          <div class="form-actions">
            <button class="secondary-btn" type="button" data-order-id="${order.id}">查看详情</button>
            <button class="primary-btn" type="button" data-open-working="${order.id}">填写维修记录</button>
          </div>
        </div>
      `).join("")
    : `<div class="empty">当前没有待处理任务</div>`;
  return `<section class="section"><div class="section-title"><h2>待处理任务</h2></div><div class="grid-2">${rows}</div></section>`;
}

function renderWorkingSection() {
  const options = state.taskOrders
    .map((order) => `<option value="${order.id}">${escapeHtml(order.order_no)} - ${escapeHtml(order.customer_name)}</option>`)
    .join("");
  return `
    <section class="section">
      <div class="section-title"><h2>维修记录提交</h2></div>
      <div class="grid-2">
        <div class="table-card">
          <p class="subtle">选择任务后提交开始/结束时间、现场分析和图片，后端会把这次维修记录归档到工单详情中。</p>
          ${renderOrdersSection(state.taskOrders, false)}
        </div>
        <div class="form-card">
          <form id="work-record-form" class="form-grid">
            <div class="field form-span-2">
              <label>任务</label>
              <select name="order_id">${options}</select>
            </div>
            ${renderInput("check_in_location", "签到位置")}
            ${renderInput("start_time", "开始时间", currentDateTime())}
            ${renderInput("end_time", "结束时间", currentDateTime())}
            <div class="field form-span-2">
              <label>维修分析</label>
              <textarea name="analysis" placeholder="输入故障分析、维修动作、结果确认"></textarea>
            </div>
            <div class="field form-span-2">
              <label>现场图片</label>
              <input type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple>
            </div>
            <div class="form-actions form-span-2">
              <button class="primary-btn" type="submit">提交记录</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `;
}

function renderHistorySection() {
  const rows = state.historyOrders.length
    ? state.historyOrders.map((order) => `
        <div class="record-card">
          <div class="record-title">
            <strong>${escapeHtml(order.order_no)}</strong>
            <span class="badge done">已完成</span>
          </div>
          <div class="tile-meta">${escapeHtml(order.customer_name)} / ${escapeHtml(order.device_name)}</div>
          <div class="helper">维修时长：${escapeHtml(durationText(order.duration || 0))}｜完成时间：${formatDate(order.updated_at)}</div>
          <div class="form-actions">
            <button class="secondary-btn" type="button" data-order-id="${order.id}">查看详情</button>
          </div>
        </div>
      `).join("")
    : `<div class="empty">暂无历史记录</div>`;
  return `<section class="section"><div class="section-title"><h2>历史完成工单</h2></div><div class="table-card">${rows}</div></section>`;
}

function renderEngineerMine() {
  const profile = state.profile || {};
  return `
    <section class="section">
      <div class="section-title"><h2>个人信息</h2></div>
      <div class="grid-2">
        <div class="meta-box"><strong>姓名</strong>${escapeHtml(profile.name || "-")}</div>
        <div class="meta-box"><strong>账号</strong>${escapeHtml(profile.login_username || state.user?.username || "-")}</div>
        <div class="meta-box"><strong>电话</strong>${escapeHtml(profile.phone || "-")}</div>
        <div class="meta-box"><strong>部门</strong>${escapeHtml(profile.department || "-")}</div>
        <div class="meta-box"><strong>专长</strong>${escapeHtml(profile.specialty || "-")}</div>
        <div class="meta-box"><strong>状态</strong>${escapeHtml(profile.status || "active")}</div>
      </div>
    </section>
  `;
}

function renderNav(tabs, activeTab) {
  return `
    <nav class="bottom-nav">
      ${tabs.map((tab) => `
        <button class="nav-item ${tab.key === activeTab ? "active" : ""}" type="button" data-nav="${tab.key}">
          ${escapeHtml(tab.label)}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderOrderModal() {
  const order = getModalOrder();
  if (!order) return "";
  const meta = statusMeta(order.status);
  const records = order.records || [];
  const images = records.flatMap((record) => (record.images || []).map(normalizeImage));
  return `
    <div class="modal" data-close-modal="true">
      <div class="modal-card">
        <div class="modal-head">
          <h3>${escapeHtml(order.order_no)} / ${escapeHtml(order.customer_name)}</h3>
          <button class="ghost-btn" type="button" data-action="close-modal">关闭</button>
        </div>
        <div class="modal-grid">
          <div class="meta-box"><strong>设备</strong>${escapeHtml(order.device_name)}</div>
          <div class="meta-box"><strong>状态</strong><span class="badge ${meta.className}">${meta.text}</span></div>
          <div class="meta-box"><strong>工程师</strong>${escapeHtml(order.engineer_name || "-")}</div>
          <div class="meta-box"><strong>地址</strong>${escapeHtml(order.address || "-")}</div>
          <div class="meta-box"><strong>故障类型</strong>${escapeHtml(order.fault_type || "-")}</div>
          <div class="meta-box"><strong>维修时长</strong>${escapeHtml(durationText(order.duration || 0))}</div>
        </div>
        <div class="timeline-card">
          <div class="section-title"><h2>维修记录</h2></div>
          <div class="timeline">
            <div class="timeline-item">
              <div class="timeline-dot done"></div>
              <div class="timeline-content">
                <strong>工单创建</strong>
                <div class="subtle">${formatDate(order.created_at)}</div>
                <div>${escapeHtml(order.fault_desc || "-")}</div>
              </div>
            </div>
            ${records.length ? records.map((record) => `
              <div class="timeline-item">
                <div class="timeline-dot ${order.status === "done" ? "done" : "active"}"></div>
                <div class="timeline-content">
                  <strong>${escapeHtml(record.start_time || "-")} 至 ${escapeHtml(record.end_time || "-")}</strong>
                  <div class="subtle">${escapeHtml(record.check_in_location || "未填写签到位置")}</div>
                  <div>${escapeHtml(record.analysis || "-")}</div>
                </div>
              </div>
            `).join("") : `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">暂无维修记录</div>
              </div>
            `}
          </div>
        </div>
        ${images.length ? `<div class="section"><div class="section-title"><h2>现场图片</h2></div><div class="photo-grid">${images.map((src) => `<img src="${src}" alt="现场图片">`).join("")}</div></div>` : ""}
      </div>
    </div>
  `;
}

function renderInput(name, label, value = "") {
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <input name="${name}" value="${escapeHtml(value)}" placeholder="请输入${escapeHtml(label)}">
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bindLoginEvents() {
  const form = document.getElementById("login-form");
  const buttons = Array.from(document.querySelectorAll("[data-role-switch]"));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      form.role.value = button.dataset.roleSwitch;
      const account = demoAccounts.find((item) => item.role === button.dataset.roleSwitch);
      if (account) {
        form.username.value = account.username;
        form.password.value = account.password;
      }
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.pending = true;
    state.error = "";
    render();
    try {
      const payload = await api("/auth/login", {
        method: "POST",
        body: {
          username: form.username.value.trim(),
          password: form.password.value,
          role: form.role.value,
        },
      });
      saveSession(payload);
      await refreshData();
      setHash(payload.role === "paidan" ? "create" : "tasks");
    } catch (error) {
      state.error = error.message;
      state.pending = false;
      render();
    }
  });
}

function bindAppEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => setHash(button.dataset.nav));
  });
  document.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modalOrderId = Number(button.dataset.orderId);
      render();
    });
  });
  document.querySelectorAll("[data-open-working]").forEach((button) => {
    button.addEventListener("click", () => {
      setHash("working");
      setTimeout(() => {
        const select = document.querySelector('select[name="order_id"]');
        if (select) select.value = button.dataset.openWorking;
      }, 0);
    });
  });
  document.querySelectorAll("[data-edit-engineer]").forEach((button) => {
    button.addEventListener("click", () => fillEngineerForm(Number(button.dataset.editEngineer)));
  });
  document.querySelectorAll("[data-delete-engineer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("确认删除该工程师及其登录账号？")) return;
      try {
        await api(`/engineers/${button.dataset.deleteEngineer}`, { method: "DELETE" });
        await refreshData();
        render();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener("click", clearSession);
  });
  document.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.modalOrderId = null;
      render();
    });
  });
  document.querySelectorAll('[data-close-modal="true"]').forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        state.modalOrderId = null;
        render();
      }
    });
  });
  document.querySelectorAll('[data-action="reset-engineer-form"]').forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.getElementById("engineer-form");
      if (form) form.reset();
    });
  });

  const createOrderForm = document.getElementById("create-order-form");
  if (createOrderForm) {
    createOrderForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createOrderForm);
      try {
        await api("/workorders", {
          method: "POST",
          body: {
            customer_name: formData.get("customer_name"),
            device_name: formData.get("device_name"),
            sn_code: formData.get("sn_code"),
            address: formData.get("address"),
            fault_type: formData.get("fault_type"),
            fault_desc: formData.get("fault_desc"),
            engineer_id: Number(formData.get("engineer_id")),
          },
        });
        createOrderForm.reset();
        await refreshData();
        setHash("orders");
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const engineerForm = document.getElementById("engineer-form");
  if (engineerForm) {
    engineerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(engineerForm);
      const payload = {
        name: formData.get("name"),
        phone: formData.get("phone"),
        department: formData.get("department"),
        specialty: formData.get("specialty"),
      };
      try {
        if (formData.get("engineer_id")) {
          await api(`/engineers/${formData.get("engineer_id")}`, { method: "PUT", body: payload });
        } else {
          await api("/engineers", { method: "POST", body: payload });
        }
        engineerForm.reset();
        await refreshData();
        render();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  const workRecordForm = document.getElementById("work-record-form");
  if (workRecordForm) {
    workRecordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(workRecordForm);
      try {
        const imageUrls = [];
        const files = Array.from(workRecordForm.images.files || []);
        for (const file of files) {
          const uploadForm = new FormData();
          uploadForm.append("file", file);
          const uploaded = await api("/api/upload", { method: "POST", body: uploadForm });
          imageUrls.push(uploaded.url);
        }
        await api(`/workorders/${Number(formData.get("order_id"))}/records`, {
          method: "POST",
          body: {
            check_in_location: formData.get("check_in_location"),
            start_time: formData.get("start_time"),
            end_time: formData.get("end_time"),
            analysis: formData.get("analysis"),
            images: imageUrls,
          },
        });
        await refreshData();
        setHash("history");
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

function fillEngineerForm(engineerId) {
  const engineer = state.engineers.find((item) => item.id === engineerId);
  const form = document.getElementById("engineer-form");
  if (!engineer || !form) return;
  form.engineer_id.value = engineer.id;
  form.name.value = engineer.name || "";
  form.phone.value = engineer.phone || "";
  form.department.value = engineer.department || "";
  form.specialty.value = engineer.specialty || "";
}

window.addEventListener("hashchange", render);

async function bootstrap() {
  if (state.token && state.role) {
    try {
      await refreshData();
    } catch (error) {
      state.error = error.message;
    }
  }
  render();
}

bootstrap();
