import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, detectIntents, findNamed } from "../answer";

const f = { signedNum: (n: number) => (n > 0 ? `+${n}` : `${n}`), fmtMoney: (n: number) => `Rs ${n}`, fmtDMY: (d: string) => d };
const project = { id: "p1", name: "Ring Road" };
const S: any = {
  hasAnyData: true, status: "Behind", delayDays: 6, forecastEnd: "2027-04-10", projectedDelay: 10,
  progress: { planned: 40, actual: 32, variance: -8 }, plan: { endDate: "2027-03-31" },
  health: { score: 62, level: "At Risk" },
  alerts: [{ title: "Activity delayed: Earthwork" }, { title: "CPI below 0.9" }],
  cost: { AC: 500, BAC: 2000, usedPct: 25, CPI: 0.88, EAC: 2270 },
  safety: { total: 2, open: [1], daysSince: 9, lti: 0 },
  contractors: [{ name: "Shree Infra", activities: 3, spi: 0.82, delayed: 2 }, { name: "Om Builders", activities: 2, spi: 1.02, delayed: 0 }],
  act: { rows: [
    { name: "Earthwork – embankment", actualPct: 44, plannedPct: 55, status: "Delayed", delayDays: 9, forecastEnd: "2027-01-12", projectedDelay: 12, lastLog: "2026-10-30" },
    { name: "Bridge foundation", actualPct: 42, plannedPct: 40, status: "On Track", delayDays: 0, lastLog: "2026-10-31" },
  ] },
  tr: { latest: { date: "2026-10-31", workers: 77, plannedWorkers: 90, machines: 9, plannedMachines: 12, weather: "Rain", reason: "Weather" }, resources: { workerShort: 14, compDays: 10 }, rows: [{ hoursLost: 2 }, { hoursLost: 3 }] },
};

test("copilot: picks the right topic", () => {
  assert.deepEqual(detectIntents("What is delayed?"), ["delay"]);
  assert.deepEqual(detectIntents("Cost status"), ["cost"]);
  assert.deepEqual(detectIntents("kitna kharch hua"), ["cost"]);
  assert.deepEqual(detectIntents("project kab tak complete hoga"), ["forecast"]);
  assert.deepEqual(detectIntents("safety summary"), ["safety"]);
  assert.deepEqual(detectIntents("आज कितने मजदूर हैं"), ["workforce"]);
  assert.deepEqual(detectIntents("barish ki wajah se deri hui kya"), ["delay", "weather"]);
});

test("copilot: words that used to hit the wrong topic", () => {
  assert.ok(!detectIntents("what is the weather today").includes("focus"));
  assert.ok(!detectIntents("how much money is left").includes("forecast"));
  assert.match(answerQuestion("what is the weather", S, project, f), /Rain/);
  assert.match(answerQuestion("how many workers today", S, project, f), /77 workers \(planned 90\)/);
});

test("copilot: answers use the real numbers", () => {
  assert.match(answerQuestion("What is delayed?", S, project, f), /32% against 40% planned/);
  assert.match(answerQuestion("cost status", S, project, f), /CPI is 0\.88 \(over budget/);
  assert.match(answerQuestion("when will it finish", S, project, f), /2027-04-10 versus 2027-03-31/);
  assert.match(answerQuestion("safety", S, project, f), /2 incident\(s\) logged, 1 still open/);
  assert.match(answerQuestion("which contractor is worst", S, project, f), /Shree Infra/);
});

test("copilot: a named activity gets its own answer", () => {
  assert.match(answerQuestion("How is Earthwork going?", S, project, f), /Earthwork – embankment: 44% done against 55% planned \(Delayed\)/);
  assert.match(answerQuestion("bridge foundation ka status", S, project, f), /Bridge foundation: 42%/);
  assert.equal(findNamed("tell me about drainage", S.act.rows), null);
});

test("copilot: says so when it does not understand, instead of dumping random alerts", () => {
  const a = answerQuestion("who won the cricket match", S, project, f);
  assert.match(a, /not sure what you mean/);
  assert.doesNotMatch(a, /alert\(s\) open/);
  assert.match(answerQuestion("hello", S, project, f), /answer only from the plan/);
});

test("copilot: empty project / no data", () => {
  assert.equal(answerQuestion("delay", S, null, f), "There is no project yet.");
  assert.match(answerQuestion("delay", { ...S, hasAnyData: false }, project, f), /No data is entered/);
});
