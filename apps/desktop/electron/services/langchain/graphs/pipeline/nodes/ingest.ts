// 책임: 티켓 데이터를 SQLite에서 로드하여 파이프라인 상태에 주입한다.

import { loadAllTicketTrees, loadTicketTree } from "../../../../jira/jira-ticket-store";
import type { JiraTicket, JiraTicketTree } from "../../../../../../shared/ipc";
import type { PipelineStateType } from "../state";

// 목적: 티켓 트리에서 ticketId에 해당하는 루트 키를 찾는다.
// 이유: ticketId가 트리의 root와 일치하지 않을 수 있으므로 직접 tickets 맵에서 탐색한다.
function findTicketInTree(tree: JiraTicketTree, ticketId: string): JiraTicket | null {
  return tree.tickets[ticketId] ?? null;
}

// 목적: ticketId가 루트 키가 아닐 때도 저장된 전체 트리에서 포함 트리를 찾는다.
function findTreeByTicketId(ticketId: string): JiraTicketTree | null {
  const trees = loadAllTicketTrees();
  for (const tree of trees) {
    if (tree.tickets[ticketId]) return tree;
  }
  return null;
}

// 목적: 티켓과 하위 태스크 정보를 결합하여 분석용 설명 문자열을 생성한다.
function buildDescription(ticket: JiraTicket, tree: JiraTicketTree): string {
  const sections: string[] = [];

  sections.push(`# ${ticket.key}: ${ticket.summary}`);
  sections.push(`- Type: ${ticket.issuetype}`);
  sections.push(`- Status: ${ticket.status}`);
  sections.push(`- Priority: ${ticket.priority}`);
  if (ticket.assignee) sections.push(`- Assignee: ${ticket.assignee}`);
  if (ticket.labels.length > 0) sections.push(`- Labels: ${ticket.labels.join(", ")}`);

  if (ticket.description) {
    sections.push("");
    sections.push("## Description");
    sections.push(ticket.description);
  }

  // 목적: 하위 태스크를 포함하여 전체 작업 범위를 파악할 수 있도록 한다.
  if (ticket.subtasks.length > 0) {
    sections.push("");
    sections.push("## Subtasks");
    for (const subtaskKey of ticket.subtasks) {
      const subtask = tree.tickets[subtaskKey];
      if (subtask) {
        sections.push(`### ${subtask.key}: ${subtask.summary} [${subtask.status}]`);
        if (subtask.description) {
          sections.push(subtask.description);
        }
      }
    }
  }

  // 목적: 관련 티켓 링크를 포함하여 의존성·차단 관계를 파악한다.
  if (ticket.links.length > 0) {
    sections.push("");
    sections.push("## Linked Issues");
    for (const link of ticket.links) {
      const linked = tree.tickets[link.key];
      const summary = linked ? `: ${linked.summary}` : "";
      sections.push(`- ${link.type} (${link.direction}) → ${link.key}${summary}`);
    }
  }

  return sections.join("\n");
}

// 목적: Jira 티켓 트리에서 대상 티켓을 찾아 설명 문자열을 구성한다.
export async function ingest(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  // 이유: ticketId는 root key일 수도 있고 하위 ticket key일 수도 있다.
  const tree = loadTicketTree(state.ticketId) ?? findTreeByTicketId(state.ticketId);
  if (!tree) return { error: `티켓을 포함한 트리를 찾을 수 없습니다: ${state.ticketId}` };

  const ticket = findTicketInTree(tree, state.ticketId);
  if (!ticket) {
    return { error: `티켓 트리에서 티켓을 찾을 수 없습니다: ${state.ticketId}` };
  }

  const description = buildDescription(ticket, tree);
  return { description };
}
