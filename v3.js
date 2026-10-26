import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, setDoc, updateDoc, runTransaction } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const CONFIG = window.ANCHAU_CONFIG || {};
const $ = (id) => document.getElementById(id);
const collectionNames = {
  tasks:"marketingTasks", plans:"marketingPlans", schedules:"marketingSchedules",
  kpi:"marketingKpiTargets", reports:"marketingWeeklyReports",
  notes:"marketingWeeklyNotes", messages:"marketingTaskMessages", events:"marketingEvents"
};
const statusLabels = {backlog:"Chưa giao",todo:"Cần làm",doing:"Đang làm",review:"Chờ duyệt",revision:"Cần sửa",done:"Hoàn thành",cancelled:"Đã hủy"};
const priorityLabels = {high:"Cao",medium:"Trung bình",low:"Thấp"};
const channels = ["TikTok","Facebook","Website"];
const safe = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validUrl = (v) => { try { const u = new URL(v); return ["https:","http:"].includes(u.protocol); } catch { return false; } };
const aLink = (v) => validUrl(v) ? `<a href="${safe(v)}" rel="noopener noreferrer" target="_blank">Mở liên kết ↗</a>` : "";
const id = (prefix="AC") => prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
const today = (d = new Date()) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const dateFrom = (s) => new Date((s || today())+"T12:00:00");
const addDays = (s,n) => { const d=dateFrom(s);d.setDate(d.getDate()+n);return today(d); };
const weekStart = (s=today()) => { const d=dateFrom(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return today(d); };
const fmt = (s) => s ? dateFrom(s).toLocaleDateString("vi-VN") : "—";
const when = (s) => s ? new Date(s).toLocaleString("vi-VN",{dateStyle:"short",timeStyle:"short"}) : "—";
const iso = () => new Date().toISOString();
const trim = (v,max=2000) => String(v??"").trim().slice(0,max);
const cleanDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "";
const errorText = (e) => ({
  "permission-denied":"Chưa đủ quyền Firestore. Cần áp dụng firestore.rules V3 trước khi dùng tính năng này.",
  "auth/popup-blocked":"Trình duyệt đang chặn cửa sổ đăng nhập.",
  "auth/unauthorized-domain":"Tên miền này chưa được phép trong Firebase Authentication."
})[e?.code] || e?.message || "Đã xảy ra lỗi.";
const needsReview = (task) => {
  const text = [task.title,task.description,task.category].join(" ").toLowerCase();
  return /visa|học phí|tuyển sinh|học bổng|cam kết|đậu|đỗ|chi phí|quảng cáo|ads|chính sách/.test(text) || task.category==="Ads" || task.reviewRequired===true;
};

const appData = { tasks:[],plans:[],schedules:[],messages:[],events:[],reports:[],notes:[],kpi:null };
const ui = {view:"dashboard",month:today().slice(0,7), week:weekStart(), filter:"", layers:{work:true,due:true,post:true}, planType:"week"};
let auth,db,me=null,role=null,unsubs=[],toastTimer=null;
const managerEmail = trim(CONFIG.managerEmail).toLowerCase();
const staffEmail = trim(CONFIG.staffEmail).toLowerCase();
const manager = () => role === "manager";
const staff = () => role === "staff";
const ownerName = () => "Nhân viên Marketing";
const taskById = (key) => appData.tasks.find(t=>t.id===key);
const nowWeek = () => weekStart();
const isLate = (t) => t.status!=="done"&&t.status!=="cancelled"&&t.due&&t.due<today();
const pill = (label,style="") => `<span class="pill ${style}">${safe(label)}</span>`;
const metric = (label,value,note) => `<div class="card metric"><div class="sub">${safe(label)}</div><strong>${safe(value)}</strong><small>${safe(note)}</small></div>`;
const empty = (label) => `<div class="empty">${safe(label)}</div>`;
const toast = (v) => { $("toast").textContent=v;$("toast").classList.remove("hidden");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.add("hidden"),4500); };
const field = (name,label,value="",type="text",extra="") => `<div class="field"><label for="${safe(name)}">${safe(label)}</label><input id="${safe(name)}" name="${safe(name)}" type="${safe(type)}" value="${safe(value)}" ${extra}></div>`;
const select = (name,label,options,value="") => `<div class="field"><label for="${safe(name)}">${safe(label)}</label><select id="${safe(name)}" name="${safe(name)}">${options.map(x=>`<option value="${safe(x[0])}" ${value===x[0]?"selected":""}>${safe(x[1])}</option>`).join("")}</select></div>`;
const txtarea = (name,label,value="") => `<div class="field"><label for="${safe(name)}">${safe(label)}</label><textarea id="${safe(name)}" name="${safe(name)}">${safe(value)}</textarea></div>`;
const btn = (label,action,arg="",kind="") => `<button type="button" class="btn ${kind}" data-action="${safe(action)}" data-id="${safe(arg)}">${safe(label)}</button>`;

function modal(title,body) {
  $("modalTitle").textContent=title;
  $("modalBody").innerHTML=body;
  $("modal").classList.remove("hidden");
}
const closeModal = () => $("modal").classList.add("hidden");
async function doWrite(op,success="Đã lưu dữ liệu.") {
  try { await op();toast(success);return true; }
  catch(e){toast("Không thể lưu: "+errorText(e));return false;}
}
async function logAction(taskId,type,detail="") {
  if(!me)return;
  try {
    const eId=id("EV");
    await setDoc(doc(db,collectionNames.events,eId),{taskId:taskId||"",type,detail:trim(detail,400),actorUid:me.uid,actorEmail:me.email,createdAt:iso()});
  }catch(e){console.warn("Không ghi được nhật ký:",e);}
}
function unsubscribeAll() { unsubs.forEach(f=>f());unsubs=[]; }
function subscriptions() {
  unsubscribeAll();
  for(const [key,col] of Object.entries(collectionNames)) {
    if(key==="kpi") continue;
    const unsub = onSnapshot(collection(db,col), snapshot => {
      appData[key]=snapshot.docs.map(d=>({...d.data(),id:d.id}));
      render();
      if(key==="plans" && staff()) generateRecurring().catch(e=>console.warn("Lịch lặp:",e));
    },e=>{
      console.warn("Firestore",col,e);
      toast("Không tải được "+col+": "+errorText(e));
    });
    unsubs.push(unsub);
  }
  unsubs.push(onSnapshot(doc(db,collectionNames.kpi,"weekly"),snapshot=>{
    appData.kpi=snapshot.exists()?snapshot.data():null;render();
  },e=>{console.warn("KPI",e);toast(errorText(e));}));
}
function mountNav() {
  const pages = manager() ?
    [["dashboard","▦","Tổng quan"],["inbox","◷","Cần tôi xử lý"],["tasks","☷","Công việc"],["plans","▤","Kế hoạch"],["calendar","▣","Lịch Marketing"],["kpi","◫","KPI & báo cáo"],["settings","⚙","Cài đặt"]] :
    [["dashboard","⌂","Hôm nay"],["tasks","☷","Công việc"],["plans","▤","Lập kế hoạch"],["calendar","▣","Lịch Marketing"],["kpi","◫","KPI của tôi"]];
  $("nav").innerHTML=pages.map(([view,icon,label])=>`<button class="navbtn ${ui.view===view?"active":""}" data-action="go" data-id="${view}"><span>${icon}</span>${label}</button>`).join("");
  $("roleLabel").textContent=manager()?"QUẢN LÝ · GIÁM ĐỐC":"NHÂN VIÊN MARKETING";
}
function go(view) {ui.view=view;render();window.scrollTo({top:0,behavior:"smooth"});}
function render() {
  if(!me)return;
  mountNav();
  const titles = {
    dashboard:manager()?"Tổng quan điều hành":"Công việc hôm nay",
    inbox:"Cần tôi xử lý",tasks:"Quản lý công việc",plans:"Kế hoạch Marketing",
    calendar:"Lịch Marketing",kpi:"KPI & báo cáo tuần",settings:"Cài đặt"
  };
  $("pageTitle").textContent=titles[ui.view]||"Marketing";
  const renderers = {dashboard:renderDashboard,inbox:renderInbox,tasks:renderTasks,plans:renderPlans,calendar:renderCalendar,kpi:renderKpi,settings:renderSettings};
  $("content").innerHTML=(renderers[ui.view]||renderDashboard)();
}
function taskName(t) {return `<button class="task-title" data-action="task" data-id="${safe(t.id)}">${safe(t.title)}</button>`;}
function taskLine(t) {
  return `<div class="item-line"><div class="fill">${taskName(t)}<small>${safe(t.channel||"Nội bộ")} · ${safe(t.owner||ownerName())} · Hạn ${fmt(t.due)} · ${safe(t.source==="self"?"Tự tạo":t.source==="plan"?"Theo kế hoạch":"Giám đốc giao")}</small></div>${pill(statusLabels[t.status]||"Chưa cập nhật",isLate(t)?"bad":t.status==="review"?"warn":t.status==="done"?"good":"")}</div>`;
}
function weekTasks(start=nowWeek()) {
  const end=addDays(start,7);
  return appData.tasks.filter(t=>t.status!=="cancelled" && ((t.producedAt>=start&&t.producedAt.slice(0,10)<end)||(t.publishedAt>=start&&t.publishedAt.slice(0,10)<end)||(t.due>=start&&t.due<end)||(t.publish>=start&&t.publish<end)));
}
function weekStats(start=ui.week) {
  const end=addDays(start,7);
  const all=appData.tasks.filter(t=>t.status!=="cancelled");
  const produced = all.filter(t=>t.producedAt && t.producedAt.slice(0,10)>=start && t.producedAt.slice(0,10)<end);
  const pubs = all.flatMap(t=>(Array.isArray(t.publications)?t.publications:[]).map(p=>({...p,taskId:t.id}))).filter(p=>p.publishedAt && p.publishedAt.slice(0,10)>=start && p.publishedAt.slice(0,10)<end);
  const targets = appData.kpi?.targets || {};
  return channels.map(channel => {
    const p=produced.filter(t=>t.channel===channel).length;
    const x=pubs.filter(pub=>pub.channel===channel).length;
    return {channel,produced:p,published:x,produceTarget:Math.max(0,Number(targets[channel]?.produce)||0),publishTarget:Math.max(0,Number(targets[channel]?.publish)||0)};
  });
}
function kpiCard(k) {
  const bar=(value,target)=>`<div class="progress"><i class="${target&&value>=target?"ok":""}" style="width:${target?Math.min(100,value/target*100):0}%"></i></div>`;
  return `<div class="card"><h3>${safe(k.channel)}</h3><div class="kpi-row"><div class="header"><span>Sản xuất</span><b>${k.produced}/${k.produceTarget||"—"}</b></div>${bar(k.produced,k.produceTarget)}</div><div class="kpi-row"><div class="header"><span>Xuất bản</span><b>${k.published}/${k.publishTarget||"—"}</b></div>${bar(k.published,k.publishTarget)}</div></div>`;
}
function waitingQuestions() {
  return appData.tasks.filter(t=>{
    const messages=appData.messages.filter(m=>m.taskId===t.id).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
    return messages.length && messages[messages.length-1].kind==="question";
  });
}
function renderDashboard() {
  const tasks=appData.tasks.filter(t=>t.status!=="cancelled");
  const due=tasks.filter(t=>t.status!=="done"&&t.due<=addDays(today(),2)).sort((a,b)=>(a.due||"").localeCompare(b.due||"")).slice(0,8);
  const review=tasks.filter(t=>t.status==="review");
  const questions=waitingQuestions();
  const week=weekStats(nowWeek());
  const total=tasks.length;
  const metrics=manager() ?
    [metric("Chờ duyệt",review.length,"Sản phẩm chờ kiểm tra"),metric("Cần phản hồi",questions.length,"Câu hỏi về công việc"),metric("Việc quá hạn",tasks.filter(isLate).length,"Cần theo dõi"),metric("Công việc đã hoàn thành",tasks.filter(t=>t.status==="done").length,`${total} công việc`)]:
    [metric("Chờ nhận việc",tasks.filter(t=>t.status==="todo"&&(!t.source||t.source==="assigned")).length,"Giám đốc đã giao"),metric("Đang thực hiện",tasks.filter(t=>t.status==="doing").length,"Tất cả công việc"),metric("Cần chỉnh sửa",tasks.filter(t=>t.status==="revision").length,"Xem phản hồi"),metric("Sắp hoặc đã quá hạn",due.length,"Trong 2 ngày tới")];
  return `<div class="stack"><div class="grid cols4">${metrics.join("")}</div>
    <div class="split"><section class="card"><div class="section-head"><h2>${manager()?"Cần tôi xử lý":"Việc cần ưu tiên"}</h2>${btn("Xem tất cả","go",manager()?"inbox":"tasks")}</div>
      ${manager()?(review.length?review.map(taskLine).join(""):"")+questions.map(taskLine).join("")||empty("Không có yêu cầu đang chờ.") : due.length?due.map(taskLine).join(""):empty("Chưa có việc cần ưu tiên.")}
    </section><section class="card"><div class="section-head"><h2>KPI tuần này</h2>${btn("Chi tiết","go","kpi")}</div>
      ${week.map(k=>`<div class="kpi-row"><div class="header"><b>${k.channel}</b><span>SX ${k.produced}/${k.produceTarget||"—"} · Đăng ${k.published}/${k.publishTarget||"—"}</span></div></div>`).join("")}
      <div class="notice">KPI ghi nhận theo số lượng sản phẩm và lượt đăng thực tế, tách riêng từng kênh.</div>
    </section></div>
    <section class="card"><div class="section-head"><h2>Hành động nhanh</h2></div><div class="button-row">${btn(manager()?"＋ Giao việc":"＋ Tự tạo việc","new-task","","primary")}${btn("Lập kế hoạch","go","plans")}${btn("Lịch Marketing","go","calendar")}${manager()?btn("Thiết lập KPI","go","settings"):""}</div></section>
  </div>`;
}
function renderInbox() {
  if(!manager())return empty("Chỉ Giám đốc được truy cập.");
  const review=appData.tasks.filter(t=>t.status==="review");
  const questions=waitingQuestions();
  const late=appData.tasks.filter(isLate);
  return `<div class="grid cols3">${metric("Chờ duyệt",review.length,"Nội dung cần phê duyệt")}${metric("Cần trả lời",questions.length,"Nhân viên hỏi lại brief")}${metric("Quá hạn",late.length,"Công việc chưa hoàn thành")}</div>
    <div class="grid cols2" style="margin-top:16px"><div class="card"><h2>Nội dung chờ duyệt</h2>${review.map(taskLine).join("")||empty("Không có nội dung chờ duyệt.")}</div>
    <div class="card"><h2>Câu hỏi cần phản hồi</h2>${questions.map(taskLine).join("")||empty("Không có câu hỏi mới.")}</div></div>
    <section class="card" style="margin-top:16px"><h2>Việc quá hạn</h2>${late.map(taskLine).join("")||empty("Không có việc quá hạn.")}</section>`;
}
function renderTasks() {
  const q=ui.filter.trim().toLowerCase();
  const filtered=appData.tasks.filter(t=>!q||[t.title,t.owner,t.channel,t.description,t.category].join(" ").toLowerCase().includes(q)).sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999"));
  return `<div class="head-actions"><p class="sub">Công việc được giao, tự tạo và tự sinh từ kế hoạch. Công việc đã hủy vẫn được giữ để đối chiếu lịch sử.</p>${btn(manager()?"＋ Giao việc mới":"＋ Tự tạo công việc","new-task","","primary")}</div>
    <div class="filters"><input id="searchTask" placeholder="Tìm công việc / kênh / người phụ trách" value="${safe(ui.filter)}" aria-label="Tìm công việc">${btn("Xóa lọc","clear-filter")}</div>
    <div class="card table-wrap"><table class="table"><thead><tr><th>Công việc</th><th>Nguồn</th><th>Kênh</th><th>Deadline</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${filtered.map(t=>`<tr><td>${taskName(t)}<div class="tag">${safe(t.owner||ownerName())}</div></td><td>${safe(t.source==="self"?"Tự tạo":t.source==="plan"?"Kế hoạch":"Giám đốc giao")}</td><td>${safe(t.channel||"Nội bộ")}</td><td>${fmt(t.due)}</td><td>${pill(statusLabels[t.status]||"—",isLate(t)?"bad":t.status==="done"?"good":t.status==="review"?"warn":"")}</td><td>${btn("Mở","task",t.id)}</td></tr>`).join("")||`<tr><td colspan="6">${empty("Chưa có công việc.")}</td></tr>`}</tbody></table></div>`;
}
