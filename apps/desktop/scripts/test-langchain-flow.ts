// 책임: CliLlm의 invoke 동작을 CLI 환경에서 검증한다.
// 주의: 실제 CLI(claude 또는 codex)가 설치되고 인증된 환경에서만 실행 가능하다.
// 사용법: npx tsx apps/desktop/scripts/test-langchain-flow.ts

import { CliLlm } from "../electron/services/langchain/cli-llm";

const provider = (process.env.PROVIDER as "claude" | "codex") ?? "claude";
const cwd = process.env.CWD ?? process.cwd();

async function main() {
  console.log(`\n=== CliLlm 테스트 (provider: ${provider}, cwd: ${cwd}) ===\n`);

  const model = new CliLlm({
    provider,
    cwd,
    permissionMode: "auto",
    timeoutMs: 60_000
  });

  // 테스트 1: invoke
  console.log("[테스트 1] model.invoke()");
  console.log("프롬프트: 'Reply with exactly: Hello from LangChain'");
  console.log("---");

  try {
    const result = await model.invoke("Reply with exactly: Hello from LangChain");
    console.log("응답:", result);
    console.log("---");
    console.log("[테스트 1] 성공\n");
  } catch (error) {
    console.error("[테스트 1] 실패:", error instanceof Error ? error.message : error);
  }

  // 테스트 2: invoke with callback (토큰 스트리밍 확인)
  console.log("[테스트 2] model.invoke() with callbacks");
  console.log("프롬프트: 'Count from 1 to 3, one number per line'");
  console.log("---");

  try {
    const result = await model.invoke("Count from 1 to 3, one number per line", {
      callbacks: [
        {
          handleLLMNewToken(token: string) {
            process.stdout.write(`[토큰] ${token}`);
          }
        }
      ]
    });
    console.log("\n---");
    console.log("최종 응답:", result);
    console.log("[테스트 2] 성공\n");
  } catch (error) {
    console.error("[테스트 2] 실패:", error instanceof Error ? error.message : error);
  }

  console.log("=== 테스트 완료 ===\n");
}

main().catch(console.error);
