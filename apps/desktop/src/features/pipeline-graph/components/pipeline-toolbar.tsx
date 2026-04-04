// 책임: Import JSON, Fit View 등의 파이프라인 툴바를 렌더한다.
import { Upload, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PipelineToolbarProps {
  onImport: () => void;
  onFitView: () => void;
}

export function PipelineToolbar({ onImport, onFitView }: PipelineToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5">
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onImport}>
        <Upload className="h-3.5 w-3.5" />
        Import JSON
      </Button>
      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onFitView}>
        <Maximize2 className="h-3.5 w-3.5" />
        Fit View
      </Button>
    </div>
  );
}
