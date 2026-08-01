const root = document.getElementById("app");

const KEYS = {
  token: "aftersales_token",
  role: "aftersales_role",
  user: "aftersales_user",
};

const state = {
  token: localStorage.getItem(KEYS.token) || "",
  role: localStorage.getItem(KEYS.role) || "",
  user: readJson(KEYS.user, null),
  orders: [],
  orderStats: {},
  engineers: [],
  taskOrders: [],
  historyOrders: [],
  profile: null,
  detailOrder: null,
  loginError: "",
  loading: false,
};

const faultTypes = ["机械故障", "电气控制故障", "液压/气动泄漏", "软件/程序异常", "其他故障"];
const paidanTabs = [
  { key: "create", text: "派单", icon: "create" },
  { key: "orders", text: "工单", icon: "orders" },
  { key: "engineers", text: "工程师", icon: "engineers" },
  { key: "mine", text: "我的", icon: "mine" },
];
const engineerTabs = [
  { key: "tasks", text: "任务", icon: "tasks" },
  { key: "working", text: "维修", icon: "working" },
  { key: "history", text: "历史", icon: "history" },
  { key: "mine", text: "我的", icon: "mine" },
];

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveSession(payload) {
  localStorage.setItem(KEYS.token, payload.access_token);
  localStorage.setItem(KEYS.role, payload.role);
  localStorage.setItem(KEYS.user, JSON.stringify(payload.user));
  state.token = payload.access_token;
  state.role = payload.role;
  state.user = payload.user;
}

function clearSession() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  state.token = "";
  state.role = "";
  state.user = null;
  state.orders = [];
  state.orderStats = {};
  state.engineers = [];
  state.taskOrders = [];
  state.historyOrders = [];
  state.profile = null;
  state.detailOrder = null;
  state.loginError = "";
  setRoute("login");
}

function apiBase() {
  return window.location.origin;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBase()}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 401) {
    clearSession();
    throw new Error("登录已失效");
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload.detail || payload.message || "请求失败");
  return payload;
}

function route() {
  return window.location.hash.replace(/^#\/?/, "") || "login";
}

function setRoute(value) {
  const target = `#/${value}`;
  if (window.location.hash !== target) {
    window.location.hash = target;
  } else {
    render();
  }
}

function currentTab() {
  const current = route();
  if (!state.role) return "login";
  if (current === "login") return state.role === "paidan" ? "create" : "tasks";
  return current;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusMeta(status) {
  return {
    pending: { text: "待处理", cls: "badge-pending" },
    assigned: { text: "已指派", cls: "badge-processing" },
    processing: { text: "处理中", cls: "badge-processing" },
    done: { text: "已完成", cls: "badge-done" },
  }[status] || { text: status, cls: "badge-processing" };
}

function formatTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nowLocalDateTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function durationText(minutes) {
  if (!minutes && minutes !== 0) return "-";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}小时${m ? `${m}分钟` : ""}`;
  }
  return `${minutes}分钟`;
}

function orderById(id) {
  return [...state.orders, ...state.taskOrders, ...state.historyOrders].find((item) => item.id === id) || null;
}

async function refreshAll() {
  if (!state.token || !state.role) return;
  if (state.role === "paidan") {
    const [orders, engineers] = await Promise.all([api("/workorders"), api("/engineers")]);
    state.orders = orders.items || [];
    state.orderStats = orders.stats || {};
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

function renderHeader(title, back = false) {
  return `
    <div class="mp-header">
      ${back ? `<button class="header-back" type="button" data-back="1">返回</button>` : `<span class="header-back placeholder"></span>`}
      <div class="header-title">${esc(title)}</div>
      <button class="header-logout" type="button" data-logout="1">退出</button>
    </div>
  `;
}

function renderBottomNav(items, active) {
  return `
    <div class="bottom-nav">
      ${items.map((item) => `
        <button class="nav-item ${item.key === active ? "active" : ""}" type="button" data-nav="${item.key}">
          <span class="nav-icon nav-icon-${esc(item.icon)}" aria-hidden="true"></span>
          <span class="nav-text">${esc(item.text)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderLogin() {
  return `
    <div class="login-container">
      <div class="login-form-wrap">
        <div class="login-brand">
          <div class="login-logo">售</div>
          <div class="login-title">售后服务平台</div>
          <div class="login-subtitle">一站式售后与维保服务系统</div>
        </div>
        <form id="login-form">
          <div class="role-selector">
            <button class="role-option active" type="button" data-role="paidan">派单</button>
            <button class="role-option" type="button" data-role="engineer">售后工程师</button>
          </div>
          <input type="hidden" name="role" value="paidan">
          <div class="input-group">
            <label class="input-label">账号 / 手机号</label>
            <div class="input-box">
              <input name="username" value="PD001" placeholder="请输入手机号/工号">
            </div>
          </div>
          <div class="input-group">
            <label class="input-label">登录密码</label>
            <div class="input-box">
              <input type="password" name="password" value="123456" placeholder="请输入密码">
            </div>
          </div>
          <button class="login-btn" type="submit">${state.loading ? "登录中" : "登录系统"}</button>
          ${state.loginError ? `<div class="error-box">${esc(state.loginError)}</div>` : ""}
        </form>
      </div>
      <div class="login-footer">© 2026 售后服务平台</div>
    </div>
  `;
}

function renderCreate() {
  return `
    ${renderHeader("创建与派发工单")}
    <div class="container has-bottom-nav">
      <div class="card">
        <div class="card-title">创建工单</div>
        <form id="create-order-form">
          <div class="form-group">
            <label class="form-label">报修企业 / 客户名称</label>
            <input class="form-input" name="customer_name" placeholder="请输入企业或客户名称">
          </div>
          <div class="form-group">
            <label class="form-label">报修设备名称</label>
            <input class="form-input" name="device_name" placeholder="例如：液压打包机">
          </div>
          <div class="form-group">
            <label class="form-label">设备序列号 / SN码（选填）</label>
            <input class="form-input" name="sn_code" placeholder="请输入设备铭牌上的SN编码">
          </div>
          <div class="form-group">
            <label class="form-label">服务地址</label>
            <input class="form-input" name="address" placeholder="如：上海市闵行区工业园X区X号厂房">
          </div>
          <div class="form-group">
            <label class="form-label">故障类型</label>
            <select class="form-select" name="fault_type">
              ${faultTypes.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">指派服务工程师</label>
            <select class="form-select" name="engineer_id">
              ${state.engineers.map((item) => `<option value="${item.id}">${esc(item.name)} - ${esc(item.department || "")}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">故障现象描述</label>
            <textarea class="form-textarea" name="fault_desc" placeholder="描述设备具体故障现象，如异响、报码、泄漏位置等"></textarea>
          </div>
          <button class="btn btn-success" type="submit">创建并派发工单</button>
        </form>
      </div>
      ${renderBottomNav(paidanTabs, "create")}
    </div>
  `;
}

function renderOrders() {
  return `
    ${renderHeader("工单看板")}
    <div class="container has-bottom-nav">
      <div class="grid-3">
        <div class="stat-box"><div class="stat-num stat-warn">${esc(state.orderStats.pending || 0)}</div><div class="stat-desc">待处理</div></div>
        <div class="stat-box"><div class="stat-num stat-primary">${esc(state.orderStats.completed || 0)}</div><div class="stat-desc">已完成</div></div>
        <div class="stat-box"><div class="stat-num stat-success">${esc(state.orderStats.completed_this_month || 0)}</div><div class="stat-desc">本月已完成</div></div>
      </div>
      <div class="card-title loose-title">全员工单列表</div>
      ${state.orders.length ? state.orders.map((item) => {
        const meta = statusMeta(item.status);
        return `
          <button class="card clickable-card as-block" type="button" data-detail="${item.id}">
            <div class="card-title">
              工单: ${esc(item.order_no)}
              <span class="badge ${meta.cls}">${esc(meta.text)}</span>
            </div>
            <div class="info-row"><span class="info-label">责任工程师</span><span class="info-val"><strong>${esc(item.engineer_name || "-")}</strong> (${esc(item.engineer_phone || "-")})</span></div>
            <div class="info-row"><span class="info-label">服务客户:</span><span class="info-val">${esc(item.customer_name)}</span></div>
            <div class="info-row"><span class="info-label">报修内容:</span><span class="info-val">${esc(item.fault_desc)}</span></div>
          </button>
        `;
      }).join("") : `<div class="empty-tip">暂无工单数据</div>`}
      ${renderBottomNav(paidanTabs, "orders")}
    </div>
  `;
}

function renderEngineers() {
  return `
    ${renderHeader("工程师管理")}
    <div class="container has-bottom-nav">
      <div class="card">
        <div class="card-title">新增 / 编辑工程师</div>
        <form id="engineer-form">
          <input type="hidden" name="engineer_id" value="">
          <div class="form-group"><label class="form-label">姓名</label><input class="form-input" name="name" placeholder="请输入工程师姓名"></div>
          <div class="form-group"><label class="form-label">手机号</label><input class="form-input" name="phone" placeholder="请输入手机号"></div>
          <div class="form-group"><label class="form-label">所属部门</label><input class="form-input" name="department" placeholder="请输入部门"></div>
          <div class="form-group"><label class="form-label">技术专长</label><input class="form-input" name="specialty" placeholder="请输入技术专长"></div>
          <button class="btn" type="submit">保存工程师</button>
        </form>
      </div>
      ${state.engineers.map((item) => `
        <div class="card">
          <div class="card-title">${esc(item.name)}</div>
          <div class="info-row"><span class="info-label">手机号:</span><span class="info-val">${esc(item.phone || "-")}</span></div>
          <div class="info-row"><span class="info-label">部门:</span><span class="info-val">${esc(item.department || "-")}</span></div>
          <div class="info-row"><span class="info-label">专长:</span><span class="info-val">${esc(item.specialty || "-")}</span></div>
          <div class="info-row"><span class="info-label">账号:</span><span class="info-val">${esc(item.login_username || "-")}</span></div>
          <div class="btn-row">
            <button class="btn btn-outline half-btn" type="button" data-edit-engineer="${item.id}">编辑</button>
            <button class="btn btn-danger half-btn" type="button" data-delete-engineer="${item.id}">删除</button>
          </div>
        </div>
      `).join("")}
      ${renderBottomNav(paidanTabs, "engineers")}
    </div>
  `;
}

function renderPaidanMine() {
  return `
    ${renderHeader("我的")}
    <div class="container has-bottom-nav">
      <div class="card">
        <div class="card-title">账号信息</div>
        <div class="info-row"><span class="info-label">姓名:</span><span class="info-val">${esc(state.user?.name || "-")}</span></div>
        <div class="info-row"><span class="info-label">账号:</span><span class="info-val">${esc(state.user?.username || "-")}</span></div>
        <div class="info-row"><span class="info-label">电话:</span><span class="info-val">${esc(state.user?.phone || "-")}</span></div>
        <div class="info-row"><span class="info-label">角色:</span><span class="info-val">派单员</span></div>
      </div>
      ${renderBottomNav(paidanTabs, "mine")}
    </div>
  `;
}

function renderTasks() {
  return `
    ${renderHeader("我的任务")}
    <div class="container has-bottom-nav">
      <div class="card blue-card">
        <div class="mini-white-text">今日待执行任务</div>
        <div class="big-white-text">${esc(state.taskOrders.length)} 单待处理</div>
      </div>
      ${state.taskOrders.length ? state.taskOrders.map((item) => `
        <button class="card clickable-card as-block" type="button" data-working="${item.id}">
          <div class="card-title">工单: ${esc(item.order_no)} <span class="badge badge-pending">待维修</span></div>
          <div class="info-row"><span class="info-label">客户名称:</span><span class="info-val">${esc(item.customer_name)}</span></div>
          <div class="info-row"><span class="info-label">服务地址:</span><span class="info-val">${esc(item.address || "-")}</span></div>
          <div class="info-row"><span class="info-label">报修问题:</span><span class="info-val">${esc(item.fault_desc)}</span></div>
        </button>
      `).join("") : `<div class="empty-tip">暂无待处理任务</div>`}
      ${renderBottomNav(engineerTabs, "tasks")}
    </div>
  `;
}

function renderWorking() {
  const selected = state.detailOrder || state.taskOrders[0] || {};
  const meta = statusMeta(selected.status || "pending");
  return `
    ${renderHeader("现场维修", true)}
    <div class="container">
      <div class="card">
        <div class="card-title"><span>工单: ${esc(selected.order_no || "...")}</span><span class="badge ${meta.cls}">${esc(meta.text)}</span></div>
        <div class="info-row"><span class="info-label">客户:</span><span class="info-val">${esc(selected.customer_name || "-")}</span></div>
        <div class="info-row"><span class="info-label">设备:</span><span class="info-val">${esc(selected.device_name || "-")}${selected.sn_code ? ` / SN: ${esc(selected.sn_code)}` : ""}</span></div>
        <div class="info-row"><span class="info-label">服务地址:</span><span class="info-val blue-text">${esc(selected.address || "未填写")}</span></div>
        <div class="info-row"><span class="info-label">故障类型:</span><span class="info-val">${esc(selected.fault_type || "-")}</span></div>
        <div class="info-row"><span class="info-label">故障描述:</span><span class="info-val">${esc(selected.fault_desc || "-")}</span></div>
      </div>
      <div class="card">
        <div class="card-title">现场维修打卡与记录</div>
        <form id="work-record-form">
          <input type="hidden" name="order_id" value="${esc(selected.id || "")}">
          <div class="form-group"><label class="form-label">维修开始时间</label><input class="form-input" name="start_time" value="${esc(nowLocalDateTime())}"></div>
          <div class="form-group"><label class="form-label">维修结束时间</label><input class="form-input" name="end_time" value="${esc(nowLocalDateTime())}"></div>
          <div class="form-group"><label class="form-label">签到位置</label><input class="form-input" name="check_in_location" placeholder="请输入现场位置"></div>
          <div class="form-group"><label class="form-label">故障原因分析与处理方案</label><textarea class="form-textarea" name="analysis" placeholder="填写现场排查出的具体故障原因及处理过程"></textarea></div>
          <div class="form-group"><label class="form-label">维修后运行凭证（照片）</label><input class="form-input file-input" type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple></div>
          <button class="btn btn-success" type="submit">提交维修记录</button>
        </form>
      </div>
    </div>
  `;
}

function renderHistory() {
  return `
    ${renderHeader("历史记录")}
    <div class="container has-bottom-nav">
      ${state.historyOrders.length ? state.historyOrders.map((item) => `
        <button class="card clickable-card as-block" type="button" data-detail="${item.id}">
          <div class="card-title">工单: ${esc(item.order_no)} <span class="badge badge-done">已完成</span></div>
          <div class="info-row"><span class="info-label">客户名称:</span><span class="info-val">${esc(item.customer_name)}</span></div>
          <div class="info-row"><span class="info-label">设备名称:</span><span class="info-val">${esc(item.device_name)}</span></div>
          <div class="info-row"><span class="info-label">维修时长:</span><span class="info-val">${esc(durationText(item.duration || 0))}</span></div>
        </button>
      `).join("") : `<div class="empty-tip">暂无历史记录</div>`}
      ${renderBottomNav(engineerTabs, "history")}
    </div>
  `;
}

function renderEngineerMine() {
  const p = state.profile || {};
  return `
    ${renderHeader("我的")}
    <div class="container has-bottom-nav">
      <div class="card">
        <div class="card-title">个人信息</div>
        <div class="info-row"><span class="info-label">姓名:</span><span class="info-val">${esc(p.name || "-")}</span></div>
        <div class="info-row"><span class="info-label">账号:</span><span class="info-val">${esc(p.login_username || state.user?.username || "-")}</span></div>
        <div class="info-row"><span class="info-label">电话:</span><span class="info-val">${esc(p.phone || "-")}</span></div>
        <div class="info-row"><span class="info-label">部门:</span><span class="info-val">${esc(p.department || "-")}</span></div>
        <div class="info-row"><span class="info-label">专长:</span><span class="info-val">${esc(p.specialty || "-")}</span></div>
      </div>
      ${renderBottomNav(engineerTabs, "mine")}
    </div>
  `;
}

function buildTimeline(order) {
  const items = [];
  items.push({ title: "提交报修申请", time: formatTime(order.created_at), desc: `${order.customer_name} 提交 ${order.device_name} 故障报修`, cls: "done" });
  items.push({ title: "派单确认", time: formatTime(order.created_at), desc: `指派给工程师 ${order.engineer_name || "-"}`, cls: "done" });
  (order.records || []).forEach((record, index) => {
    items.push({
      title: index === order.records.length - 1 && order.status === "done" ? "完工验收与确认" : "现场维修",
      time: record.end_time || record.start_time || "-",
      desc: record.analysis || "已提交维修记录",
      cls: order.status === "done" ? "done" : "active",
    });
  });
  if (!order.records?.length) {
    items.push({ title: "现场维修", time: "待开始", desc: "等待工程师到场", cls: "" });
  }
  return items;
}

function renderDetail() {
  const order = state.detailOrder;
  if (!order) return "";
  const images = (order.records || []).flatMap((record) => (record.images || []).map((src) => /^https?:\/\//.test(src) ? src : `${apiBase()}${src}`));
  const timeline = buildTimeline(order);
  return `
    ${renderHeader("工单详情", true)}
    <div class="container">
      <div class="card">
        <div class="card-title">工单信息</div>
        <div class="info-row"><span class="info-label">工单编号:</span><span class="info-val strong-text">${esc(order.order_no)}</span></div>
        <div class="info-row"><span class="info-label">工单状态:</span><span class="info-val blue-text strong-text">${esc(statusMeta(order.status).text)}</span></div>
        <div class="info-row"><span class="info-label">客户名称:</span><span class="info-val">${esc(order.customer_name)}</span></div>
        <div class="info-row"><span class="info-label">设备名称:</span><span class="info-val">${esc(order.device_name)}</span></div>
        <div class="info-row"><span class="info-label">SN码:</span><span class="info-val">${esc(order.sn_code || "-")}</span></div>
        <div class="info-row"><span class="info-label">故障类型:</span><span class="info-val">${esc(order.fault_type)}</span></div>
        <div class="info-row"><span class="info-label">故障描述:</span><span class="info-val">${esc(order.fault_desc)}</span></div>
        <div class="info-row"><span class="info-label">责任工程师:</span><span class="info-val">${esc(order.engineer_name || "-")} ${esc(order.engineer_phone || "")}</span></div>
      </div>
      <div class="card">
        <div class="card-title">维修进度</div>
        <div class="timeline">
          ${timeline.map((item) => `
            <div class="timeline-item ${item.cls}">
              <div class="timeline-dot"></div>
              <div class="timeline-title"><span>${esc(item.title)}</span><span class="timeline-time">${esc(item.time)}</span></div>
              <div class="timeline-desc">${esc(item.desc)}</div>
            </div>
          `).join("")}
        </div>
      </div>
      ${images.length ? `<div class="card"><div class="card-title">维修图片</div><div class="image-list">${images.map((src) => `<img src="${src}" class="record-image" alt="维修图片">`).join("")}</div></div>` : ""}
    </div>
  `;
}

function renderApp() {
  if (!state.token || !state.role) return renderLogin();
  const tab = currentTab();
  if (tab === "detail") return renderDetail();
  if (state.role === "paidan") {
    if (tab === "orders") return renderOrders();
    if (tab === "engineers") return renderEngineers();
    if (tab === "mine") return renderPaidanMine();
    return renderCreate();
  }
  if (tab === "working") return renderWorking();
  if (tab === "history") return renderHistory();
  if (tab === "mine") return renderEngineerMine();
  return renderTasks();
}

function render() {
  root.innerHTML = renderApp();
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.getElementById("login-form");
      document.querySelectorAll("[data-role]").forEach((item) => item.classList.toggle("active", item === button));
      form.role.value = button.dataset.role;
      form.username.value = button.dataset.role === "paidan" ? "PD001" : "SH001";
      form.password.value = "123456";
    });
  });

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.loading = true;
      state.loginError = "";
      render();
      try {
        const payload = await api("/auth/login", {
          method: "POST",
          body: {
            username: loginForm.username.value.trim(),
            password: loginForm.password.value,
            role: loginForm.role.value,
          },
        });
        saveSession(payload);
        await refreshAll();
        setRoute(payload.role === "paidan" ? "create" : "tasks");
      } catch (error) {
        state.loading = false;
        state.loginError = error.message;
        render();
      }
    });
  }

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailOrder = null;
      setRoute(button.dataset.nav);
    });
  });

  document.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.detail);
      state.detailOrder = await api(`/workorders/${id}`);
      setRoute("detail");
    });
  });

  document.querySelectorAll("[data-working]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.working);
      state.detailOrder = await api(`/workorders/${id}`);
      setRoute("working");
    });
  });

  document.querySelectorAll("[data-edit-engineer]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.engineers.find((eng) => eng.id === Number(button.dataset.editEngineer));
      const form = document.getElementById("engineer-form");
      if (!item || !form) return;
      form.engineer_id.value = item.id;
      form.name.value = item.name || "";
      form.phone.value = item.phone || "";
      form.department.value = item.department || "";
      form.specialty.value = item.specialty || "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll("[data-delete-engineer]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("确认删除该工程师吗？")) return;
      await api(`/engineers/${button.dataset.deleteEngineer}`, { method: "DELETE" });
      await refreshAll();
      render();
    });
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", clearSession);
  });

  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.role === "paidan") {
        setRoute("orders");
      } else {
        setRoute("tasks");
      }
    });
  });

  const createOrderForm = document.getElementById("create-order-form");
  if (createOrderForm) {
    createOrderForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createOrderForm);
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
      await refreshAll();
      setRoute("orders");
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
      if (formData.get("engineer_id")) {
        await api(`/engineers/${formData.get("engineer_id")}`, { method: "PUT", body: payload });
      } else {
        await api("/engineers", { method: "POST", body: payload });
      }
      await refreshAll();
      render();
    });
  }

  const workRecordForm = document.getElementById("work-record-form");
  if (workRecordForm) {
    workRecordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(workRecordForm);
      const files = Array.from(workRecordForm.images.files || []);
      const images = [];
      for (const file of files) {
        const uploadData = new FormData();
        uploadData.append("file", file);
        const result = await api("/api/upload", { method: "POST", body: uploadData });
        images.push(result.url);
      }
      await api(`/workorders/${formData.get("order_id")}/records`, {
        method: "POST",
        body: {
          check_in_location: formData.get("check_in_location"),
          start_time: formData.get("start_time"),
          end_time: formData.get("end_time"),
          analysis: formData.get("analysis"),
          images,
        },
      });
      await refreshAll();
      setRoute("history");
    });
  }
}

window.addEventListener("hashchange", render);

async function bootstrap() {
  if (state.token && state.role) await refreshAll();
  render();
}

bootstrap();
