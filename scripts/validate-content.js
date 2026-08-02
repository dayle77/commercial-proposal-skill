"use strict";

function fail(errors, message) {
  errors.push(message);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates a parsed content.json object against the schema documented in
 * references/content-schema.md. Returns an array of human-readable error
 * strings; an empty array means the content is renderable.
 */
function validateContent(content) {
  const errors = [];

  if (!content || typeof content !== "object") {
    return ["content.json должен быть JSON-объектом"];
  }

  if (!hasText(content.outputSlug) || !/^[a-z0-9-]+$/.test(content.outputSlug)) {
    fail(errors, "outputSlug: обязателен, только латиница/цифры/дефисы");
  }

  const meta = content.meta || {};
  if (!hasText(meta.clientName)) fail(errors, "meta.clientName: обязательное поле");
  if (!hasText(meta.projectTitle)) fail(errors, "meta.projectTitle: обязательное поле");

  const cover = content.cover || {};
  if (!hasText(cover.title)) fail(errors, "cover.title: обязательное поле");

  const problem = content.problem || {};
  if (!hasText(problem.heading)) fail(errors, "problem.heading: обязательное поле");
  if (!hasText(problem.body)) fail(errors, "problem.body: обязательное поле");

  const solution = content.solution || {};
  if (!hasText(solution.heading)) fail(errors, "solution.heading: обязательное поле");
  if (!hasText(solution.body)) fail(errors, "solution.body: обязательное поле");

  const scope = content.scope || {};
  if (!hasText(scope.heading)) fail(errors, "scope.heading: обязательное поле");
  if (!Array.isArray(scope.stages) || scope.stages.length === 0) {
    fail(errors, "scope.stages: нужен хотя бы один этап");
  } else {
    scope.stages.forEach((stage, i) => {
      if (!hasText(stage.title)) fail(errors, `scope.stages[${i}].title: обязательное поле`);
    });
  }

  if (content.timeline) {
    const timeline = content.timeline;
    if (!Array.isArray(timeline.milestones) || timeline.milestones.length === 0) {
      fail(errors, "timeline.milestones: если раздел timeline присутствует, нужен хотя бы один milestone");
    }
  }

  const pricing = content.pricing || {};
  if (!hasText(pricing.heading)) fail(errors, "pricing.heading: обязательное поле");
  const hasItems = Array.isArray(pricing.items) && pricing.items.length > 0;
  const hasPackages = Array.isArray(pricing.packages) && pricing.packages.length > 0;
  if (!hasItems && !hasPackages) {
    fail(errors, "pricing: нужен хотя бы один pricing.items или pricing.packages (слайд не должен быть пустым)");
  }

  if (content.cases) {
    if (!Array.isArray(content.cases.items) || content.cases.items.length === 0) {
      fail(errors, "cases.items: если раздел cases присутствует, нужен хотя бы один кейс");
    }
  }

  const contacts = content.contacts || {};
  if (!hasText(contacts.personName)) fail(errors, "contacts.personName: обязательное поле");
  if (!hasText(contacts.phone) && !hasText(contacts.email) && !hasText(contacts.messenger)) {
    fail(errors, "contacts: нужен хотя бы один канал связи (phone, email или messenger)");
  }

  return errors;
}

module.exports = { validateContent };
