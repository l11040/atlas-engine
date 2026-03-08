// 책임: Jira REST API를 호출하여 이슈 트리를 가져온다.

import { net, type WebContents } from "electron";
import {
  IPC_CHANNELS,
  type JiraTicket,
  type JiraTicketLink,
  type JiraTicketTree,
  type JiraSettings,
  type JiraProgressEvent
} from "../../../shared/ipc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdfNode = any;

interface JiraApiIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    priority: { name: string };
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    created: string;
    updated: string;
    parent?: { key: string };
    subtasks?: Array<{ key: string }>;
    issuelinks?: Array<{
      type: { name: string };
      inwardIssue?: { key: string };
      outwardIssue?: { key: string };
    }>;
    labels?: string[];
    // 이유: v3 API는 description을 ADF(Atlassian Document Format) 객체로 반환한다.
    description: AdfNode | null;
  };
}

// 이유: v3 /search/jql은 startAt/total 대신 nextPageToken 기반 페이지네이션을 사용한다.
interface JiraSearchResponse {
  issues: JiraApiIssue[];
  nextPageToken?: string;
}

function buildAuthHeader(email: string, apiToken: string): string {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${credentials}`;
}

// 목적: Jira REST API v3 GET 요청을 수행한다.
// 이유: net.fetch는 Chromium의 HTTP/2 + connection pooling을 활용한다.
async function jiraGet<T>(baseUrl: string, path: string, auth: string): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/api/3${path}`;
  const response = await net.fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" }
  });

  if (response.ok) {
    return (await response.json()) as T;
  } else if (response.status === 401) {
    throw new Error("인증 실패: 이메일 또는 API 토큰을 확인하세요");
  } else if (response.status === 404) {
    throw new Error(`이슈를 찾을 수 없습니다 (${url})`);
  } else {
    const body = await response.text();
    throw new Error(`Jira API 오류 (${response.status}): ${body.slice(0, 200)}`);
  }
}

// 목적: JQL 검색에 포함할 필드 목록. 누락 시 parent, subtasks 등이 반환되지 않을 수 있다.
const SEARCH_FIELDS = "summary,status,issuetype,priority,assignee,reporter,created,updated,parent,subtasks,issuelinks,labels,description";

class RateLimitError extends Error {
  constructor() { super("Rate limited"); this.name = "RateLimitError"; }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 목적: Jira v3 search/jql 엔드포인트로 JQL 검색을 수행한다.
// 이유: v3 /search/jql은 nextPageToken 기반 페이지네이션을 사용한다 (startAt/total 미지원).
async function jiraSearchPage(baseUrl: string, jql: string, fields: string, maxResults: number, auth: string, nextPageToken?: string): Promise<JiraSearchResponse> {
  let url = `${baseUrl.replace(/\/$/, "")}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fields)}&maxResults=${maxResults}`;
  if (nextPageToken) {
    url += `&nextPageToken=${encodeURIComponent(nextPageToken)}`;
  }

  const response = await net.fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" }
  });

  if (response.ok) {
    return (await response.json()) as JiraSearchResponse;
  } else if (response.status === 429) {
    throw new RateLimitError();
  } else {
    const body = await response.text();
    throw new Error(`Jira 검색 오류 (${response.status}): ${body.slice(0, 200)}`);
  }
}

// 목적: rate limit(429) 시 지수 백오프로 재시도한다.
async function jiraSearchWithRetry(baseUrl: string, jql: string, fields: string, maxResults: number, auth: string, nextPageToken?: string): Promise<JiraSearchResponse> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await jiraSearchPage(baseUrl, jql, fields, maxResults, auth, nextPageToken);
    } catch (error) {
      if (error instanceof RateLimitError && attempt < MAX_RETRIES) {
        const wait = 1000 * Math.pow(2, attempt);
        await delay(wait);
        continue;
      }
      throw error;
    }
  }
  throw new Error("재시도 횟수 초과");
}

// 목적: JQL로 여러 부모의 자식 이슈를 한 번에 검색한다.
// 이유: 부모마다 개별 검색하면 API 호출이 N배 늘어나므로 IN 절로 일괄 검색한다.
async function searchChildrenBatch(baseUrl: string, parentKeys: string[], auth: string): Promise<JiraApiIssue[]> {
  if (parentKeys.length === 0) return [];
  const keyList = parentKeys.map((k) => `"${k}"`).join(", ");
  const jql = `"parent" in (${keyList}) OR "Epic Link" in (${keyList}) ORDER BY key ASC`;
  const allIssues: JiraApiIssue[] = [];

  try {
    let nextPageToken: string | undefined;
    do {
      const result = await jiraSearchWithRetry(baseUrl, jql, SEARCH_FIELDS, 100, auth, nextPageToken);
      allIssues.push(...result.issues);
      nextPageToken = result.nextPageToken;
    } while (nextPageToken);
  } catch {
    // 주의: OR 조합이 실패하면(Epic Link 미지원) parent만으로 재시도한다.
    if (allIssues.length === 0) {
      const fallbackJql = `"parent" in (${keyList}) ORDER BY key ASC`;
      try {
        let nextPageToken: string | undefined;
        do {
          const result = await jiraSearchWithRetry(baseUrl, fallbackJql, SEARCH_FIELDS, 100, auth, nextPageToken);
          allIssues.push(...result.issues);
          nextPageToken = result.nextPageToken;
        } while (nextPageToken);
      } catch {
        // 무시
      }
    }
  }

  return allIssues;
}

// 목적: Atlassian Document Format(ADF)을 Markdown으로 변환한다.
// 이유: v3 API의 description은 중첩된 ADF 객체이므로 테이블·리스트 등을 보존하려면 Markdown 변환이 필요하다.
function adfToMarkdown(node: AdfNode): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;

  const { type, content, attrs, marks } = node;

  // 목적: 텍스트 노드에 마크(bold, italic 등)를 적용한다.
  if (type === "text") {
    let text = node.text ?? "";
    if (marks && Array.isArray(marks)) {
      for (const mark of marks) {
        if (mark.type === "strong") text = `**${text}**`;
        else if (mark.type === "em") text = `*${text}*`;
        else if (mark.type === "strike") text = `~~${text}~~`;
        else if (mark.type === "code") text = `\`${text}\``;
        else if (mark.type === "link") text = `[${text}](${mark.attrs?.href ?? ""})`;
      }
    }
    return text;
  }

  if (type === "hardBreak") return "\n";

  const children: AdfNode[] = content ?? [];
  const parts = children.map((c: AdfNode) => adfToMarkdown(c)).filter(Boolean) as string[];

  switch (type) {
    case "doc":
      return parts.join("\n\n");
    case "paragraph":
      return parts.join("");
    case "heading": {
      const level = attrs?.level ?? 1;
      return `${"#".repeat(level)} ${parts.join("")}`;
    }
    case "blockquote":
      return parts.map((p) => `> ${p}`).join("\n");
    case "codeBlock": {
      const lang = attrs?.language ?? "";
      return `\`\`\`${lang}\n${parts.join("")}\n\`\`\``;
    }
    case "rule":
      return "---";
    case "bulletList":
      return parts.join("\n");
    case "orderedList":
      return parts.map((p, i) => p.replace(/^- /, `${i + 1}. `)).join("\n");
    case "listItem":
      return `- ${parts.join("\n  ")}`;
    // 목적: ADF 테이블을 GFM 테이블 구문으로 변환한다.
    case "table": {
      const rows = children.filter((c) => c.type === "tableRow");
      if (rows.length === 0) return "";
      const mdRows: string[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        const cells = (rows[ri].content ?? []) as AdfNode[];
        const cellTexts = cells.map((cell: AdfNode) => {
          const cellParts = (cell.content ?? []).map((c: AdfNode) => adfToMarkdown(c)).filter(Boolean) as string[];
          return cellParts.join(" ").replace(/\n/g, " ");
        });
        mdRows.push(`| ${cellTexts.join(" | ")} |`);
        // 주의: 첫 행(또는 tableHeader 행) 뒤에 구분선을 삽입해야 GFM 테이블로 인식된다.
        if (ri === 0) {
          mdRows.push(`| ${cellTexts.map(() => "---").join(" | ")} |`);
        }
      }
      return mdRows.join("\n");
    }
    case "panel":
      return `> ${parts.join("\n> ")}`;
    case "expand":
    case "nestedExpand":
      return parts.join("\n\n");
    case "mediaSingle":
    case "mediaGroup":
    case "media":
      return "";
    default:
      return parts.join("");
  }
}

function normalizeIssue(raw: JiraApiIssue): JiraTicket {
  const links: JiraTicketLink[] = (raw.fields.issuelinks ?? []).map((link) => {
    if (link.outwardIssue) {
      return { type: link.type.name, direction: "outward" as const, key: link.outwardIssue.key };
    }
    return { type: link.type.name, direction: "inward" as const, key: link.inwardIssue!.key };
  });

  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status.name,
    issuetype: raw.fields.issuetype.name,
    priority: raw.fields.priority.name,
    assignee: raw.fields.assignee?.displayName ?? null,
    reporter: raw.fields.reporter?.displayName ?? null,
    created: raw.fields.created,
    updated: raw.fields.updated,
    parent: raw.fields.parent?.key ?? null,
    subtasks: (raw.fields.subtasks ?? []).map((s) => s.key),
    links,
    labels: raw.fields.labels ?? [],
    description: adfToMarkdown(raw.fields.description)
  };
}

// 목적: myself API로 인증 유효성을 확인한다.
export async function testConnection(
  settings: Pick<JiraSettings, "baseUrl" | "email" | "apiToken">
): Promise<{ displayName: string }> {
  const auth = buildAuthHeader(settings.email, settings.apiToken);
  const result = await jiraGet<{ displayName: string }>(settings.baseUrl, "/myself", auth);
  return result;
}

// 목적: 진행 이벤트를 렌더러로 전송하는 헬퍼.
function sendProgress(sender: WebContents | null, event: JiraProgressEvent): void {
  if (sender && !sender.isDestroyed()) {
    sender.send(IPC_CHANNELS.jiraProgress, event);
  }
}

// 목적: 루트 이슈와 모든 하위 이슈를 BFS로 수집하여 트리를 구성한다.
// 이유: subtasks 필드와 JQL parent 검색을 병행해야 에픽→스토리→하위작업 전체를 수집할 수 있다.
export async function fetchTicketTree(
  settings: Pick<JiraSettings, "baseUrl" | "email" | "apiToken">,
  rootKey: string,
  sender?: WebContents | null
): Promise<JiraTicketTree> {
  const auth = buildAuthHeader(settings.email, settings.apiToken);
  const tickets: Record<string, JiraTicket> = {};
  const visited = new Set<string>();
  const queue: string[] = [rootKey];
  const target = sender ?? null;

  // 목적: BFS를 레벨 단위로 처리하여 같은 레벨의 부모들을 한 번의 JQL로 일괄 검색한다.
  while (queue.length > 0) {
    // 1단계: 현재 레벨의 노드들을 꺼내고, 미조회 이슈만 개별 fetch한다.
    const level = [...queue];
    queue.length = 0;

    const levelKeys: string[] = [];
    for (const key of level) {
      if (visited.has(key)) continue;
      visited.add(key);
      levelKeys.push(key);

      if (!tickets[key]) {
        sendProgress(target, { phase: "fetching", key, collected: Object.keys(tickets).length });
        try {
          const raw = await jiraGet<JiraApiIssue>(settings.baseUrl, `/issue/${key}`, auth);
          tickets[key] = normalizeIssue(raw);
        } catch {
          // 무시: 접근 불가 이슈
        }
      }
    }

    // 2단계: 리프가 아닌 이슈들의 자식을 한 번의 JQL로 일괄 검색한다.
    // 주의: Sub-task는 하위 이슈를 가질 수 없으므로 검색을 건너뛴다.
    const parentKeys = levelKeys.filter((key) => {
      const t = tickets[key];
      if (!t) return false;
      const type = t.issuetype.toLowerCase();
      return !type.includes("sub-task") && type !== "하위 작업";
    });

    let childIssues: JiraApiIssue[] = [];
    if (parentKeys.length > 0) {
      sendProgress(target, { phase: "searching-children", key: parentKeys[0]!, collected: Object.keys(tickets).length });
      try {
        childIssues = await searchChildrenBatch(settings.baseUrl, parentKeys, auth);
      } catch {
        // 무시
      }
    }

    // 3단계: 자식 이슈를 부모에 연결하고 tickets에 저장한다.
    // 목적: 자식의 parent 필드를 이용해 어떤 부모에 속하는지 매핑한다.
    const childByParent = new Map<string, string[]>();
    for (const childRaw of childIssues) {
      const normalized = normalizeIssue(childRaw);
      if (!tickets[childRaw.key]) {
        tickets[childRaw.key] = normalized;
      }
      const parentKey = normalized.parent && parentKeys.includes(normalized.parent) ? normalized.parent : null;
      if (parentKey) {
        if (!childByParent.has(parentKey)) childByParent.set(parentKey, []);
        childByParent.get(parentKey)!.push(childRaw.key);
      }
    }

    // 4단계: 각 부모의 subtasks를 갱신하고 자식을 다음 레벨 큐에 추가한다.
    for (const key of levelKeys) {
      const t = tickets[key];
      if (!t) continue;
      const jqlChildren = childByParent.get(key) ?? [];
      const allChildKeys = new Set([...t.subtasks, ...jqlChildren]);
      t.subtasks = [...allChildKeys];

      for (const childKey of allChildKeys) {
        if (!visited.has(childKey)) queue.push(childKey);
      }
    }
  }

  const tree: JiraTicketTree = {
    root: rootKey,
    exportedAt: new Date().toISOString(),
    total: Object.keys(tickets).length,
    tickets
  };

  sendProgress(target, { phase: "completed", total: tree.total });
  return tree;
}
