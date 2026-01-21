# Skill Creator Guide

**Reference for creating effective Claude skills**

## Core Principles

### Conciseness
"The context window is a public good." Only include information Claude doesn't already possess. Challenge each piece to justify its token cost.

### Degrees of Freedom
Match specificity to task fragility:
- **High freedom**: Text-based instructions for flexible approaches
- **Medium freedom**: Pseudocode with parameters for preferred patterns
- **Low freedom**: Specific scripts for error-prone operations

### Progressive Disclosure
Three-level loading system manages context efficiently:
1. **Metadata** (YAML frontmatter)
2. **SKILL.md body** (main instructions)
3. **Bundled resources** (scripts, references, assets)

---

## Skill Anatomy

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/ (executable code)
    ├── references/ (documentation)
    └── assets/ (output templates/files)
```

### Key Files

**SKILL.md**: Contains YAML frontmatter with `name` and `description` fields (triggering mechanism), plus markdown instructions.

**Scripts**: Include when code requires "deterministic reliability or are repeatedly rewritten."

**References**: Documentation loaded as needed. Keep detailed information here, not in SKILL.md.

**Assets**: Files for output use (templates, images, boilerplate code).

---

## Creation Process

1. **Understand the skill** with concrete examples
2. **Plan reusable contents** (scripts, references, assets)
3. **Initialize** using init_skill.py
4. **Edit** the skill and resources
5. **Package** using package_skill.py
6. **Iterate** based on usage

---

## Writing Guidelines

- Use imperative/infinitive form
- Keep SKILL.md under 500 lines
- Include "when to use" information in description, not body
- Avoid deeply nested references
- Delete unnecessary example files after initialization

---

## Example: Simple Skill

```yaml
---
name: Web Scraper Skill
description: Use this skill when building web scrapers with Puppeteer or similar tools
---

# Web Scraper Best Practices

## Session Management
- Always save cookies for persistence
- Implement retry logic (3-5 attempts)
- Add delays between requests to avoid rate limiting

## Error Handling
- Graceful degradation when APIs fail
- Screenshot on errors for debugging
- Log all failures with timestamps

## Performance
- Use headless mode for production
- Implement caching where possible
- Clear sessions between scrapes
```

---

## Example: Complex Skill with Scripts

```yaml
---
name: API Integration Skill
description: Use when integrating third-party APIs with rate limiting and auth
---

# API Integration Workflow

See `scripts/api-template.js` for boilerplate code.

## Key Patterns
- Exponential backoff for retries
- Token refresh handling
- Request queuing for rate limits
```

**scripts/api-template.js**:
```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 429) {
        await sleep(Math.pow(2, i) * 1000);
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

---

## When to Create a Skill

**Good candidates:**
- Repeated workflows (git commits, API integrations)
- Domain-specific knowledge (medical coding, legal research)
- Complex multi-step processes (deployment pipelines)
- Tool-specific patterns (React best practices, database migrations)

**Poor candidates:**
- One-off tasks
- General programming knowledge Claude already has
- Simple instructions that don't need bundled resources

---

## Skill Maintenance

- Update when patterns change
- Remove outdated references
- Keep scripts tested and working
- Version skills when making breaking changes

---

**Source**: [Anthropic Skills Repository](https://github.com/anthropics/skills)
