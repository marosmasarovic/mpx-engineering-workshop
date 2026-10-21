import { broaderSkills } from "./skills.js";

function normalized(value) {
  return value.trim().toLowerCase();
}

export function scoreJob(job, candidate) {
  const candidateSkills = new Set(candidate.skills.map(normalized));
  const skillBreakdown = job.skills.map((skill) => {
    const requiredSkill = normalized(skill);
    const exact = candidateSkills.has(requiredSkill);
    // Taxonomy order selects stable evidence regardless of candidate skill order.
    const relatedSkill = exact ? undefined : Object.keys(broaderSkills).find((specific) => (
      candidateSkills.has(normalized(specific))
      && broaderSkills[specific].some((broader) => normalized(broader) === requiredSkill)
    ));
    const credit = exact ? 1 : relatedSkill ? 0.5 : 0;

    return {
      skill,
      matched: exact,
      matchType: exact ? "exact" : relatedSkill ? "related" : "missing",
      candidateSkill: exact ? skill : relatedSkill ?? null,
      credit,
      contribution: credit * 80 / job.skills.length,
      reason: exact ? "Exact skill" : relatedSkill ? `Related via ${relatedSkill} — 50% credit` : "Not found",
    };
  });
  const matchedCount = skillBreakdown.filter((item) => item.matched).length;
  const skillScore = job.skills.length
    ? skillBreakdown.reduce((sum, item) => sum + item.credit, 0) / job.skills.length
    : 0;
  const locationFits = job.location === candidate.location || job.workMode === "Remote";
  const locationScore = locationFits ? 20 : 0;
  const score = Math.round(skillScore * 80 + locationScore);

  return {
    score,
    matchedCount,
    requiredCount: job.skills.length,
    locationFits,
    locationScore,
    skillBreakdown,
  };
}

export function rankJobs(jobs, candidate) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, candidate) }))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));
}
