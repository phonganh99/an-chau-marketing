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
  const targets = targetForWeek(start);
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

function taskForm(t=null) {
  const isEdit=!!t,own=!isEdit||manager()||(t.source==="self"&&t.createdBy===me.uid);
  if(!own)return `<div class="notice warn">Bạn không được thay đổi brief do Giám đốc giao.</div>`;
  const name=t?.title||"",owner=t?.owner||ownerName();
  return `<form id="taskForm" data-task-id="${safe(t?.id||"")}" class="form-grid">
    <div class="full">${field("title","Tên công việc *",name,"text",'required maxlength="160"')}</div>
    ${manager()?field("owner","Người thực hiện *",owner,"text",'required maxlength="70"'):""}
    ${select("category","Nhóm công việc",[["Content","Content"],["Video","Video"],["Design","Thiết kế"],["Ads","Ads"],["Website","Website"],["Khác","Khác"]],t?.category||"Content")}
    ${select("channel","Kênh",channels.map(x=>[x,x]),t?.channel||"TikTok")}
    ${select("priority","Ưu tiên",[["high","Cao"],["medium","Trung bình"],["low","Thấp"]],t?.priority||"medium")}
    ${manager()?select("status","Trạng thái",Object.entries(statusLabels),t?.status||"todo"):""}
    ${field("due","Deadline bàn giao *",t?.due||addDays(today(),2),"date","required")}
    ${field("publish","Ngày dự kiến đăng",t?.publish||"","date")}
    <div class="full">${txtarea("description","Brief / yêu cầu",t?.description||"")}</div>
    <div class="full notice">Nội dung liên quan visa, chi phí, học phí, tuyển sinh, quảng cáo hoặc cam kết sẽ cần duyệt trước khi đăng. Nhân viên được tự tạo việc nhưng không được bỏ qua bước duyệt nội dung quan trọng.</div>
    <div class="full button-row end"><button class="btn primary" type="submit">${isEdit?"Lưu thông tin":"Tạo công việc"}</button></div>
  </form>`;
}
function openTaskForm(taskId="") {
  const t=taskId?taskById(taskId):null;
  if(taskId&&!t)return toast("Không tìm thấy công việc.");
  if(t && !manager() && !(t.source==="self"&&t.createdBy===me.uid)) return toast("Không có quyền chỉnh brief công việc này.");
  modal(t?"Chỉnh sửa công việc":manager()?"Giao việc mới":"Tự tạo công việc",taskForm(t));
}
async function saveTaskForm(form) {
  const old=taskById(form.dataset.taskId);
  if(old&&!manager()&&!(old.source==="self"&&old.createdBy===me.uid))return toast("Không đủ quyền chỉnh sửa.");
  const val=(key)=>trim(form.elements[key]?.value||"");
  const newTask={
    title:val("title"),owner:manager()?val("owner"):ownerName(),category:val("category"),
    channel:val("channel"),priority:val("priority"),due:val("due"),publish:val("publish"),
    description:val("description"),updatedAt:iso(),updatedBy:me.uid
  };
  if(!newTask.title||!newTask.owner||!cleanDate(newTask.due))return toast("Vui lòng điền tên việc, người phụ trách và deadline.");
  if(newTask.publish&&!cleanDate(newTask.publish))return toast("Ngày đăng không hợp lệ.");
  if(manager()){
    newTask.status=val("status")||"todo";
    if(!statusLabels[newTask.status])return toast("Trạng thái không hợp lệ.");
  }
  if(!old){
    newTask.createdAt=iso();newTask.createdBy=me.uid;newTask.source=manager()?"assigned":"self";
    newTask.id=id("MK");newTask.status=newTask.status||"todo";
    newTask.reviewRequired=needsReview(newTask);
    newTask.approvalState=newTask.reviewRequired?"pending":"not_required";
    newTask.producedAt="";newTask.publications=[];
  }
  const taskId=old?.id||newTask.id;
  const ok=await doWrite(()=>old?updateDoc(doc(db,collectionNames.tasks,taskId),newTask):setDoc(doc(db,collectionNames.tasks,taskId),newTask),old?"Đã cập nhật công việc.":"Đã tạo công việc.");
  if(ok){closeModal();await logAction(taskId,old?"task_updated":"task_created",newTask.title);}
}
function taskMessages(t) {
  const messages=appData.messages.filter(m=>m.taskId===t.id).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  return `<section><h3>Trao đổi trong công việc</h3>
   ${messages.length?messages.map(m=>`<div class="list-card"><strong>${safe(m.actorEmail)} · ${safe(m.kind==="question"?"Hỏi lại":m.kind==="reply"?"Trả lời":"Nhận xét")}</strong><p>${safe(m.content)}</p><small class="sub">${when(m.createdAt)}</small></div>`).join(""):empty("Chưa có trao đổi.")}
   <form id="messageForm" data-task-id="${safe(t.id)}" class="stack">
     ${select("kind","Loại phản hồi",manager()?[["reply","Trả lời nhân viên"],["feedback","Nhận xét"]]:[["question","Hỏi lại brief"],["feedback","Ghi chú"]])}
     ${txtarea("content","Nội dung trao đổi")}
     <div class="button-row end"><button class="btn" type="submit">Gửi phản hồi</button></div>
   </form></section>`;
}
function openTaskDetail(key) {
  const t=taskById(key);if(!t)return toast("Không tìm thấy công việc.");
  const approved=t.approvalState==="approved"||t.approvalState==="not_required"||t.approvalState==="auto";
  const production=!!t.producedAt;
  const pubs=Array.isArray(t.publications)?t.publications:[];
  const internal=t.category==="Khác"||t.channel==="Nội bộ";
  let actions="";
  if(t.status!=="cancelled"){
    if(manager()){
      actions+=btn("Sửa thông tin","edit-task",t.id);
      if(t.status==="review")actions+=btn("Duyệt nội dung","approve-task",t.id,"primary")+btn("Yêu cầu sửa","revise-task",t.id,"danger");
      if(t.status!=="done")actions+=btn("Ghi nhận hoàn thành","finish-task",t.id);
      actions+=btn("Hủy / lưu lịch sử","cancel-task",t.id,"danger");
      if(!t.reviewRequired) actions+=btn("Bật duyệt thủ công","require-review",t.id);
    }else{
      if(t.status==="todo"&&t.source!=="self"&&t.source!=="plan")actions+=btn("Nhận việc","accept-task",t.id,"primary");
      else if(t.status==="todo")actions+=btn("Bắt đầu thực hiện","accept-task",t.id);
      if(!production)actions+=btn("✓ Đã sản xuất","produced-task",t.id,"primary");
      if(t.reviewRequired && t.approvalState!=="approved" && t.status!=="review")actions+=btn("Gửi duyệt nội dung","submit-review",t.id);
      if(production && approved && channels.includes(t.channel))actions+=btn("＋ Đã đăng / Thêm link","publish-task",t.id);
      if(internal && t.status!=="done")actions+=btn("Hoàn thành việc nội bộ","finish-task",t.id);
      if(t.source==="self"&&t.createdBy===me.uid) actions+=btn("Sửa công việc","edit-task",t.id);
    }
  }
  const milestones=`<div class="grid cols2"><div class="list-card"><strong>Sản xuất</strong><p>${production?"Đã ghi nhận: "+when(t.producedAt):"Chưa ghi nhận sản phẩm"}</p></div>
  <div class="list-card"><strong>Phê duyệt nội dung</strong><p>${safe(t.approvalState==="approved"?"Đã duyệt":t.approvalState==="not_required"?"Không cần duyệt":t.status==="review"?"Đang chờ duyệt":t.status==="revision"?"Cần chỉnh sửa":"Chưa duyệt")}</p></div></div>`;
  const publicationHtml=pubs.length?pubs.map(p=>`<div class="item-line"><div class="fill"><b>${safe(p.channel)} · ${when(p.publishedAt)}</b><small>${aLink(p.link)}</small></div></div>`).join(""):empty("Chưa ghi nhận lượt xuất bản.");
  const history=appData.events.filter(e=>e.taskId===t.id).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,30);
  const body=`<div class="stack">
    <div class="button-row">${pill(statusLabels[t.status]||"—",t.status==="done"?"good":t.status==="review"?"warn":"")}${pill(t.source==="self"?"Tự tạo":t.source==="plan"?"Từ kế hoạch":"Giám đốc giao","neutral")}${pill(t.channel||"Nội bộ","neutral")}</div>
    <div class="sub">Phụ trách: <b>${safe(t.owner||ownerName())}</b> · Hạn: <b>${fmt(t.due)}</b> · Lịch đăng: <b>${fmt(t.publish)}</b></div>
    <div class="notice"><b>Brief:</b> ${safe(t.description||"Chưa có yêu cầu bổ sung.")}</div>
    ${milestones}
    <div class="button-row">${actions}</div>
    <hr class="divider"><section><h3>Lượt xuất bản theo kênh</h3>${publicationHtml}</section>
    <hr class="divider">${taskMessages(t)}
    <hr class="divider"><section><h3>Nhật ký hoạt động</h3>${history.length?`<ol class="history">${history.map(e=>`<li>${safe(e.type)} · ${safe(e.actorEmail)} · ${when(e.createdAt)}<br>${safe(e.detail)}</li>`).join("")}</ol>`:empty("Chưa có nhật ký V3 cho công việc này.")}</section>
  </div>`;
  modal(t.title,body);
}
async function updateTaskAction(key,action) {
  const t=taskById(key);if(!t)return toast("Không tìm thấy công việc.");
  if(t.status==="cancelled")return toast("Công việc đã hủy.");
  const stamp=iso();const common={updatedAt:stamp,updatedBy:me.uid};
  let changes=null,reason="";
  switch(action){
    case "accept-task":
      if(manager())return;changes={...common,status:"doing"};break;
    case "produced-task":
      if(manager()||t.producedAt)return;
      changes={...common,producedAt:stamp,status:t.status==="review"?"review":"doing"};break;
    case "submit-review":
      if(manager()||!t.reviewRequired)return;
      changes={...common,approvalState:"pending",status:"review"};break;
    case "approve-task":
      if(!manager()||t.status!=="review")return;
      changes={...common,approvalState:"approved",status:"doing",approvedAt:stamp,approvedBy:me.uid};break;
    case "revise-task":
      if(!manager())return;
      reason=prompt("Nội dung nhân viên cần sửa (bắt buộc):")||"";
      if(!reason.trim())return;changes={...common,status:"revision",approvalState:"pending",feedback:trim(reason)};break;
    case "require-review":
      if(!manager())return;changes={...common,reviewRequired:true,approvalState:"pending"};break;
    case "finish-task":
      if(!manager() && !((t.category==="Khác"||t.channel==="Nội bộ")&&staff()))return;
      changes={...common,status:"done",completedAt:stamp};break;
    case "cancel-task":
      if(!manager())return;
      reason=prompt("Nhập lý do hủy công việc (bắt buộc):")||"";
      if(!reason.trim())return;changes={...common,status:"cancelled",cancelReason:trim(reason)};break;
    default:return;
  }
  if(!changes)return;
  const ok=await doWrite(()=>updateDoc(doc(db,collectionNames.tasks,key),changes));
  if(ok){await logAction(key,action,reason);closeModal();}
}
function openPublishForm(t) {
  if(!t.producedAt)return toast("Cần ghi nhận hoàn thành sản xuất trước.");
  if(t.reviewRequired&&t.approvalState!=="approved")return toast("Nội dung này phải được Giám đốc duyệt trước khi đăng.");
  const already=new Set((t.publications||[]).map(x=>x.channel));
  const available=channels.filter(ch=>!already.has(ch));
  if(!available.length)return toast("Đã ghi nhận xuất bản cho tất cả kênh.");
  modal("Ghi nhận đã đăng · "+t.title,`<form id="publishForm" data-task-id="${safe(t.id)}" class="stack">
    ${select("channel","Kênh đã đăng",available.map(x=>[x,x]),t.channel)}
    ${field("link","Link bài đăng", "","url",'required placeholder="https://..."')}
    <div class="notice">Mỗi công việc chỉ ghi nhận một lượt xuất bản trên mỗi kênh. Hệ thống đếm theo ngày xác nhận thực tế; không duyệt KPI thêm lần nữa.</div>
    <div class="button-row end"><button type="submit" class="btn primary">Ghi nhận xuất bản</button></div></form>`);
}
async function submitPublish(form) {
  const t=taskById(form.dataset.taskId);if(!t)return;
  const channel=trim(form.elements.channel.value),link=trim(form.elements.link.value,1000);
  if(!channels.includes(channel)||!validUrl(link))return toast("Chọn đúng kênh và nhập link http(s) hợp lệ.");
  if(!t.producedAt||(t.reviewRequired&&t.approvalState!=="approved"))return toast("Sản phẩm chưa đủ điều kiện xuất bản.");
  const pubs=Array.isArray(t.publications)?t.publications:[];
  if(pubs.some(p=>p.channel===channel))return toast("Kênh này đã được ghi nhận, không cộng trùng KPI.");
  const stamp=iso();
  const updated=[...pubs,{id:id("PUB"),channel,link,publishedAt:stamp}];
  const ok=await doWrite(()=>updateDoc(doc(db,collectionNames.tasks,t.id),{publications:updated,publishedAt:stamp,link,updatedBy:me.uid,updatedAt:stamp,status:"done"}),"Đã ghi nhận KPI xuất bản.");
  if(ok){closeModal();await logAction(t.id,"published",channel+" · "+link);}
}
async function submitMessage(form) {
  const taskId=form.dataset.taskId,content=trim(form.elements.content.value);
  const kind=trim(form.elements.kind.value);
  if(!content)return toast("Nhập nội dung trao đổi.");
  if(!taskById(taskId))return toast("Công việc không còn tồn tại.");
  if(manager()&&!["reply","feedback"].includes(kind))return toast("Loại phản hồi không hợp lệ.");
  if(staff()&&!["question","feedback"].includes(kind))return toast("Loại phản hồi không hợp lệ.");
  const m={taskId,actorUid:me.uid,actorEmail:me.email,kind,content,createdAt:iso()};
  const ok=await doWrite(()=>setDoc(doc(db,collectionNames.messages,id("MSG")),m),"Đã gửi trao đổi.");
  if(ok){await logAction(taskId,"message",kind);closeModal();}
}

function planLine(p) {
  const typeName={week:"Tuần",month:"Tháng",campaign:"Chiến dịch",recurring:"Định kỳ"}[p.type]||p.type;
  return `<div class="item-line"><div class="fill"><button class="task-title" data-action="plan" data-id="${safe(p.id)}">${safe(p.title)}</button>
    <small>${safe(typeName)} · ${p.items?.length||0} nội dung · ${p.active?"Đã kích hoạt":"Bản nháp"} · ${safe(p.ownerEmail||"")}</small></div>
    ${btn("Xem kế hoạch","plan",p.id)}</div>`;
}
function renderPlans() {
  const plans=appData.plans.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  return `<div class="head-actions"><p class="sub">Nhân viên chủ động lập kế hoạch tuần, tháng, chiến dịch hoặc việc lặp. Kích hoạt kế hoạch sẽ tự tạo công việc, không cần Giám đốc duyệt.</p>${staff()?btn("＋ Lập kế hoạch mới","new-plan","","primary"):""}</div>
  <div class="card"><div class="section-head"><h2>Kế hoạch Marketing</h2>${pill(plans.filter(p=>p.active).length+" đang triển khai")}</div>
  ${plans.map(planLine).join("")||empty("Chưa có kế hoạch nào. Nhân viên có thể bắt đầu lập kế hoạch.")}</div>
  <div class="notice warn" style="margin-top:16px">Công việc định kỳ được tạo khi có người mở hệ thống. Muốn hệ thống tự chạy khi tất cả đã đóng trình duyệt cần kết nối tác vụ lịch ở máy chủ; phần này chưa được kích hoạt.</div>`;
}
function openPlanNew() {
  if(!staff())return toast("Nhân viên là người lập kế hoạch.");
  modal("Lập kế hoạch Marketing",`<form id="planForm" class="form-grid">
    <div class="full">${field("title","Tên kế hoạch *","","text",'required maxlength="130"')}</div>
    ${select("type","Loại kế hoạch",[["week","Kế hoạch tuần"],["month","Kế hoạch tháng"],["campaign","Chiến dịch"],["recurring","Định kỳ hằng tuần"]],"week")}
    ${field("start","Ngày bắt đầu",today(),"date","required")}
    ${field("end","Ngày kết thúc",addDays(today(),6),"date","required")}
    <div class="full notice">Sau khi lưu, thêm các dòng nội dung rồi kích hoạt. Công việc sẽ tự được tạo theo mã dòng, tránh bị nhân đôi.</div>
    <div class="full button-row end"><button type="submit" class="btn primary">Tạo kế hoạch</button></div></form>`);
}
async function savePlanForm(form) {
  if(!staff())return;
  const start=cleanDate(form.elements.start.value),end=cleanDate(form.elements.end.value);
  const title=trim(form.elements.title.value,130),type=trim(form.elements.type.value);
  if(!title||!start||!end||end<start)return toast("Nhập tên, thời gian hợp lệ.");
  const p={title,type,start,end,items:[],active:false,ownerUid:me.uid,ownerEmail:me.email,createdAt:iso(),updatedAt:iso(),version:1};
  const ok=await doWrite(()=>setDoc(doc(db,collectionNames.plans,id("PLAN")),p),"Đã tạo bản kế hoạch. Hãy thêm nội dung.");
  if(ok)closeModal();
}
function openPlanDetail(key) {
  const p=appData.plans.find(x=>x.id===key);if(!p)return;
  const editable=staff()&&p.ownerUid===me.uid;
  const items=Array.isArray(p.items)?p.items:[];
  const recurring=p.type==="recurring";
  modal("Kế hoạch · "+p.title,`<div class="stack">
   <div class="button-row">${pill(p.active?"Đang triển khai":"Bản nháp",p.active?"good":"neutral")}${pill(p.type,"neutral")}${pill(items.length+" nội dung")}</div>
   <div class="sub">Thời gian: ${fmt(p.start)} – ${fmt(p.end)} · Người lập: ${safe(p.ownerEmail)}</div>
   <div class="table-wrap"><table class="table"><thead><tr><th>Chủ đề / công việc</th><th>Kênh</th><th>Deadline</th><th>Ngày đăng / Ngày lặp</th><th></th></tr></thead><tbody>
   ${items.map(x=>`<tr><td><b>${safe(x.title)}</b></td><td>${safe(x.channel)}</td><td>${fmt(x.due)}</td><td>${recurring?"Thứ "+safe(x.weekday===0?"CN":x.weekday+1):fmt(x.publish)}</td><td>${editable?btn("Bỏ","remove-plan-item",p.id+"|"+x.id):""}</td></tr>`).join("")||`<tr><td colspan="5">${empty("Chưa có nội dung trong kế hoạch.")}</td></tr>`}
   </tbody></table></div>
   ${editable?`<section class="card"><h3>Thêm một dòng kế hoạch</h3><form id="planItemForm" data-plan-id="${safe(p.id)}" class="form-grid">
      <div class="full">${field("title","Chủ đề / đầu việc *","","text",'required maxlength="160"')}</div>
      ${select("channel","Kênh",channels.map(x=>[x,x]))}
      ${select("category","Nhóm",[["Video","Video"],["Content","Content"],["Design","Thiết kế"],["Ads","Quảng cáo"],["Website","Website"],["Khác","Khác"]],"Content")}
      ${recurring?select("weekday","Lặp hằng tuần",[["1","Thứ Hai"],["2","Thứ Ba"],["3","Thứ Tư"],["4","Thứ Năm"],["5","Thứ Sáu"],["6","Thứ Bảy"],["0","Chủ Nhật"]]):field("due","Deadline bàn giao",addDays(today(),1),"date","required")}
      ${recurring?"":field("publish","Ngày dự kiến đăng",addDays(today(),2),"date")}
      <div class="full">${txtarea("description","Brief / lưu ý")}</div>
      <div class="full button-row end"><button type="submit" class="btn primary">Thêm dòng</button></div>
      </form></section>
      <div class="button-row">${btn(p.active?"Đồng bộ việc mới":"Kích hoạt & tự sinh việc","activate-plan",p.id,"primary")}${p.active?btn("Tạm dừng kế hoạch","pause-plan",p.id):""}</div>
      <div class="notice warn">Thay đổi nội dung sau khi đã kích hoạt không xóa hoặc ghi đè các công việc đã sinh. Dòng mới sẽ tạo thêm công việc khi đồng bộ.</div>`:""}
   </div>`);
}
async function addPlanItem(form) {
  const p=appData.plans.find(x=>x.id===form.dataset.planId);
  if(!p||!staff()||p.ownerUid!==me.uid)return;
  const title=trim(form.elements.title.value,160),channel=trim(form.elements.channel.value);
  if(!title||!channels.includes(channel))return toast("Nhập tên nội dung và kênh hợp lệ.");
  const recurring=p.type==="recurring";
  const due=recurring?"":cleanDate(form.elements.due.value);
  const publish=recurring?"":cleanDate(form.elements.publish.value);
  if(!recurring&&!due)return toast("Cần ngày bàn giao.");
  const items=Array.isArray(p.items)?p.items:[];
  if(items.length>=100)return toast("Giới hạn 100 nội dung mỗi kế hoạch.");
  const item={id:id("IT"),title,channel,category:trim(form.elements.category.value),description:trim(form.elements.description.value),due,publish,weekday:recurring?Number(form.elements.weekday.value):null};
  const ok=await doWrite(()=>updateDoc(doc(db,collectionNames.plans,p.id),{items:[...items,item],version:(p.version||1)+1,updatedAt:iso()}),"Đã thêm nội dung vào kế hoạch.");
  if(ok)closeModal();
}
async function removePlanItem(key) {
  const [planId,itemId]=key.split("|");
  const p=appData.plans.find(x=>x.id===planId);
  if(!p||!staff()||p.ownerUid!==me.uid)return;
  if(!confirm("Bỏ dòng này khỏi kế hoạch? Công việc đã sinh sẽ không tự bị xóa."))return;
  const items=(p.items||[]).filter(x=>x.id!==itemId);
  const ok=await doWrite(()=>updateDoc(doc(db,collectionNames.plans,planId),{items,version:(p.version||1)+1,updatedAt:iso()}));
  if(ok)closeModal();
}
function planToTask(p,item,uniqueId,due,publish) {
  const stub={id:uniqueId,title:item.title,description:item.description||"",category:item.category||"Content"};
  const review=needsReview(stub);
  return {
    id:uniqueId,title:item.title,owner:ownerName(),category:item.category||"Content",channel:item.channel,
    description:item.description||"",source:"plan",planId:p.id,planItemId:item.id,
    createdBy:p.ownerUid,priority:"medium",status:"todo",due,publish,createdAt:iso(),updatedAt:iso(),
    updatedBy:me.uid,reviewRequired:review,approvalState:review?"pending":"not_required",
    producedAt:"",publications:[]
  };
}
async function ensureTask(p,item,uniqueId,due,publish) {
  const ref=doc(db,collectionNames.tasks,uniqueId);
  return runTransaction(db,async transaction=>{
    const existing=await transaction.get(ref);
    if(existing.exists())return false;
    transaction.set(ref,planToTask(p,item,uniqueId,due,publish));
    return true;
  });
}
async function generatePlan(p) {
  if(!me||!p.active)return 0;
  if(staff()&&p.ownerUid!==me.uid)return 0;
  const items=Array.isArray(p.items)?p.items:[];
  let made=0;
  for(const item of items) {
    if(p.type==="recurring")continue;
    const due=cleanDate(item.due)||p.start,publish=cleanDate(item.publish)||"";
    const uniqueId="PL-"+p.id+"-"+item.id;
    if(await ensureTask(p,item,uniqueId,due,publish))made++;
  }
  return made;
}
let generating=false;
async function generateRecurring() {
  if(generating||!me)return;
  generating=true;
  try{
    const plans=appData.plans.filter(p=>p.active&&p.type==="recurring"&&(!staff()||p.ownerUid===me.uid));
    const start=today();
    for(const p of plans)for(const item of (p.items||[]))for(let n=0;n<14;n++){
      const day=addDays(start,n),weekday=dateFrom(day).getDay();
      if(day<p.start||day>p.end||weekday!==item.weekday)continue;
      await ensureTask(p,item,"RC-"+p.id+"-"+item.id+"-"+day,day,day);
    }
  }finally{generating=false;}
}
async function activatePlan(planId) {
  const p=appData.plans.find(x=>x.id===planId);
  if(!p||!staff()||p.ownerUid!==me.uid)return;
  if(!(p.items||[]).length)return toast("Thêm ít nhất một nội dung trước khi kích hoạt.");
  const ok=await doWrite(()=>updateDoc(doc(db,collectionNames.plans,p.id),{active:true,updatedAt:iso()}),"Đã kích hoạt kế hoạch.");
  if(ok) {
    try {
      const n=await generatePlan({...p,active:true});
      await generateRecurring();
      toast("Đã kích hoạt kế hoạch, tạo mới "+n+" công việc. Việc cũ không bị tạo trùng.");
    }catch(e){toast("Đã kích hoạt, nhưng tạo việc có lỗi: "+errorText(e));}
    closeModal();
  }
}
async function pausePlan(key) {
  const p=appData.plans.find(x=>x.id===key);
  if(!p||(!manager()&&p.ownerUid!==me.uid))return;
  const ok=await doWrite(()=>updateDoc(doc(db,collectionNames.plans,key),{active:false,updatedAt:iso()}),"Đã tạm dừng kế hoạch. Những việc đã tạo vẫn giữ nguyên.");
  if(ok)closeModal();
}
function renderCalendar() {
  const [year,month]=ui.month.split("-").map(Number);
  const start=(new Date(year,month-1,1).getDay()+6)%7;
  const count=Math.ceil((new Date(year,month,0).getDate()+start)/7)*7;
  const layers=ui.layers;
  let html=["T2","T3","T4","T5","T6","T7","CN"].map(x=>`<div class="weekday">${x}</div>`).join("");
  for(let i=0;i<count;i++){
    const date=today(new Date(year,month-1,i-start+1));
    const inside=date.slice(0,7)===ui.month;
    let entries=[];
    if(layers.post)entries.push(...appData.tasks.filter(t=>t.publish===date&&t.status!=="cancelled").map(t=>`<button class="cal-chip" title="${safe(t.title)}" data-action="task" data-id="${safe(t.id)}">Đăng · ${safe(t.title)}</button>`));
    if(layers.due)entries.push(...appData.tasks.filter(t=>t.due===date&&t.status!=="cancelled").map(t=>`<button class="cal-chip due" title="${safe(t.title)}" data-action="task" data-id="${safe(t.id)}">Hạn · ${safe(t.title)}</button>`));
    if(layers.work)entries.push(...appData.schedules.filter(s=>s.date===date).map(s=>`<button class="cal-chip work" data-action="schedule" data-id="${safe(date)}">${safe(s.mode==="off"?"Nghỉ":s.mode==="office"?"Văn phòng":s.mode==="remote"?"Từ xa":"Đi quay")} ${safe(s.start||"")}</button>`));
    html+=`<div class="day ${inside?"":"out"}"><span class="number">${dateFrom(date).getDate()}</span>
       ${entries.slice(0,4).join("")}${entries.length>4?`<div class="tag">+${entries.length-4} sự kiện</div>`:""}
       ${staff()&&inside?`<button class="cal-chip work" data-action="schedule" data-id="${safe(date)}">＋ Lịch làm</button>`:""}
       </div>`;
  }
  const conflicts=appData.schedules.filter(s=>s.mode==="off").flatMap(s=>appData.tasks.filter(t=>t.due===s.date&&t.status!=="done"&&t.status!=="cancelled").map(t=>({date:s.date,task:t}))).slice(0,10);
  return `<div class="toolbar"><p class="sub">Bật/tắt lớp lịch. Nhân viên tự đăng ký lịch làm, không cần duyệt và không tự dời deadline.</p>${staff()?btn("＋ Đăng ký lịch làm","schedule",today(),"primary"):""}</div>
    <section class="card"><div class="toolbar"><div class="button-row">${btn("‹","cal-prev")}<strong>Tháng ${month}/${year}</strong>${btn("›","cal-next")}${btn("Hôm nay","cal-today")}</div>
    <div class="checkbox-row">${[["work","Lịch làm"],["due","Deadline"],["post","Lịch đăng"]].map(([k,label])=>`<label><input type="checkbox" data-layer="${k}" ${layers[k]?"checked":""}>${label}</label>`).join("")}</div></div>
    <div class="calendar">${html}</div></section>
    ${conflicts.length?`<div class="notice warn" style="margin-top:16px"><b>Cảnh báo xung đột lịch:</b>${conflicts.map(x=>`<div>${fmt(x.date)} – ${taskName(x.task)}</div>`).join("")}</div>`:""}
  `;
}
function openSchedule(date=today()) {
  if(!staff())return toast("Nhân viên tự đăng ký lịch đi làm.");
  const cur=appData.schedules.find(s=>s.id===me.uid+"_"+date);
  modal("Đăng ký lịch làm việc",`<form id="scheduleForm" class="form-grid">
    ${field("date","Ngày *",date,"date","required")}
    ${select("mode","Hình thức",[["office","Tại văn phòng"],["remote","Làm từ xa"],["field","Đi quay / Sự kiện"],["off","Nghỉ"]],cur?.mode||"office")}
    ${field("start","Giờ bắt đầu",cur?.start||"08:30","time")}
    ${field("end","Giờ kết thúc",cur?.end||"17:30","time")}
    <div class="full">${txtarea("note","Ghi chú",cur?.note||"")}</div>
    <div class="full notice">Lịch có hiệu lực ngay, không cần Giám đốc phê duyệt. Nếu trùng deadline, hệ thống cảnh báo nhưng không tự thay đổi công việc.</div>
    <div class="full button-row end"><button type="submit" class="btn primary">Lưu lịch làm</button></div>
    </form>`);
}
async function saveSchedule(form) {
  if(!staff())return;
  const date=cleanDate(form.elements.date.value);
  const mode=trim(form.elements.mode.value),start=trim(form.elements.start.value),end=trim(form.elements.end.value);
  if(!date||!["office","remote","field","off"].includes(mode))return toast("Ngày hoặc hình thức không hợp lệ.");
  if(mode!=="off"&&(!/^\d\d:\d\d$/.test(start)||!/^\d\d:\d\d$/.test(end)||end<=start))return toast("Giờ làm việc không hợp lệ.");
  const data={ownerUid:me.uid,ownerEmail:me.email,date,mode,start:mode==="off"?"":start,end:mode==="off"?"":end,note:trim(form.elements.note.value),updatedAt:iso()};
  const ok=await doWrite(()=>setDoc(doc(db,collectionNames.schedules,me.uid+"_"+date),data),"Đã lưu lịch đi làm.");
  if(ok)closeModal();
}

function targetForWeek(start) {
  const history=appData.kpi?.history||[];
  const prior=history.filter(h=>h.fromWeek<=start).sort((a,b)=>a.fromWeek.localeCompare(b.fromWeek));
  return prior.length?prior[prior.length-1].targets:appData.kpi?.targets||{};
}
function kpiWeekView() {
  return `<div class="toolbar"><div class="button-row">${btn("‹ Tuần trước","week-prev")}<strong>${fmt(ui.week)} – ${fmt(addDays(ui.week,6))}</strong>${btn("Tuần sau ›","week-next")}${btn("Tuần này","week-now")}</div></div>`;
}
function reportId(start) {return "WR-"+start;}
function weeklyReport(start) {return appData.reports.find(r=>r.id===reportId(start));}
function employeeNote(start) {return appData.notes.find(n=>n.id===start+"_"+(staff()?me.uid:n.ownerUid));}
function renderKpi() {
  const stats=weekStats(ui.week),report=weeklyReport(ui.week),latest=(report?.versions||[]).slice(-1)[0];
  const current=JSON.stringify(stats);
  const changed=latest && JSON.stringify(latest.metrics)!==current;
  const note=appData.notes.find(n=>n.week===ui.week);
  const metrics=appData.tasks.filter(t=>t.status!=="cancelled"&&t.due>=ui.week&&t.due<addDays(ui.week,7));
  return `<div class="stack">${kpiWeekView()}
    <div class="grid cols3">${stats.map(kpiCard).join("")}</div>
    <section class="card"><div class="section-head"><h2>Tổng hợp công việc theo tuần</h2>${pill(metrics.length+" việc có deadline")}</div>
      <div class="grid cols3">${metric("Hoàn thành",metrics.filter(t=>t.status==="done").length,"Theo deadline tuần")}${metric("Chưa hoàn thành",metrics.filter(t=>t.status!=="done").length,"Cần theo dõi")}${metric("Chờ duyệt",metrics.filter(t=>t.status==="review").length,"Chưa phản ánh KPI xuất bản")}</div>
    </section>
    <section class="card"><div class="section-head"><h2>Báo cáo & nhận xét</h2>${pill(latest?"Đã chốt V"+report.versions.length:"Chưa chốt",latest?"good":"warn")}</div>
     ${changed?`<div class="notice warn">Dữ liệu KPI đã thay đổi so với bản báo cáo chốt gần nhất. Giám đốc có thể lưu phiên bản điều chỉnh mới.</div>`:""}
     <div class="list-card"><strong>Nhân viên giải trình</strong><p>${safe(note?.explanation||"Chưa nhập nội dung tổng kết tuần.")}</p><p>${safe(note?.proposal||"")}</p></div>
     ${staff()?btn("Viết / sửa giải trình tuần","weekly-note",ui.week):""}
     ${latest?`<div class="list-card"><strong>Đánh giá của Giám đốc – Bản ${report.versions.length}</strong><p>${safe(latest.managerComment||"Không có nhận xét bổ sung.")}</p><p>Xác nhận ${when(latest.confirmedAt)}</p></div>`:""}
     ${manager()?btn(latest?"Xem & chốt bản điều chỉnh":"Xác nhận báo cáo tuần","weekly-confirm",ui.week,"primary"):""}
     ${latest?`<details><summary class="small click">Lịch sử các phiên bản (${report.versions.length})</summary><div class="stack">${report.versions.map((v,i)=>`<div class="list-card"><b>V${i+1} – ${when(v.confirmedAt)}</b><p>${safe(v.reason||"Báo cáo tuần")}</p><p>${safe(v.managerComment||"")}</p></div>`).join("")}</div></details>`:""}
    </section>
    <div class="notice">Sản xuất tính theo ngày nhân viên xác nhận hoàn thành; xuất bản tính theo ngày nhập link đăng. Một sản phẩm chỉ được tính sản xuất một lần và mỗi kênh xuất bản một lần.</div>
  </div>`;
}
function openWeeklyNote(week) {
  if(!staff())return;
  const n=appData.notes.find(x=>x.id===week+"_"+me.uid);
  modal("Giải trình KPI · "+fmt(week),`<form id="weeklyNoteForm" data-week="${safe(week)}" class="stack">
  ${txtarea("explanation","Công việc chưa đạt, nguyên nhân",n?.explanation||"")}
  ${txtarea("proposal","Khó khăn và đề xuất cải thiện",n?.proposal||"")}
  <div class="button-row end"><button class="btn primary" type="submit">Lưu giải trình</button></div></form>`);
}
async function saveWeeklyNote(form) {
  if(!staff())return;
  const week=form.dataset.week;
  const note={week,ownerUid:me.uid,ownerEmail:me.email,explanation:trim(form.elements.explanation.value,4000),proposal:trim(form.elements.proposal.value,4000),updatedAt:iso()};
  const ok=await doWrite(()=>setDoc(doc(db,collectionNames.notes,week+"_"+me.uid),note),"Đã lưu giải trình tuần.");
  if(ok)closeModal();
}
function openWeeklyConfirm(week) {
  if(!manager())return;
  const report=weeklyReport(week),latest=(report?.versions||[]).slice(-1)[0];
  const changed=latest&&JSON.stringify(latest.metrics)!==JSON.stringify(weekStats(week));
  modal(latest?"Xác nhận điều chỉnh báo cáo":"Xác nhận báo cáo KPI",`<form id="weeklyConfirmForm" data-week="${safe(week)}" class="stack">
    <div class="notice ${changed?"warn":""}">Kỳ ${fmt(week)}–${fmt(addDays(week,6))}. ${latest?changed?"Có thay đổi số liệu so với bản chốt trước.":"Số liệu chưa thay đổi; chỉ chốt bản mới khi có lý do.":"Chưa có bản chốt."}</div>
    ${txtarea("managerComment","Nhận xét của Giám đốc",latest?.managerComment||"")}
    ${txtarea("reason","Lý do xác nhận / điều chỉnh",latest?"":"Chốt đánh giá tuần")}
    <div class="button-row end"><button class="btn primary" type="submit">Xác nhận lưu phiên bản</button></div></form>`);
}
async function confirmWeekly(form) {
  if(!manager())return;
  const week=form.dataset.week;
  const ref=doc(db,collectionNames.reports,reportId(week));
  const reason=trim(form.elements.reason.value,1200);
  if(!reason)return toast("Vui lòng nhập lý do để lưu lịch sử.");
  const metrics=weekStats(week);
  const report=weeklyReport(week),old=report?.versions||[];
  if(old.length>=50)return toast("Báo cáo đã có quá nhiều phiên bản. Cần lưu trữ phiên bản cũ.");
  const version={metrics,reason,managerComment:trim(form.elements.managerComment.value,4000),confirmedAt:iso(),confirmedBy:me.uid};
  const payload={week,versions:[...old,version],updatedAt:iso(),updatedBy:me.uid};
  const ok=await doWrite(()=>setDoc(ref,payload),"Đã chốt báo cáo phiên bản V"+(old.length+1)+".");
  if(ok)closeModal();
}
function renderSettings() {
  if(!manager())return empty("Không đủ quyền truy cập.");
  const targets=targetForWeek(nowWeek());
  return `<div class="stack">
    <section class="card"><div class="section-head"><h2>Thiết lập KPI tối thiểu theo tuần</h2>${pill("Giám đốc quản lý")}</div>
      <p class="sub">KPI theo từng kênh, tách số sản phẩm sản xuất và số lượt xuất bản. Chỉ tiêu mới áp dụng từ tuần hiện tại và không làm thay đổi KPI lịch sử.</p>
      <form id="kpiSettingsForm" class="stack">
      <div class="table-wrap"><table class="table"><thead><tr><th>Kênh</th><th>Sản xuất / tuần</th><th>Xuất bản / tuần</th></tr></thead><tbody>
      ${channels.map(c=>`<tr><td><b>${c}</b></td><td><div class="field"><input name="${c}_produce" aria-label="${c} sản xuất" type="number" min="0" max="999" value="${Number(targets[c]?.produce)||0}"></div></td>
        <td><div class="field"><input name="${c}_publish" aria-label="${c} xuất bản" type="number" min="0" max="999" value="${Number(targets[c]?.publish)||0}"></div></td></tr>`).join("")}
      </tbody></table></div><div class="button-row end"><button type="submit" class="btn primary">Lưu KPI tối thiểu</button></div></form>
    </section>
    <section class="card"><h2>Quy tắc duyệt nội dung</h2><p class="sub">Tự nhận diện các nội dung nhạy cảm liên quan visa, học phí, chi phí, tuyển sinh, cam kết hoặc quảng cáo. Giám đốc có quyền bật duyệt thủ công trên bất kỳ công việc nào. Nội dung không thuộc nhóm này không cần duyệt trước khi ghi nhận đã đăng.</p><div class="notice warn">Đây là bộ lọc từ khóa cơ bản, không thay thế kiểm tra pháp lý hoặc kiểm duyệt nội dung. Nhân viên không thể tự xác nhận “Đã duyệt”.</div></section>
    <section class="card"><h2>Telegram Bot – Kết nối an toàn</h2><p class="sub">Đã thống nhất gửi thông báo riêng theo vai trò. V3 chưa gửi Telegram thật: cần Bot Token, hai người chủ động kết nối bot và một dịch vụ máy chủ lưu token bí mật. Không nhập token trực tiếp trên GitHub Pages hoặc trong trình duyệt.</p><div class="notice">Các sự kiện giao việc, phản hồi, gửi duyệt được ghi trong nhật ký Firestore, làm nguồn cho bộ gửi thông báo sau khi cấu hình dịch vụ nền.</div></section>
  </div>`;
}
async function saveTargets(form) {
  if(!manager())return;
  const targets={};
  for(const channel of channels) {
    const produce=Number(form.elements[channel+"_produce"].value),publish=Number(form.elements[channel+"_publish"].value);
    if(!Number.isInteger(produce)||produce<0||produce>999||!Number.isInteger(publish)||publish<0||publish>999)return toast("KPI phải là số nguyên trong khoảng 0–999.");
    targets[channel]={produce,publish};
  }
  const fromWeek=nowWeek();
  const history=(appData.kpi?.history||[]).filter(x=>x.fromWeek!==fromWeek);
  const payload={targets,history:[...history,{fromWeek,targets,updatedBy:me.uid,updatedAt:iso()}].sort((a,b)=>a.fromWeek.localeCompare(b.fromWeek)),updatedAt:iso(),updatedBy:me.uid};
  await doWrite(()=>setDoc(doc(db,collectionNames.kpi,"weekly"),payload),"Đã cập nhật KPI theo kênh.");
}

async function handleAction(action,key) {
  if(action==="go")return go(key);
  if(action==="task")return openTaskDetail(key);
  if(action==="new-task")return openTaskForm();
  if(action==="edit-task"){closeModal();return openTaskForm(key);}
  if(action==="clear-filter"){ui.filter="";return render();}
  if(action==="new-plan")return openPlanNew();
  if(action==="plan")return openPlanDetail(key);
  if(action==="remove-plan-item")return removePlanItem(key);
  if(action==="activate-plan")return activatePlan(key);
  if(action==="pause-plan")return pausePlan(key);
  if(action==="schedule")return openSchedule(key||today());
  if(action==="publish-task")return openPublishForm(taskById(key));
  if(action==="weekly-note")return openWeeklyNote(key);
  if(action==="weekly-confirm")return openWeeklyConfirm(key);
  if(action==="cal-prev"||action==="cal-next") {
    const [y,m]=ui.month.split("-").map(Number);
    ui.month=today(new Date(y,m-1+(action==="cal-next"?1:-1),1)).slice(0,7);
    return render();
  }
  if(action==="cal-today"){ui.month=today().slice(0,7);return render();}
  if(action==="week-prev"){ui.week=addDays(ui.week,-7);return render();}
  if(action==="week-next"){ui.week=addDays(ui.week,7);return render();}
  if(action==="week-now"){ui.week=nowWeek();return render();}
  if(["accept-task","produced-task","submit-review","approve-task","revise-task","require-review","finish-task","cancel-task"].includes(action))return updateTaskAction(key,action);
}
document.addEventListener("click",async e=>{
  const actionEl=e.target.closest("[data-action]");
  if(!actionEl||!me)return;
  e.preventDefault();
  const action=actionEl.dataset.action,key=actionEl.dataset.id||"";
  actionEl.disabled=true;
  try{await handleAction(action,key);}catch(err){toast("Lỗi thao tác: "+errorText(err));console.error(err);}
  finally{if(actionEl.isConnected)actionEl.disabled=false;}
});
document.addEventListener("input",e=>{
  if(e.target.id==="searchTask"&&me) {
    ui.filter=e.target.value;
    const position=e.target.selectionStart;
    render();
    const next=$("searchTask");
    if(next){next.focus();next.setSelectionRange(position,position);}
  }
});
document.addEventListener("change",e=>{
  if(e.target.dataset.layer){
    ui.layers[e.target.dataset.layer]=!!e.target.checked;
    render();
  }
});
document.addEventListener("submit",async e=>{
  if(!me)return;
  const form=e.target;
  if(!["taskForm","publishForm","messageForm","planForm","planItemForm","scheduleForm","weeklyNoteForm","weeklyConfirmForm","kpiSettingsForm"].includes(form.id))return;
  e.preventDefault();
  const submit=form.querySelector('[type="submit"]');
  if(submit)submit.disabled=true;
  try{
    const handles={
      taskForm:saveTaskForm,publishForm:submitPublish,messageForm:submitMessage,
      planForm:savePlanForm,planItemForm:addPlanItem,scheduleForm:saveSchedule,
      weeklyNoteForm:saveWeeklyNote,weeklyConfirmForm:confirmWeekly,kpiSettingsForm:saveTargets
    };
    await handles[form.id](form);
  }catch(err){toast("Lỗi lưu biểu mẫu: "+errorText(err));console.error(err);}
  finally{if(submit?.isConnected)submit.disabled=false;}
});
$("modalClose").addEventListener("click",closeModal);
$("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

function initFirebase(){
  const required=[CONFIG.apiKey,CONFIG.authDomain,CONFIG.projectId,CONFIG.appId,CONFIG.managerEmail,CONFIG.staffEmail];
  if(!required.every(x=>typeof x==="string"&&x&&!x.includes("THAY_"))) {
    $("login-error").textContent="Chưa cấu hình Firebase cho An Châu.";
    $("sign-in").disabled=true;
    return;
  }
  const fbApp=initializeApp({
    apiKey:CONFIG.apiKey,authDomain:CONFIG.authDomain,projectId:CONFIG.projectId,
    appId:CONFIG.appId,messagingSenderId:CONFIG.messagingSenderId||""
  });
  auth=getAuth(fbApp);
  db=getFirestore(fbApp);
  const provider=new GoogleAuthProvider();
  $("sign-in").addEventListener("click",async()=>{
    $("sign-in").disabled=true;$("login-error").textContent="";
    try{await signInWithPopup(auth,provider);}
    catch(e){$("login-error").textContent=errorText(e);}
    finally{$("sign-in").disabled=false;}
  });
  $("sign-out").addEventListener("click",async()=>{
    try{await signOut(auth);}
    catch(e){toast(errorText(e));}
  });
  onAuthStateChanged(auth,async user=>{
    unsubscribeAll();
    if(!user){
      me=null;role=null;
      for(const key of Object.keys(appData))appData[key]=key==="kpi"?null:[];
      $("app").classList.add("hidden");
      $("login").classList.remove("hidden");
      closeModal();return;
    }
    const email=trim(user.email).toLowerCase();
    if(!user.emailVerified||![managerEmail,staffEmail].includes(email)){
      $("login-error").textContent="Email này chưa được cấp quyền truy cập.";
      await signOut(auth);return;
    }
    me=user;role=email===managerEmail?"manager":"staff";
    $("app").classList.remove("hidden");
    $("login").classList.add("hidden");
    $("userLabel").textContent=(manager()?"Giám đốc":"Nhân viên")+" · "+email;
    ui.view="dashboard";ui.week=nowWeek();
    render();
    subscriptions();
  });
  setInterval(()=>{if(me)generateRecurring().catch(e=>console.warn(e));},30*60*1000);
}
initFirebase();
