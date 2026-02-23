// 책임: git diff 조회 상태를 관리한다.

import { useCallback, useState } from "react";
import type { GitDiffResponse } from "@shared/ipc";

export function useGitDiff() {
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDiff = useCallback(async (cwd: string, paths?: string[]) => {
    setLoading(true);
    try {
      const result = await window.atlas.getGitDiff({ cwd, paths });
      setDiff(result);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearDiff = useCallback(() => {
    setDiff(null);
  }, []);

  return { diff, loading, fetchDiff, clearDiff };
}
