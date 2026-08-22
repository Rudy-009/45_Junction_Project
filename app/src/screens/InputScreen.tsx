import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import { Btn } from '@/components/ui';
import { OriginBadge, ReviewBadge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useCueSheetStore } from '@/store';
import type { CueSheet } from '@/types';

type Origin = 'REAL_REFERENCE' | 'CONTROLLED_FIXTURE' | 'MUTATED_FIXTURE';
type SourceState = { filename: string; hash: string; origin: Origin; reviewed: boolean };

export function InputScreen() {
  const navigate = useNavigate();
  const loadCueSheet = useCueSheetStore((s) => s.loadCueSheet);

  const [script, setScript] = useState<SourceState>({
    filename: '',
    hash: '',
    origin: 'REAL_REFERENCE',
    reviewed: false,
  });
  const [cuesheet, setCuesheet] = useState<SourceState>({
    filename: '',
    hash: '',
    origin: 'CONTROLLED_FIXTURE',
    reviewed: false,
  });
  const [spec, setSpec] = useState<SourceState>({
    filename: '',
    hash: '',
    origin: 'CONTROLLED_FIXTURE',
    reviewed: false,
  });

  const [wings, setWings] = useState({ 상수: true, 하수: true });
  const [crossover, setCrossover] = useState<'true' | 'false' | 'UNKNOWN'>('true');
  const [crossoverTime, setCrossoverTime] = useState('45');
  const [routes, setRoutes] = useState([
    { from: '하수윙', to: '하수환복소', min: '3', max: '4' },
    { from: '하수환복소', to: '무대', min: '3', max: '4' },
  ]);

  const handleFileUpload = async (file: File, type: 'script' | 'cuesheet' | 'spec') => {
    const text = await file.text();
    try {
      const data = JSON.parse(text) as CueSheet;
      loadCueSheet(data);
      const setter = type === 'script' ? setScript : type === 'cuesheet' ? setCuesheet : setSpec;
      setter((prev) => ({ ...prev, filename: file.name, hash: `size:${file.size}` }));
    } catch {
      // Non-JSON file - just record filename
      const setter = type === 'script' ? setScript : type === 'cuesheet' ? setCuesheet : setSpec;
      setter((prev) => ({ ...prev, filename: file.name, hash: `size:${file.size}` }));
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-lg font-medium">입력 · INPUT SOURCES</h1>
        <span className="mono text-[11px] text-muted-foreground">
          큐시트 파일을 업로드하세요
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SourceCard title="SCRIPT" state={script} onChange={setScript}>
          <Dropzone hint="대본 파일을 끌어다 놓으세요 (.fdx, .pdf)" onFile={(f) => handleFileUpload(f, 'script')} />
        </SourceCard>

        <SourceCard title="CUESHEET" state={cuesheet} onChange={setCuesheet}>
          <Dropzone hint="큐시트 JSON 파일을 끌어다 놓으세요 (.json)" onFile={(f) => handleFileUpload(f, 'cuesheet')} />
        </SourceCard>

        <SourceCard title="STAGE_SPEC" state={spec} onChange={setSpec}>
          <div className="flex flex-col gap-4 p-3">
            <Field label="wings">
              <div className="flex gap-4">
                {(['상수', '하수'] as const).map((w) => (
                  <label key={w} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={wings[w]}
                      onChange={() => setWings((p) => ({ ...p, [w]: !p[w] }))}
                    />
                    {w}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="crossover (백스테이지 통로)">
              <div className="flex gap-4">
                {(['true', 'false', 'UNKNOWN'] as const).map((v) => (
                  <label key={v} className="mono flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="crossover"
                      checked={crossover === v}
                      onChange={() => setCrossover(v)}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="백스테이지 이동 시간 (초)">
              <input
                value={crossoverTime}
                onChange={(e) => setCrossoverTime(e.target.value)}
                className="mono w-20 border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground"
                placeholder="45"
              />
            </Field>

            <Field label="route times">
              <div className="flex flex-col gap-1">
                {routes.map((r, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Cell
                      value={r.from}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, from: v } : x)))
                      }
                    />
                    <span className="mono text-xs">→</span>
                    <Cell
                      value={r.to}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, to: v } : x)))
                      }
                    />
                    <span className="mono text-xs">:</span>
                    <Cell
                      w={44}
                      value={r.min}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, min: v } : x)))
                      }
                    />
                    <span className="mono text-xs">–</span>
                    <Cell
                      w={44}
                      value={r.max}
                      onChange={(v) =>
                        setRoutes((p) => p.map((x, j) => (i === j ? { ...x, max: v } : x)))
                      }
                    />
                    <span className="mono text-[10px] text-muted-foreground">sec</span>
                    <button
                      onClick={() => setRoutes((p) => p.filter((_, j) => j !== i))}
                      className="ml-auto border border-border p-1 hover:bg-muted"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Btn
                  className="mt-1 self-start"
                  onClick={() => setRoutes((p) => [...p, { from: '', to: '', min: '', max: '' }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> 경로 추가
                </Btn>
              </div>
            </Field>
          </div>
        </SourceCard>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => navigate({ to: '/workspace' })}
          className="border border-foreground bg-foreground px-5 py-2.5 text-sm text-background hover:bg-muted-foreground"
        >
          검증 시작
        </button>
      </div>
    </div>
  );
}

function SourceCard({
  title,
  state,
  onChange,
  children,
}: {
  title: string;
  state: SourceState;
  onChange: (s: SourceState) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col border border-border bg-surface">
      <header className="border-b border-border px-3 py-2">
        <div className="mono text-[11px] tracking-[0.14em] text-muted-foreground">{title}</div>
        {state.filename && (
          <>
            <div className="mt-1 text-sm">{state.filename}</div>
            <div className="mono mt-1 text-[10px] text-muted-foreground">{state.hash}</div>
          </>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <OriginBadge origin={state.origin} />
          <ReviewBadge
            reviewed={state.reviewed}
            onToggle={() => onChange({ ...state, reviewed: !state.reviewed })}
          />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Dropzone({ hint, onFile }: { hint: string; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div className="p-3">
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
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) onFile(file);
          };
          input.click();
        }}
        className={cn(
          'flex h-40 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border text-center',
          over ? 'bg-muted' : 'bg-background',
        )}
      >
        <UploadCloud className="h-5 w-5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{hint}</span>
        <span className="mono text-[10px] text-muted-foreground">DROP / CLICK</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Cell({
  value,
  onChange,
  w = 96,
}: {
  value: string;
  onChange: (v: string) => void;
  w?: number;
}) {
  return (
    <input
      value={value}
      style={{ width: w }}
      onChange={(e) => onChange(e.target.value)}
      className="mono border border-border bg-background px-1 py-[2px] text-xs outline-none focus:border-foreground"
    />
  );
}
