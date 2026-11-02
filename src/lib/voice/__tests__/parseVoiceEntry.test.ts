import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVoiceEntry, numberWordsToDigits } from "../parseVoiceEntry";

test("voice: number words become digits", () => {
  assert.equal(numberWordsToDigits("fifty two workers"), "52 workers");
  assert.equal(numberWordsToDigits("one hundred and five"), "105");
  assert.equal(numberWordsToDigits("ek sau bees"), "120");
  assert.equal(numberWordsToDigits("do machines"), "2 machines");
  assert.equal(numberWordsToDigits("five six"), "5 6");
});

test("voice: English daily report", () => {
  const { fields } = parseVoiceEntry("45 workers 6 machines progress 32 percent weather clear 2 hours lost delay reason material shortage remarks slab casting done");
  assert.equal(fields.workers, 45);
  assert.equal(fields.machines, 6);
  assert.equal(fields.progress, 32);
  assert.equal(fields.hoursLost, 2);
  assert.equal(fields.weather, "Clear");
  assert.equal(fields.reason, "Material shortage");
  assert.equal(fields.remarks, "Slab casting done");
});

test("voice: keyword before number and spoken numbers", () => {
  const { fields } = parseVoiceEntry("workers are fifty two machines eight progress is 41.5");
  assert.equal(fields.workers, 52);
  assert.equal(fields.machines, 8);
  assert.equal(fields.progress, 41.5);
});

test("voice: Hinglish", () => {
  const { fields } = parseVoiceEntry("aaj 60 mazdoor the, 4 machine, progress 25 percent, barish ki wajah se 3 ghante gaye, heavy rain");
  assert.equal(fields.workers, 60);
  assert.equal(fields.machines, 4);
  assert.equal(fields.progress, 25);
  assert.equal(fields.hoursLost, 3);
  assert.equal(fields.weather, "Heavy rain");
  assert.equal(fields.reason, "Weather");
});

test("voice: Devanagari digits and keywords", () => {
  const { fields } = parseVoiceEntry("५० मजदूर ३ मशीन प्रगति २० प्रतिशत");
  assert.equal(fields.workers, 50);
  assert.equal(fields.machines, 3);
  assert.equal(fields.progress, 20);
});

test("voice: out-of-range progress and unrelated text are ignored", () => {
  assert.deepEqual(parseVoiceEntry("hello this is nothing").found, []);
  assert.equal(parseVoiceEntry("150 percent").fields.progress, undefined);
  assert.equal(parseVoiceEntry("4.5 workers").fields.workers, undefined);
});
