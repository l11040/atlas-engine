#!/bin/bash
# db.sh — 훅에서 SQLite에 직접 INSERT하기 위한 헬퍼

ATLAS_DB="${HOME}/Library/Application Support/Electron/atlas.db"

# 목적: sqlite3 CLI가 있고 DB 파일이 존재할 때만 INSERT를 실행한다.
db_exec() {
  if ! command -v sqlite3 &>/dev/null; then
    return 0
  fi
  if [ ! -f "$ATLAS_DB" ]; then
    return 0
  fi
  sqlite3 "$ATLAS_DB" "$1" 2>/dev/null || true
}

db_start_agent_log() {
  local session_id="$1"
  local agent_id="$2"
  local agent_type="$3"
  local cwd="$4"
  local permission_mode="$5"
  local start_time="$6"

  db_exec "INSERT OR IGNORE INTO hook_agent_logs
    (session_id, agent_id, agent_type, cwd, permission_mode, start_time)
    VALUES
    ('${session_id}', '${agent_id}', '${agent_type}', '${cwd}', '${permission_mode}', '${start_time}');"
}

db_finish_agent_log() {
  local agent_id="$1"
  local end_time="$2"
  local duration_sec="$3"
  local transcript_path="$4"
  local last_message="$5"

  db_exec "UPDATE hook_agent_logs
    SET end_time='${end_time}', duration_sec=${duration_sec}, transcript_path='${transcript_path}', last_message='$(echo "$last_message" | sed "s/'/''/g")'
    WHERE agent_id='${agent_id}';"
}

db_start_skill_log() {
  local session_id="$1"
  local tool_use_id="$2"
  local skill="$3"
  local args="$4"
  local cwd="$5"
  local permission_mode="$6"
  local caller_agent_id="$7"
  local caller_agent_type="$8"
  local start_time="$9"

  db_exec "INSERT OR IGNORE INTO hook_skill_logs
    (session_id, tool_use_id, skill, args, cwd, permission_mode, caller_agent_id, caller_agent_type, start_time)
    VALUES
    ('${session_id}', '${tool_use_id}', '${skill}', '$(echo "$args" | sed "s/'/''/g")', '${cwd}', '${permission_mode}', '${caller_agent_id}', '${caller_agent_type}', '${start_time}');"
}

db_finish_skill_log() {
  local tool_use_id="$1"
  local end_time="$2"
  local duration_sec="$3"
  local result="$4"

  db_exec "UPDATE hook_skill_logs
    SET end_time='${end_time}', duration_sec=${duration_sec}, result='$(echo "$result" | sed "s/'/''/g")'
    WHERE tool_use_id='${tool_use_id}';"
}

db_insert_session() {
  local session_id="$1"
  local started_at="$2"
  local args="$3"
  local cwd="$4"

  db_exec "INSERT OR IGNORE INTO atlas_sessions
    (session_id, started_at, args, cwd)
    VALUES
    ('${session_id}', '${started_at}', '$(echo "$args" | sed "s/'/''/g")', '${cwd}');"
}
