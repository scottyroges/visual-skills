import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  matchGlob,
  type AtlasConfig,
  type DomainConfig,
  type ReadingPathConfig,
  type SourceGroup,
  type TopicConfig,
  type TopicShape,
} from "./atlas-config.js";

export interface AtlasBreadcrumb {
  id: string;
  title: string;
  htmlPath: string;
}

export interface AtlasPageNode {
  id: string;
  kind: "domain" | "topic";
  slug: string;
  title: string;
  purpose: string;
  shape?: TopicShape;
  aliases: string[];
  topicDepth: number;
  domainSlug?: string;
  outputDir: string;
  jsonPath: string;
  htmlPath: string;
  breadcrumbs: AtlasBreadcrumb[];
  parent?: AtlasPageNode;
  children: AtlasPageNode[];
  related: string[];
  topic?: TopicConfig;
  domain?: DomainConfig;
}

export interface AtlasPageTree {
  config: AtlasConfig;
  roots: AtlasPageNode[];
  nodes: AtlasPageNode[];
  byId: Map<string, AtlasPageNode>;
  readingPaths: ReadingPathConfig[];
}

export interface PageTreeValidation {
  problems: string[];
  warnings: string[];
}

export interface ResolvedSourceGroup {
  label: string;
  files: string[];
}

function domainPaths(slug: string) {
  const outputDir = `domain-${slug}`;
  return {
    outputDir,
    jsonPath: `${outputDir}/domain-${slug}.json`,
    htmlPath: `${outputDir}/domain-${slug}.html`,
  };
}

function rootTopicPaths(slug: string) {
  const outputDir = `topic-${slug}`;
  return {
    outputDir,
    jsonPath: `${outputDir}/topic-${slug}.json`,
    htmlPath: `${outputDir}/topic-${slug}.html`,
  };
}

function childTopicPaths(parent: AtlasPageNode, slug: string) {
  const outputDir = `${parent.outputDir}/${slug}`;
  return {
    outputDir,
    jsonPath: `${outputDir}/${slug}.json`,
    htmlPath: `${outputDir}/${slug}.html`,
  };
}

export function buildPageTree(config: AtlasConfig): AtlasPageTree {
  const roots: AtlasPageNode[] = [];
  const nodes: AtlasPageNode[] = [];
  const byId = new Map<string, AtlasPageNode>();
  const systemCrumb: AtlasBreadcrumb = {
    id: "atlas",
    title: `System Atlas · ${config.repo}`,
    htmlPath: "atlas.html",
  };

  const register = (node: AtlasPageNode) => {
    nodes.push(node);
    if (!byId.has(node.id)) byId.set(node.id, node);
  };

  const addTopics = (
    topics: TopicConfig[],
    parent: AtlasPageNode | undefined,
    domainSlug: string | undefined,
    rootLevel: boolean,
  ): AtlasPageNode[] => topics.map((topic) => {
    const id = parent ? `${parent.id}/${topic.slug}` : topic.slug;
    const paths = parent
      ? childTopicPaths(parent, topic.slug)
      : rootTopicPaths(topic.slug);
    const topicDepth = parent?.kind === "topic" ? parent.topicDepth + 1 : 1;
    const node: AtlasPageNode = {
      id,
      kind: "topic",
      slug: topic.slug,
      title: topic.title,
      purpose: topic.purpose,
      shape: topic.shape,
      aliases: [...(topic.aliases ?? [])],
      topicDepth,
      domainSlug,
      ...paths,
      breadcrumbs: [],
      parent,
      children: [],
      related: [...(topic.related ?? [])],
      topic,
    };
    node.breadcrumbs = [
      systemCrumb,
      ...((parent?.breadcrumbs ?? []).filter((crumb) => crumb.id !== "atlas")),
      { id: node.id, title: node.title, htmlPath: node.htmlPath },
    ];
    register(node);
    node.children = addTopics(topic.topics ?? [], node, domainSlug, false);
    if (rootLevel) roots.push(node);
    return node;
  });

  for (const domain of config.domains) {
    const paths = domainPaths(domain.slug);
    const node: AtlasPageNode = {
      id: domain.slug,
      kind: "domain",
      slug: domain.slug,
      title: domain.name,
      purpose: domain.purpose ?? "",
      aliases: [],
      topicDepth: 0,
      domainSlug: domain.slug,
      ...paths,
      breadcrumbs: [
        systemCrumb,
        { id: domain.slug, title: domain.name, htmlPath: paths.htmlPath },
      ],
      children: [],
      related: [...(domain.related ?? [])],
      domain,
    };
    roots.push(node);
    register(node);
    node.children = addTopics(domain.topics ?? [], node, domain.slug, false);
  }

  addTopics(config.topics ?? [], undefined, undefined, true);

  const readingPaths = [
    ...(config.readingPaths ?? []),
    ...config.domains.flatMap((domain) => domain.readingPaths ?? []),
  ];
  return { config, roots, nodes, byId, readingPaths };
}

export function validatePageTree(tree: AtlasPageTree): PageTreeValidation {
  const problems: string[] = [];
  const warnings: string[] = [];
  const ids = new Map<string, number>();
  const paths = new Map<string, string>();

  for (const node of tree.nodes) {
    ids.set(node.id, (ids.get(node.id) ?? 0) + 1);
    const prior = paths.get(node.htmlPath);
    if (prior) problems.push(`duplicate page path "${node.htmlPath}" for "${prior}" and "${node.id}"`);
    else paths.set(node.htmlPath, node.id);
    if (!node.slug.trim() || !node.title.trim()) problems.push(`page "${node.id}" has an empty slug or title`);
    if (node.kind === "topic" && !node.purpose.trim()) problems.push(`topic "${node.id}" has no purpose`);
    if (node.domainSlug && node.topicDepth > 2)
      warnings.push(`topic "${node.id}" is more than two topic levels beneath a domain`);
  }

  for (const [id, count] of ids) {
    if (count > 1) problems.push(`duplicate page id "${id}"`);
  }
  for (const node of tree.nodes) {
    for (const related of node.related) {
      if (!tree.byId.has(related)) problems.push(`page "${node.id}" links to missing related page "${related}"`);
    }
  }
  for (const path of tree.readingPaths) {
    for (const page of path.pages) {
      if (!tree.byId.has(page)) problems.push(`reading path "${path.title}" links to missing page "${page}"`);
    }
  }
  return { problems, warnings };
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", ".turbo"]);

async function walkFiles(root: string, dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walkFiles(root, absolute, out);
    } else if (entry.isFile()) {
      out.push(relative(root, absolute).replace(/\\/g, "/"));
    }
  }
}

export async function resolveSourceGroup(repoRoot: string, group: SourceGroup): Promise<ResolvedSourceGroup> {
  const files: string[] = [];
  await walkFiles(repoRoot, repoRoot, files);
  const matched = files
    .filter((file) => group.include.some((glob) => matchGlob(glob, file)))
    .filter((file) => !(group.exclude ?? []).some((glob) => matchGlob(glob, file)))
    .sort();
  return { label: group.label, files: matched };
}

export async function resolveTopicSources(repoRoot: string, topic: TopicConfig): Promise<ResolvedSourceGroup[]> {
  return Promise.all(topic.sources.map((group) => resolveSourceGroup(repoRoot, group)));
}
