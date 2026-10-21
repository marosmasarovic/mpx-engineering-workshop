import assert from "node:assert/strict";
import test from "node:test";
import { scoreJob, rankJobs } from "../server/matching.js";
import { primaryJobs } from "../server/seed-data.js";
import { getCandidateById } from "../server/candidates.js";

test("exact skill matches and location produce an explainable score", () => {
  const result = scoreJob(primaryJobs[0], getCandidateById("candidate-001"));
  assert.equal(result.score, 90);
  assert.equal(result.matchedCount, 3);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matched), [true, true, true, false]);
  assert.equal(result.locationFits, true);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "exact", "exact", "related"]);
  assert.deepEqual(result.skillBreakdown.map((item) => item.contribution), [20, 20, 20, 10]);
});

test("a direct specific skill earns half credit for a broader requirement", () => {
  const job = { location: "Bern", workMode: "Hybrid", skills: ["Frontend development"] };
  const candidate = { location: "Zurich", skills: ["React"] };
  const result = scoreJob(job, candidate);
  assert.equal(result.score, 40);
  assert.equal(result.matchedCount, 0);
  assert.deepEqual(result.skillBreakdown[0], {
    skill: "Frontend development", matched: false, matchType: "related",
    candidateSkill: "React", credit: 0.5, contribution: 40,
    reason: "Related via React — 50% credit",
  });
});

test("remote roles count as a location fit and ranking is stable", () => {
  const candidate = getCandidateById("candidate-003");
  const ranked = rankJobs(primaryJobs, candidate);
  assert.equal(ranked[0].id, "job-103");
  assert.equal(ranked[0].match.locationFits, true);
});

function scoreSkills(required, available, overrides = {}) {
  return scoreJob(
    { location: "Bern", workMode: "Hybrid", skills: required, ...overrides },
    { location: "Zurich", skills: available },
  );
}

test("exact-only scores and normalized matching retain full credit", () => {
  const result = scoreSkills([" React ", "SQL", "Unrelated"], ["react", " sql "]);
  assert.equal(result.score, 53);
  assert.equal(result.matchedCount, 2);
  assert.deepEqual(result.skillBreakdown.map((item) => item.credit), [1, 1, 0]);
  assert.equal(scoreSkills(["React"], ["React"], { location: "Zurich" }).score, 100);
});

test("related lookup normalizes both sides", () => {
  assert.equal(scoreSkills([" frontend DEVELOPMENT "], [" reACT "]).score, 40);
});

test("unrelated, reverse, sibling, and unlisted relationships remain missing", () => {
  for (const [required, available] of [
    ["SQL", "React"],
    ["React", "Frontend development"],
    ["TypeScript", "Python"],
    ["Programming languages", "React"],
  ]) {
    const result = scoreSkills([required], [available]);
    assert.equal(result.score, 0);
    assert.equal(result.skillBreakdown[0].matchType, "missing");
    assert.equal(result.skillBreakdown[0].candidateSkill, null);
    assert.equal(result.skillBreakdown[0].reason, "Not found");
  }
});

test("multiple related skills never stack and explanations ignore candidate order", () => {
  const first = scoreSkills(["Data engineering"], ["SQL", "Data pipelines", "SQL"]);
  const reversed = scoreSkills(["Data engineering"], ["Data pipelines", "SQL"]);
  assert.equal(first.score, 40);
  assert.equal(first.skillBreakdown[0].credit, 0.5);
  assert.deepEqual(first, reversed);
  assert.deepEqual(first, scoreSkills(["Data engineering"], ["SQL", "Data pipelines"]));
});

test("exact evidence wins over related evidence", () => {
  const result = scoreSkills(["Frontend development"], ["React", "Frontend development"]);
  assert.equal(result.score, 80);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.skillBreakdown[0].matchType, "exact");
  assert.equal(result.skillBreakdown[0].credit, 1);
});

test("one candidate skill may support distinct requirements", () => {
  const result = scoreSkills(["React", "Frontend development"], ["React"]);
  assert.equal(result.score, 60);
  assert.equal(result.matchedCount, 1);
  assert.deepEqual(result.skillBreakdown.map((item) => item.contribution), [40, 20]);
});

test("location and remote bonuses stay independent of partial skill credit", () => {
  assert.equal(scoreSkills(["Frontend development"], ["React"]).score, 40);
  const remote = scoreSkills(["Frontend development"], ["React"], { workMode: "Remote" });
  assert.equal(remote.score, 60);
  assert.equal(remote.locationFits, true);
  assert.equal(remote.locationScore, 20);
  assert.equal(scoreSkills(["SQL"], ["React"], { workMode: "Remote" }).score, 20);
});

test("empty skills retain zero skill points and scores remain explainable within bounds", () => {
  for (const required of [[], ["React"], ["Frontend development"], ["React", "Frontend development", "SQL"]]) {
    for (const available of [[], ["React"], ["React", "SQL", "Frontend development"]]) {
      for (const workMode of ["Hybrid", "Remote"]) {
        const result = scoreSkills(required, available, { workMode });
        const points = result.skillBreakdown.reduce((sum, item) => sum + item.contribution, 0);
        assert.equal(result.score, Math.round(points + result.locationScore));
        assert.ok(result.score >= 0 && result.score <= 100);
        assert.deepEqual(result, scoreSkills(required, available, { workMode }));
      }
    }
  }
  assert.equal(scoreSkills([], ["React"]).score, 0);
  assert.equal(scoreSkills([], ["React"], { workMode: "Remote" }).score, 20);
});

test("equal scores still rank by title", () => {
  const jobs = ["Zebra", "Alpha"].map((title) => ({
    title, skills: ["Frontend development"], location: "Bern", workMode: "Hybrid",
  }));
  assert.deepEqual(rankJobs(jobs, { skills: ["React"], location: "Zurich" }).map((job) => job.title), ["Alpha", "Zebra"]);
});
