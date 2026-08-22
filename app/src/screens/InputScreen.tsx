import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { UploadCloud, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCueSheetStore } from '@/store';
import type { CueSheet } from '@/types';

export function InputScreen() {
  const navigate = useNavigate();
  const loadCueSheet = useCueSheetStore((s) => s.loadCueSheet);
  const cueSheet = useCueSheetStore((s) => s.cueSheet);

  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    title: string;
    characters: number;
    props: number;
    cues: number;
    crossover: boolean;
  } | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setSummary(null);
    setFilename(file.name);

    const text = await file.text();

    // JSON 파싱
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 파싱 에러';
      setError(`JSON 파싱 실패: ${msg}`);
      return;
    }

    // 스키마 최소 검증
    const obj = data as Record<string, unknown>;
    const missing: string[] = [];
    if (!obj.metadata) missing.push('metadata');
    if (!obj.venue) missing.push('venue');
    if (!obj.characters) missing.push('characters');
    if (!obj.props) missing.push('props');
    if (!obj.cues) missing.push('cues');

    if (missing.length > 0) {
      setError(`필수 필드 누락: ${missing.join(', ')}\n\ncue-sheet-schema.json 형식에 맞는 파일을 올려주세요.`);
      return;
    }

    const cueData = data as CueSheet;

    // cues 배열 안에 events가 있는지 확인
    if (Array.isArray(cueData.cues) && cueData.cues.length > 0) {
      const firstCue = cueData.cues[0];
      if (!firstCue.events) {
        setError('cues[].events 필드가 없습니다. Event 기반 스키마 형식이 필요합니다.');
        return;
      }
    }

    // 로드 성공
    loadCueSheet(cueData);
    setSummary({
      title: cueData.metadata?.title ?? '(제목 없음)',
      characters: cueData.characters?.length ?? 0,
      props: cueData.props?.length ?? 0,
      cues: cueData.cues?.length ?? 0,
      crossover: cueData.venue?.has_backstage_crossover ?? false,
    });
  };

  return (
    <div className="mx-auto max-w-[800px] p-6">
      <div className="mb-6">
        <h1 className="text-lg font-medium">STANDBY · 큐시트 검증</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          cue-sheet-schema.json 형식의 큐시트 파일을 업로드하면 동선 모순을 자동 검증합니다.
        </p>
      </div>

      {/* Upload area */}
      <Dropzone
        filename={filename}
        onFile={handleFile}
        hasError={!!error}
        hasData={!!summary}
      />

      {/* Error */}
      {error && (
        <div className="mt-4 flex gap-3 border border-violation bg-violation-bg p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-violation" />
          <div>
            <p className="text-sm font-medium text-violation">파일을 읽을 수 없습니다</p>
            <pre className="mt-1 text-xs text-violation whitespace-pre-wrap">{error}</pre>
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mt-4 border border-consistent bg-consistent-bg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-consistent" />
            <span className="text-sm font-medium text-consistent">로드 완료</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">공연: </span>
              <span className="font-medium">{summary.title}</span>
            </div>
            <div>
              <span className="text-muted-foreground">백스테이지 통로: </span>
              <span className="font-medium">{summary.crossover ? '있음' : '없음'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">인물: </span>
              <span className="mono">{summary.characters}명</span>
            </div>
            <div>
              <span className="text-muted-foreground">소품: </span>
              <span className="mono">{summary.props}개</span>
            </div>
            <div>
              <span className="text-muted-foreground">큐(씬): </span>
              <span className="mono">{summary.cues}개</span>
            </div>
          </div>
        </div>
      )}

      {/* Validation preview */}
      {cueSheet && (
        <ValidationPreview />
      )}

      {/* Action */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => navigate({ to: '/workspace' })}
          disabled={!cueSheet}
          className={cn(
            'border px-5 py-2.5 text-sm',
            cueSheet
              ? 'border-foreground bg-foreground text-background hover:bg-muted-foreground'
              : 'border-border bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          워크스페이스 열기
        </button>
      </div>
    </div>
  );
}

function ValidationPreview() {
  const validationResult = useCueSheetStore((s) => s.validationResult);
  if (!validationResult) return null;

  return (
    <div className="mt-4 border border-border bg-surface p-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium">검증 결과</span>
        {validationResult.errors > 0 && (
          <span className="mono flex items-center gap-1 text-violation">
            <span className="h-2 w-2 rounded-full bg-violation" />
            ERROR {validationResult.errors}건
          </span>
        )}
        {validationResult.warnings > 0 && (
          <span className="mono flex items-center gap-1 text-review">
            <span className="h-2 w-2 rounded-full bg-review" />
            WARNING {validationResult.warnings}건
          </span>
        )}
        {validationResult.total_contradictions === 0 && (
          <span className="mono text-consistent">모순 없음 ✓</span>
        )}
      </div>
      {validationResult.contradictions.length > 0 && (
        <div className="mt-3 max-h-40 overflow-auto">
          {validationResult.contradictions.slice(0, 5).map((c, i) => (
            <div key={i} className="mono border-b border-border py-1 text-[11px]">
              <span className={c.severity === 'ERROR' ? 'text-violation' : 'text-review'}>
                {c.severity}
              </span>
              {' '}{c.scene_number} · {c.description}
            </div>
          ))}
          {validationResult.contradictions.length > 5 && (
            <p className="mono mt-1 text-[11px] text-muted-foreground">
              ... 외 {validationResult.contradictions.length - 5}건 (워크스페이스에서 확인)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Dropzone({
  filename,
  onFile,
  hasError,
  hasData,
}: {
  filename: string;
  onFile: (file: File) => void;
  hasError: boolean;
  hasData: boolean;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) onFile(file);
        };
        input.click();
      }}
      className={cn(
        'flex h-48 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed text-center transition-colors',
        over && 'border-foreground bg-muted',
        !over && !hasError && !hasData && 'border-border bg-background hover:border-muted-foreground',
        hasError && 'border-violation/50 bg-violation-bg/30',
        hasData && !hasError && 'border-consistent/50 bg-consistent-bg/30',
      )}
    >
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      {filename ? (
        <span className="text-sm">{filename}</span>
      ) : (
        <span className="text-sm text-muted-foreground">큐시트 JSON 파일을 드래그하거나 클릭해서 선택</span>
      )}
      <span className="mono text-[10px] text-muted-foreground">.json · cue-sheet-schema 형식</span>
    </div>
  );
}
