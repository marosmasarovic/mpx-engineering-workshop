import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogSummary, getJobById, listJobs } from "../server/catalog.js";

test("catalog deduplicates by canonical role and prefers the direct listing", () => {
  const jobs = listJobs();
  const copies = jobs.filter((job) => job.canonicalId === "role-101");
  assert.equal(copies.length, 1);
  assert.equal(copies[0].id, "job-101");
  assert.equal(copies[0].source, "Direct");
  assert.deepEqual(getCatalogSummary(), { visibleListings: 7, uniqueRoles: 7, partnerListings: 1 });
  assert.deepEqual(jobs.map((job) => job.id), [
    "job-101", "job-102", "job-103", "job-104", "job-105", "job-106", "partner-779",
  ]);
  assert.equal(getJobById("partner-778"), null);
  assert.equal(getJobById("partner-779")?.title, "Product Designer");
  assert.deepEqual(listJobs(), jobs);
});

test("filters operate on unique roles while preserving order and remote eligibility", () => {
  assert.deepEqual(listJobs({ query: "  SENIOR PRODUCT ENGINEER  " }).map((job) => job.id), ["job-101"]);
  assert.deepEqual(listJobs({ category: "Engineering", location: "Bern" }).map((job) => job.id), ["job-104", "job-106"]);
  assert.deepEqual(listJobs({ query: "React", category: "Engineering", location: "Zurich" }).map((job) => job.id), ["job-101"]);
  assert.deepEqual(listJobs({ query: "React", location: "Bern" }), []);
  assert.deepEqual(listJobs({ query: "no such role" }), []);
});

test("catalog can filter by query, category, and location", () => {
  assert.equal(listJobs({ query: "Security" }).length, 1);
  assert.equal(listJobs({ category: "Data" }).length, 1);
  assert.equal(listJobs({ location: "Lausanne" }).some((job) => job.id === "job-103"), true);
  assert.equal(listJobs({ location: "Bern" }).some((job) => job.id === "job-106"), true);
  assert.equal(getJobById("job-102")?.title, "Data Platform Engineer");
});
