import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  buildPageTree,
  buildPageNavigation,
  resolveTopicSources,
  validatePageTree,
} from "../src/atlas-tree.js";
import type { AtlasConfig, TopicConfig } from "../src/atlas-config.js";

const REPO = join(__dirname, "fixtures", "atlas-repo");

const contextTopic: TopicConfig = {
  slug: "context-building",
  title: "Context building",
  purpose: "Builds ordered model input",
  shape: "mechanism",
  aliases: ["context builder"],
  sources: [
    {
      label: "Assembly",
      include: ["lib/sim/**"],
      exclude: ["**/loop.ts", "**/__tests__/**"],
    },
    {
      label: "Stored summaries",
      include: ["packages/db/src/**/*summary*.ts"],
    },
  ],
  topics: [
    {
      slug: "compaction",
      title: "Compaction",
      purpose: "Reduces older input",
      shape: "algorithm",
      sources: [{ label: "Policy", include: ["lib/sim/engine.ts"] }],
    },
  ],
};

const config: AtlasConfig = {
  repo: "demo",
  srcRoots: ["lib"],
  domains: [
    {
      slug: "conversation",
      name: "Conversation",
      purpose: "Runs a turn",
      globs: ["lib/sim/**"],
      modules: [],
      topics: [contextTopic],
    },
  ],
  topics: [
    {
      slug: "one-turn",
      title: "One turn",
      purpose: "Follows a request across domains",
      shape: "lifecycle",
      sources: [{ label: "Entry", include: ["lib/api/**"] }],
      related: ["conversation/context-building"],
    },
  ],
  readingPaths: [
    {
      title: "Understand context",
      pages: ["conversation", "conversation/context-building", "conversation/context-building/compaction"],
    },
  ],
};

describe("buildPageTree", () => {
  it("derives recursive domain, topic, and root-topic paths plus breadcrumbs", () => {
    const tree = buildPageTree(config);

    expect(tree.nodes.map((node) => node.id)).toEqual([
      "conversation",
      "conversation/context-building",
      "conversation/context-building/compaction",
      "one-turn",
    ]);

    const compaction = tree.byId.get("conversation/context-building/compaction")!;
    expect(compaction.htmlPath).toBe(
      "domain-conversation/context-building/compaction/compaction.html",
    );
    expect(compaction.jsonPath).toBe(
      "domain-conversation/context-building/compaction/compaction.json",
    );
    expect(compaction.breadcrumbs.map((crumb) => crumb.title)).toEqual([
      "System Atlas · demo",
      "Conversation",
      "Context building",
      "Compaction",
    ]);
    expect(compaction.parent?.id).toBe("conversation/context-building");
    expect(compaction.topicDepth).toBe(2);

    const rootTopic = tree.byId.get("one-turn")!;
    expect(rootTopic.htmlPath).toBe("topic-one-turn/topic-one-turn.html");
    expect(rootTopic.breadcrumbs.map((crumb) => crumb.title)).toEqual([
      "System Atlas · demo",
      "One turn",
    ]);
  });

  it("reports duplicate paths, bad references, and excessive topic depth separately", () => {
    const tooDeep: AtlasConfig = structuredClone(config);
    tooDeep.domains[0].topics![0].topics![0].topics = [
      {
        slug: "overflow",
        title: "Overflow",
        purpose: "Explains overflow",
        sources: [],
        related: ["missing/page"],
      },
    ];
    tooDeep.domains.push({
      slug: "conversation",
      name: "Duplicate conversation",
      globs: [],
      modules: [],
    });

    const result = validatePageTree(buildPageTree(tooDeep));

    expect(result.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/duplicate page id.*conversation/i),
      expect.stringMatching(/related page.*missing\/page/i),
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/more than two topic levels/i),
    ]));
  });
});

describe("buildPageNavigation", () => {
  it("derives relative links, current-branch expansion, reading paths, and structured search", () => {
    const tree = buildPageTree(config);
    const navigation = buildPageNavigation(tree, "conversation/context-building");

    expect(navigation.breadcrumbs.map((link) => [link.title, link.href])).toEqual([
      ["System Atlas · demo", "../../atlas.html"],
      ["Conversation", "../domain-conversation.html"],
      ["Context building", "context-building.html"],
    ]);
    expect(navigation.children.map((link) => [link.title, link.href])).toEqual([
      ["Compaction", "compaction/compaction.html"],
    ]);
    expect(navigation.branch[0].expanded).toBe(true);
    expect(navigation.branch[0].children[0].current).toBe(true);
    expect(navigation.branch[1]).toMatchObject({ expanded: false, children: [] });
    expect(navigation.readingPaths[0].pages.map((link) => link.href)).toEqual([
      "../domain-conversation.html",
      "context-building.html",
      "compaction/compaction.html",
    ]);
    expect(navigation.searchIndex.find((entry) => entry.id.endsWith("compaction"))).toMatchObject({
      href: "compaction/compaction.html",
      breadcrumb: "System Atlas · demo / Conversation / Context building / Compaction",
      sources: ["lib/sim/engine.ts"],
    });
  });
});

describe("resolveTopicSources", () => {
  it("resolves labeled include/exclude groups across folders", async () => {
    const groups = await resolveTopicSources(REPO, contextTopic);

    expect(groups).toEqual([
      { label: "Assembly", files: ["lib/sim/engine.ts", "lib/sim/season.test.ts"] },
      { label: "Stored summaries", files: ["packages/db/src/stored-summary.ts"] },
    ]);
  });

  it("keeps overlapping evidence in each authored group", async () => {
    const groups = await resolveTopicSources(REPO, {
      slug: "overlap",
      title: "Overlap",
      purpose: "Tests overlapping evidence",
      sources: [
        { label: "Specific", include: ["lib/sim/engine.ts"] },
        { label: "Whole mechanism", include: ["lib/sim/**"], exclude: ["**/loop.ts", "**/*.test.ts", "**/__tests__/**"] },
      ],
    });

    expect(groups).toEqual([
      { label: "Specific", files: ["lib/sim/engine.ts"] },
      { label: "Whole mechanism", files: ["lib/sim/engine.ts"] },
    ]);
  });
});
