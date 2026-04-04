// 책임: 파이프라인 정의 CRUD IPC 핸들러를 등록한다.

import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import { IPC_CHANNELS } from "../../shared/ipc";
import type { PipelineDefinition } from "../../shared/ipc";
import { getAppDatabase } from "../services/storage/sqlite-db";

export function registerPipelineIpc(): void {
  // 목적: pipelineGet → id로 파이프라인 정의를 조회한다.
  ipcMain.handle(IPC_CHANNELS.pipelineGet, (_event, id: string) => {
    const db = getAppDatabase();
    const row = db.prepare("SELECT data FROM pipeline_definitions WHERE id = ?").get(id) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as PipelineDefinition;
  });

  // 목적: pipelineSave → 파이프라인 정의를 upsert 한다.
  ipcMain.handle(IPC_CHANNELS.pipelineSave, (_event, definition: PipelineDefinition) => {
    const db = getAppDatabase();
    db.prepare(`
      INSERT INTO pipeline_definitions (id, name, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at
    `).run(definition.id, definition.name, JSON.stringify(definition), Date.now());
  });

  // 목적: pipelineImport → 파일 다이얼로그로 JSON을 읽어 저장 후 반환한다.
  ipcMain.handle(IPC_CHANNELS.pipelineImport, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const content = readFileSync(result.filePaths[0]!, "utf-8");
    const definition = JSON.parse(content) as PipelineDefinition;

    const db = getAppDatabase();
    db.prepare(`
      INSERT INTO pipeline_definitions (id, name, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at
    `).run(definition.id, definition.name, JSON.stringify(definition), Date.now());

    return definition;
  });

  // 목적: pipelineList → 저장된 모든 파이프라인 목록을 반환한다.
  ipcMain.handle(IPC_CHANNELS.pipelineList, () => {
    const db = getAppDatabase();
    const rows = db.prepare("SELECT id, name FROM pipeline_definitions ORDER BY updated_at DESC").all() as Array<{ id: string; name: string }>;
    return rows;
  });
}
