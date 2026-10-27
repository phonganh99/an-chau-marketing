// AN CHÂU Marketing V3 — Telegram gateway on Cloudflare Workers Free.
// Secrets: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, GCP_SERVICE_ACCOUNT_JSON, PAIRING_PEPPER.
// No secret belongs in this file or in the GitHub Pages frontend.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
});
const isEmail = (x) => typeof x === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const staffEmails = (env) => String(env.STAFF_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(isEmail);
const managerEmail = (env) => String(env.MANAGER_EMAIL || "").trim().toLowerCase();
const authorized = (env, email) => email === managerEmail(env) || staffEmails(env).includes(email);
const base64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
const sha256 = async (s) => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s))));
const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let delta = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) delta |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return delta === 0;
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {status, headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra}});
const cors = (req, env) => {
  const origin = req.headers.get("Origin");
  return origin === env.APP_ORIGIN ? {
    "Access-Control-Allow-Origin": env.APP_ORIGIN,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  } : {"Vary": "Origin"};
};
const withCors = (res, headers) => {
  const next = new Response(res.body, res);
  for (const [key, value] of Object.entries(headers)) next.headers.set(key, value);
  return next;
};

let googleCerts;
let serviceToken;
async function verifiedUser(req, env) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authHeader)) throw Error("Unauthorized");
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) throw Error("Invalid token");
  const header = JSON.parse(decoder.decode(fromBase64url(parts[0])));
  const payload = JSON.parse(decoder.decode(fromBase64url(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || !header.kid || !payload.sub ||
      payload.aud !== env.FIREBASE_PROJECT_ID ||
      payload.iss !== "https://securetoken.google.com/" + env.FIREBASE_PROJECT_ID ||
      !(payload.exp > now && payload.iat <= now && payload.auth_time <= now) ||
      payload.email_verified !== true || payload.firebase?.sign_in_provider !== "google.com") throw Error("Invalid token claims");
  const email = String(payload.email || "").trim().toLowerCase();
  if (!authorized(env, email)) throw Error("Account not authorized");
  if (!googleCerts || Date.now() > googleCerts.expires) {
    const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    if (!response.ok) throw Error("Unable to fetch signing keys");
    const data = await response.json();
    googleCerts = {keys: data.keys || [], expires: Date.now() + 30 * 60 * 1000};
  }
  let jwk = googleCerts.keys.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) {
    googleCerts = null;
    const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    if (!response.ok) throw Error("Unable to refresh Firebase signing keys");
    const data = await response.json();
    googleCerts = {keys: data.keys || [], expires: Date.now() + 30 * 60 * 1000};
    jwk = googleCerts.keys.find(k => k.kid === header.kid && k.kty === "RSA");
  }
  if (!jwk) throw Error("Unrecognized Firebase signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64url(parts[2]), encoder.encode(parts[0] + "." + parts[1]))) throw Error("Token signature invalid");
  return {uid: payload.sub, email, manager: email === managerEmail(env)};
}

async function firebaseAccessToken(env) {
  if (serviceToken && Date.now() < serviceToken.expires) return serviceToken.token;
  const credentials = JSON.parse(env.GCP_SERVICE_ACCOUNT_JSON || "{}");
  if (!credentials.client_email || !credentials.private_key || credentials.project_id !== env.FIREBASE_PROJECT_ID) throw Error("Service account not configured correctly");
  const pem = credentials.private_key.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const pkcs8 = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const rsaKey = await crypto.subtle.importKey("pkcs8", pkcs8, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(encoder.encode(JSON.stringify({alg: "RS256", typ: "JWT"})));
  const payload = base64url(encoder.encode(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const assertion = head + "." + payload;
  const signed = base64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsaKey, encoder.encode(assertion))));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion + "." + signed}),
  });
  if (!response.ok) throw Error("Service account OAuth token failure " + response.status);
  const result = await response.json();
  if (!result.access_token) throw Error("Service account OAuth response has no token");
  serviceToken = {token: result.access_token, expires: Date.now() + Math.max(60, Number(result.expires_in || 3600) - 120) * 1000};
  return serviceToken.token;
}
const firestoreBase = env => "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(env.FIREBASE_PROJECT_ID) + "/databases/(default)/documents";
function firestoreValue(value) {
  if (value?.stringValue !== undefined) return value.stringValue;
  if (value?.integerValue !== undefined) return Number(value.integerValue);
  if (value?.booleanValue !== undefined) return value.booleanValue;
  if (value?.arrayValue !== undefined) return (value.arrayValue.values || []).map(firestoreValue);
  if (value?.mapValue !== undefined) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, val]) => [key, firestoreValue(val)]));
  if (value?.nullValue !== undefined) return null;
  return undefined;
}
function parseFirestore(doc) {
  const fields = Object.fromEntries(Object.entries(doc.fields || {}).map(([key, val]) => [key, firestoreValue(val)]));
  const name = String(doc.name || "");
  return {...fields, id: name.substring(name.lastIndexOf("/") + 1)};
}
async function firestoreRequest(env, path, init = {}) {
  const url = firestoreBase(env) + path;
  const response = await fetch(url, {
    ...init,
    headers: {"Authorization": "Bearer " + await firebaseAccessToken(env), "Content-Type": "application/json", ...(init.headers || {})},
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error("Firestore REST error (" + response.status + ")");
  return response.json();
}
async function getTask(env, id) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id || "")) return null;
  const result = await firestoreRequest(env, "/marketingTasks/" + id);
  return result ? parseFirestore(result) : null;
}
async function getNewEvents(env, since) {
  const query = {structuredQuery: {
    from: [{collectionId: "marketingEvents"}],
    where: {fieldFilter: {field: {fieldPath: "createdAt"}, op: "GREATER_THAN", value: {stringValue: since}}},
    orderBy: [{field: {fieldPath: "createdAt"}, direction: "ASCENDING"}],
    limit: 15,
  }};
  const result = await firestoreRequest(env, ":runQuery", {method: "POST", body: JSON.stringify(query)});
  return (Array.isArray(result) ? result : []).filter(x => x.document).map(x => parseFirestore(x.document));
}
async function getTasksForReminders(env) {
  let pageToken = "", all = [];
  for (let i = 0; i < 3; i++) {
    const params = new URLSearchParams({pageSize: "100"});
    if (pageToken) params.set("pageToken", pageToken);
    const result = await firestoreRequest(env, "/marketingTasks?" + params);
    if (!result) break;
    all.push(...(result.documents || []).map(parseFirestore));
    pageToken = result.nextPageToken || "";
    if (!pageToken) break;
  }
  return all;
}
async function botApi(env, method, body) {
  if (!env.BOT_TOKEN) throw Error("Telegram token not configured");
  const result = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || !data.ok) throw Error("Telegram API " + method + " failed (" + result.status + ")");
  return data.result;
}
async function botMessage(env, chatId, text) {
  return botApi(env, "sendMessage", {chat_id: chatId, text: String(text).slice(0, 3500), disable_web_page_preview: true});
}
async function linkEmail(env, email) {
  return env.DB.prepare("SELECT email, chat_id FROM telegram_links WHERE email=?").bind(email).first();
}
async function sendOnce(env, key, email, text) {
  if (!authorized(env, email)) return false;
  const linked = await linkEmail(env, email);
  if (!linked) return false;
  const now = Date.now(), until = now - 5 * 60 * 1000;
  const claimed = await env.DB.prepare(
    "INSERT INTO deliveries(id,email,status,attempts,updated_ms) VALUES(?,?,'sending',1,?) " +
    "ON CONFLICT(id) DO UPDATE SET status='sending',attempts=attempts+1,updated_ms=excluded.updated_ms " +
    "WHERE deliveries.status!='sent' AND deliveries.updated_ms<?"
  ).bind(key, email, now, until).run();
  if (!claimed.meta?.changes) return false;
  try {
    await botMessage(env, linked.chat_id, text);
    await env.DB.prepare("UPDATE deliveries SET status='sent',updated_ms=? WHERE id=?").bind(Date.now(), key).run();
    await env.DB.prepare("DELETE FROM pending_notifications WHERE id=?").bind(key).run();
    return true;
  } catch (err) {
    await env.DB.prepare("UPDATE deliveries SET status='retry',updated_ms=? WHERE id=?").bind(Date.now(), key).run();
    await env.DB.prepare("INSERT INTO pending_notifications(id,email,text,status,attempts,updated_ms) VALUES(?,?,?,'retry',1,?) " +
      "ON CONFLICT(id) DO UPDATE SET status='retry',attempts=attempts+1,updated_ms=excluded.updated_ms")
      .bind(key,email,text,Date.now()).run();
    console.error("Unable to deliver Telegram message", String(err));
    return false;
  }
}
function eventNotification(env, event, task) {
  const person = String(task?.assigneeEmail || "phongspotify00@gmail.com").toLowerCase();
  const manager = managerEmail(env);
  const subject = String(task?.title || "Công việc").slice(0, 140);
  const link = env.APP_URL + "#task=" + encodeURIComponent(task.id);
  if (event.type === "task_created" && task.source === "assigned") return {email: person, text: "AN CHÂU · Việc mới được giao\n" + subject + "\nHạn: " + (task.due || "Chưa có") + "\n" + link};
  if (event.type === "message" && event.detail === "question") return {email: manager, text: "AN CHÂU · Nhân viên hỏi lại yêu cầu\n" + subject + "\nMở công việc: " + link};
  if (event.type === "message" && event.detail === "reply") return {email: person, text: "AN CHÂU · Có phản hồi cho công việc\n" + subject + "\n" + link};
  if (event.type === "submit-review") return {email: manager, text: "AN CHÂU · Nội dung cần duyệt\n" + subject + "\n" + link};
  if (event.type === "approve-task") return {email: person, text: "AN CHÂU · Nội dung đã được duyệt\n" + subject + "\n" + link};
  if (event.type === "revise-task") return {email: person, text: "AN CHÂU · Nội dung cần chỉnh sửa\n" + subject + "\n" + link};
  return null;
}
async function processEvents(env) {
  // The first scheduled run is the activation boundary: do not send old notifications.
  const cursor = await env.DB.prepare("SELECT value FROM metadata WHERE key='events_cursor'").first();
  if (!cursor) {
    await env.DB.prepare("INSERT OR IGNORE INTO metadata(key,value) VALUES('events_cursor',?)").bind(new Date().toISOString()).run();
    return;
  }
  const events = await getNewEvents(env, cursor.value);
  const taskCache = new Map();
  for (const event of events) {
    if (event.taskId && !taskCache.has(event.taskId)) taskCache.set(event.taskId, await getTask(env, event.taskId));
    const task = taskCache.get(event.taskId);
    if (task) {
      const notification = eventNotification(env, event, task);
      if (notification) await sendOnce(env, "event:" + event.id + ":" + notification.email, notification.email, notification.text);
    }
    // Advance only after processing: failed sends are tracked in D1 for independent retry.
    if (event.createdAt) {
      await env.DB.prepare("UPDATE metadata SET value=? WHERE key='events_cursor' AND value<?").bind(event.createdAt, event.createdAt).run();
    }
  }
  await retryFailed(env);
}
async function retryFailed(env) {
  // Retries are stored in D1, not reconstructed from old Firestore events.
  // A failed original Telegram send is safe to retry after the next cron interval.
  const pending = await env.DB.prepare("SELECT id,email,text FROM pending_notifications WHERE status='retry' AND attempts<5 AND updated_ms<? ORDER BY updated_ms LIMIT 20").bind(Date.now()-5*60*1000).all();
  for (const row of (pending.results || [])) {
    const sent = await sendOnce(env, row.id, row.email, row.text);
    if (sent) await env.DB.prepare("DELETE FROM pending_notifications WHERE id=?").bind(row.id).run();
    // sendOnce logs a retry only after a real attempted send; do not double count skipped leases.
  }
}
const vnDate = (d) => {
  const parts = Object.fromEntries(DATE_FORMAT.formatToParts(d).map(x => [x.type, x.value]));
  return parts.year + "-" + parts.month + "-" + parts.day;
};
const dayGap = (due, current) => Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(current + "T00:00:00Z")) / 86400000);
async function processReminders(env) {
  const day = vnDate(new Date());
  const todos = await getTasksForReminders(env);
  for (const task of todos) {
    if (!task.due || !/^\d{4}-\d{2}-\d{2}$/.test(task.due) || ["done", "cancelled"].includes(task.status)) continue;
    const gap = dayGap(task.due, day);
    const phase = gap === 1 ? "tomorrow" : gap === 0 ? "today" : gap < 0 ? "overdue" : "";
    if (!phase) continue;
    const receiver = String(task.assigneeEmail || "phongspotify00@gmail.com").toLowerCase();
    if (!staffEmails(env).includes(receiver)) continue;
    const headline = {tomorrow: "Sắp đến hạn ngày mai", today: "Đến hạn hôm nay", overdue: "Công việc quá hạn"}[phase];
    const text = "AN CHÂU · " + headline + "\n" + String(task.title || "Công việc").slice(0, 140) +
      "\nDeadline: " + task.due + "\n" + env.APP_URL + "#task=" + encodeURIComponent(task.id);
    await sendOnce(env, "deadline:" + task.id + ":" + phase + ":" + receiver, receiver, text);
    if (phase === "overdue") await sendOnce(env, "overdue:" + task.id + ":" + managerEmail(env), managerEmail(env),
      "AN CHÂU · Việc quá hạn\n" + String(task.title || "Công việc").slice(0, 140) + "\n" + env.APP_URL + "#task=" + encodeURIComponent(task.id));
  }
}
async function pairingCode(env, email, uid) {
  const old = await env.DB.prepare("SELECT created_at FROM pairing_codes WHERE email=?").bind(email).first();
  if (old && Date.now() - old.created_at < 60000) return {error: "Đợi ít nhất 1 phút trước khi tạo mã mới.", status: 429};
  const code = base64url(crypto.getRandomValues(new Uint8Array(18)));
  const digest = await sha256(env.PAIRING_PEPPER + ":" + code);
  await env.DB.prepare("DELETE FROM pairing_codes WHERE email=?").bind(email).run();
  await env.DB.prepare("INSERT INTO pairing_codes(code_hash,email,uid,expires_at,created_at) VALUES(?,?,?,?,?)")
    .bind(digest, email, uid, Date.now() + 10 * 60000, Date.now()).run();
  const username = String(env.BOT_USERNAME || "").replace("@", "");
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) throw Error("BOT_USERNAME is not configured");
  return {url: "https://t.me/" + username + "?start=" + code, expiresInSeconds: 600};
}
async function linkViaTelegram(env, chatId, code) {
  if (!/^[A-Za-z0-9_-]{20,32}$/.test(code || "")) return false;
  const digest = await sha256(env.PAIRING_PEPPER + ":" + code);
  const existing = await env.DB.prepare("SELECT email,uid FROM pairing_codes WHERE code_hash=? AND expires_at>?").bind(digest, Date.now()).first();
  if (!existing || !authorized(env, existing.email)) return false;
  await env.DB.prepare("INSERT INTO telegram_links(email,uid,chat_id,linked_at) VALUES(?,?,?,?) " +
    "ON CONFLICT(email) DO UPDATE SET uid=excluded.uid,chat_id=excluded.chat_id,linked_at=excluded.linked_at")
    .bind(existing.email, existing.uid, chatId, Date.now()).run();
  await env.DB.prepare("DELETE FROM pairing_codes WHERE code_hash=?").bind(digest).run();
  return true;
}
async function handleWebhook(env, request) {
  if (!constantTimeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token"), env.TELEGRAM_WEBHOOK_SECRET)) return json({ok:false}, 403);
  if (Number(request.headers.get("content-length") || 0) > 100000) return json({ok:false}, 413);
  const update = await request.json();
  const updateId = update?.update_id;
  if (!Number.isSafeInteger(updateId)) return json({ok:true});
  const reserved = await env.DB.prepare("INSERT OR IGNORE INTO webhook_updates(update_id,created_at) VALUES(?,?)").bind(updateId, Date.now()).run();
  if (!reserved.meta?.changes) return json({ok:true});
  const message = update?.message;
  if (message?.chat?.type !== "private" || !Number.isSafeInteger(message.chat.id)) return json({ok:true});
  const chat = message.chat.id;
  const text = String(message.text || "").trim();
  try {
    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] || "";
      if (await linkViaTelegram(env, chat, code)) await botMessage(env, chat, "✅ AN CHÂU: Đã liên kết Telegram thành công. Thông báo công việc sẽ gửi riêng tại đây.");
      else await botMessage(env, chat, "Chào mừng đến với AN CHÂU. Vào website Marketing → Telegram → Lấy liên kết để kết nối tài khoản Google.");
    } else if (text === "/stop") {
      await env.DB.prepare("DELETE FROM telegram_links WHERE chat_id=?").bind(chat).run();
      await botMessage(env, chat, "Đã ngắt liên kết. Bạn có thể kết nối lại từ website Marketing.");
    } else if (text === "/status") {
      const link = await env.DB.prepare("SELECT email FROM telegram_links WHERE chat_id=?").bind(chat).first();
      await botMessage(env, chat, link ? "Tài khoản đang liên kết: " + link.email : "Chưa liên kết tài khoản Marketing.");
    }
  } catch (err) {
    console.error("Telegram webhook processing failed", String(err));
    await env.DB.prepare("DELETE FROM webhook_updates WHERE update_id=?").bind(updateId).run();
    return json({ok:false}, 503);
  }
  return json({ok:true});
}
async function handleAuthed(request, env, path) {
  const user = await verifiedUser(request, env);
  if (path === "/api/me" && request.method === "GET") {
    const linked = await linkEmail(env, user.email);
    return json({email:user.email,role:user.manager?"manager":"staff",connected:!!linked,botUsername:env.BOT_USERNAME});
  }
  if (path === "/api/pair-code" && request.method === "POST") {
    if (!env.PAIRING_PEPPER) throw Error("PAIRING_PEPPER is not configured");
    const result = await pairingCode(env, user.email, user.uid);
    return json(result.error ? {error:result.error} : result, result.status || 200);
  }
  if (path === "/api/unlink" && request.method === "POST") {
    await env.DB.prepare("DELETE FROM telegram_links WHERE email=?").bind(user.email).run();
    await env.DB.prepare("DELETE FROM pairing_codes WHERE email=?").bind(user.email).run();
    return json({connected:false});
  }
  if (path === "/api/configure-webhook" && request.method === "POST") {
    if (!user.manager) return json({error:"Only director can configure webhook"},403);
    const workerUrl = String(env.PUBLIC_WORKER_URL || "");
    if (!/^https:\/\/[a-zA-Z0-9.-]+\.workers\.dev$/.test(workerUrl) || !env.TELEGRAM_WEBHOOK_SECRET || !env.BOT_TOKEN) return json({error:"Cấu hình webhook chưa đầy đủ. Vui lòng kiểm tra PUBLIC_WORKER_URL, BOT_TOKEN và TELEGRAM_WEBHOOK_SECRET đang ở Production. Không chia sẻ giá trị Secret."},409);
    await botApi(env, "setWebhook", {url:workerUrl+"/telegram/webhook",secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:["message"],drop_pending_updates:true});
    return json({ok:true,message:"Telegram webhook configured"});
  }
  return json({error:"Not found"},404);
}
async function runScheduled(env, cron) {
  if (!env.DB) throw Error("D1 database not bound");
  if (cron === "0 2 * * *") return processReminders(env);
  return processEvents(env);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname, c = cors(request, env);
    try {
      if (request.method === "GET" && path === "/health") return json({ok:true,service:"an-chau-telegram",version:"1.0.0"});
      if (path === "/telegram/webhook" && request.method === "POST") return handleWebhook(env, request);
      if (path.startsWith("/api/")) {
        if (request.method === "OPTIONS") return withCors(new Response(null,{status:204}), c);
        if (request.headers.get("Origin") && request.headers.get("Origin") !== env.APP_ORIGIN) return json({error:"Origin not allowed"},403,c);
        return withCors(await handleAuthed(request, env, path), c);
      }
      return json({error:"Not found"},404);
    } catch (err) {
      console.error("Worker request failed:", String(err));
      return json({error:"Request failed. Please check the Worker configuration and account permissions."},500,c);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env,controller.cron).catch(e=>console.error("Telegram cron error:",String(e))));
  },
};

export { staffEmails, authorized, constantTimeEqual, parseFirestore, vnDate, dayGap, eventNotification };
