import test from "node:test";
import assert from "node:assert/strict";
import worker, {staffEmails, authorized, constantTimeEqual, parseFirestore, vnDate, dayGap, eventNotification} from "../src/index.js";

const env={
  STAFF_EMAILS:"phongspotify00@gmail.com,hathu0374@gmail.com",
  MANAGER_EMAIL:"phonganh99@gmail.com",
  APP_URL:"https://phonganh99.github.io/an-chau-marketing/v3.html",
};
const task={id:"MK-abc",title:"Video du học",source:"assigned",assigneeEmail:"hathu0374@gmail.com",due:"2026-10-29"};

test("three allowed accounts; outsiders denied",()=>{
  assert.equal(staffEmails(env).length,2);
  assert.equal(authorized(env,"phonganh99@gmail.com"),true);
  assert.equal(authorized(env,"hathu0374@gmail.com"),true);
  assert.equal(authorized(env,"outsider@gmail.com"),false);
});
test("constant-time comparison returns only matching input",()=>{
  assert.equal(constantTimeEqual("abcd","abcd"),true);
  assert.equal(constantTimeEqual("abcd","abcc"),false);
  assert.equal(constantTimeEqual("abcd","abc"),false);
});
test("Firestore maps parse without losing document id",()=>{
  const entry=parseFirestore({name:"projects/p/databases/(default)/documents/marketingTasks/MK-abc",fields:{title:{stringValue:"Video"},created:{booleanValue:false},priority:{integerValue:"5"}}});
  assert.deepEqual({id:entry.id,title:entry.title,created:entry.created,priority:entry.priority},{id:"MK-abc",title:"Video",created:false,priority:5});
});
test("Vietnam dates and reminder dates handle UTC rollover",()=>{
  assert.equal(vnDate(new Date("2026-10-27T18:15:00Z")),"2026-10-28");
  assert.equal(dayGap("2026-10-28","2026-10-27"),1);
  assert.equal(dayGap("2026-10-25","2026-10-27"),-2);
});
test("each event targets only the correct recipient",()=>{
  assert.equal(eventNotification(env,{type:"task_created"},task).email,"hathu0374@gmail.com");
  assert.equal(eventNotification(env,{type:"message",detail:"question"},task).email,"phonganh99@gmail.com");
  assert.equal(eventNotification(env,{type:"message",detail:"reply"},task).email,"hathu0374@gmail.com");
  assert.equal(eventNotification(env,{type:"submit-review"},task).email,"phonganh99@gmail.com");
  assert.equal(eventNotification(env,{type:"approve-task"},task).email,"hathu0374@gmail.com");
  assert.equal(eventNotification(env,{type:"revise-task"},task).email,"hathu0374@gmail.com");
  assert.equal(eventNotification(env,{type:"task_updated"},task),null);
});
test("Telegram deep links point to one task",()=>{
  assert.ok(eventNotification(env,{type:"task_created"},task).text.endsWith("#task=MK-abc"));
});
test("worker health route is public and does not expose secrets",async()=>{
  const response=await worker.fetch(new Request("https://example.workers.dev/health"),{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.service,"an-chau-telegram");
  assert.equal(body.ok,true);
});
test("webhook without secret is rejected",async()=>{
  const response=await worker.fetch(new Request("https://example.workers.dev/telegram/webhook",{method:"POST",body:"{}"}),{TELEGRAM_WEBHOOK_SECRET:"secret"});
  assert.equal(response.status,403);
});
