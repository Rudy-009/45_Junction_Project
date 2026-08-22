import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Plus,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  StandbyApi,
  StandbyApiError,
  type SourceOrigin,
} from '@/lib/standby-api';
import { cn } from '@/lib/utils';

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const SOURCE_ORIGIN: SourceOrigin = 'USER_PROVIDED';

const ZONES = [
  ['STAGE', '무대'],
  ['STAGE_RIGHT_WING', '상수윙'],
  ['STAGE_LEFT_WING', '하수윙'],
  ['STAGE_RIGHT_CHANGE', '상수 환복소'],
  ['STAGE_LEFT_CHANGE', '하수 환복소'],
] as const;

type SourceKind = 'SCRIPT' | 'MASTER_CUE';
type Crossover = 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';
type SubmitPhase = 'IDLE' | 'UPLOADING' | 'EXTRACTING' | 'SUCCEEDED' | 'FAILED';

type SelectedSource = {
  file: File;
  sha256: string;
  origin: SourceOrigin;
};

type RouteDraft = {
  id: string;
  from: string;
  to: string;
  minSeconds: string;
  maxSeconds: string;
};

type EntityDraft = {
  id: string;
  entityId: string;
  kind: 'PERSON' | 'PROP';
  zone: string;
};

const SOURCE_CONFIG: Record<SourceKind, {
  label: string;
  helper: string;
  accept: string;
  extensions: string[];
}> = {
  SCRIPT: {
    label: 'SCRIPT',
    helper: '대사·지문·등퇴장 위치가 담긴 원 대본',
    accept: '.pdf,.docx',
    extensions: ['pdf', 'docx'],
  },
  MASTER_CUE: {
    label: 'MASTER CUE',
    helper: '사람이 통합하고 승인한 마스터 큐시트',
    accept: '.xlsx,.pdf',
    extensions: ['xlsx', 'pdf'],
  },
};

function newRoute(): RouteDraft {
  return {
    id: crypto.randomUUID(),
    from: 'STAGE_LEFT_WING',
    to: 'STAGE_LEFT_CHANGE',
    minSeconds: '',
    maxSeconds: '',
  };
}

function newEntity(): EntityDraft {
  return {
    id: crypto.randomUUID(),
    entityId: '',
    kind: 'PERSON',
    zone: 'STAGE',
  };
}

function extensionOf(filename: string) {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: BufferSource) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function inspectSourceFile(kind: SourceKind, file: File): Promise<SelectedSource> {
  const config = SOURCE_CONFIG[kind];
  const extension = extensionOf(file.name);

  if (!config.extensions.includes(extension)) {
    throw new Error(`${config.accept.replaceAll(',', ', ')} 형식만 사용할 수 있습니다.`);
  }
  if (file.size === 0) throw new Error('빈 파일은 사용할 수 없습니다.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('파일은 50MB 이하여야 합니다.');

  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes.slice(0, 5));
  const isPdf = String.fromCharCode(...signature) === '%PDF-';
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b;

  if (extension === 'pdf' && !isPdf) throw new Error('확장자와 PDF 파일 서명이 일치하지 않습니다.');
  if ((extension === 'docx' || extension === 'xlsx') && !isZip) {
    throw new Error('확장자와 Office 파일 서명이 일치하지 않습니다.');
  }

  return { file, sha256: await sha256(bytes), origin: SOURCE_ORIGIN };
}

export function InputScreen() {
  const [script, setScript] = useState<SelectedSource | null>(null);
  const [masterCue, setMasterCue] = useState<SelectedSource | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<SourceKind, string>>>({});
  const [crossover, setCrossover] = useState<Crossover>('UNKNOWN');
  const [minimumChangeSeconds, setMinimumChangeSeconds] = useState('60');
  const [routes, setRoutes] = useState<RouteDraft[]>([newRoute()]);
  const [entities, setEntities] = useState<EntityDraft[]>([newEntity()]);
  const [stageHash, setStageHash] = useState('계산 중');
  const [phase, setPhase] = useState<SubmitPhase>('IDLE');
  const [message, setMessage] = useState<string | null>(null);

  const stageSpec = useMemo(() => ({
    contract_version: 'standby.stage-spec.v1',
    wings: ['STAGE_RIGHT_WING', 'STAGE_LEFT_WING'],
    crossover,
    route_times: routes.map((route) => ({
      from: route.from,
      to: route.to,
      min_ms: Math.round(Number(route.minSeconds) * 1000),
      max_ms: Math.round(Number(route.maxSeconds) * 1000),
    })),
    minimum_change_ms: Math.round(Number(minimumChangeSeconds) * 1000),
    initial_state: entities.map((entity) => ({
      entity_id: entity.entityId.trim(),
      kind: entity.kind,
      zone: entity.zone,
    })),
    source_evidence: {
      quote: '사용자가 STANDBY 입력 화면에서 직접 확인한 무대 사양',
      locator: 'STAGE_SPEC_FORM',
    },
  }), [crossover, entities, minimumChangeSeconds, routes]);

  const stageErrors = useMemo(() => {
    const errors: string[] = [];
    const changeSeconds = Number(minimumChangeSeconds);
    if (!Number.isFinite(changeSeconds) || changeSeconds < 0) {
      errors.push('최소 환복 시간은 0 이상의 숫자여야 합니다.');
    }
    if (routes.length === 0) errors.push('이동 경로가 최소 1개 필요합니다.');
    for (const route of routes) {
      const min = Number(route.minSeconds);
      const max = Number(route.maxSeconds);
      if (route.from === route.to) errors.push('이동 경로의 출발과 도착은 달라야 합니다.');
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
        errors.push('이동 시간은 0 이상이며 최소 시간이 최대 시간보다 작아야 합니다.');
      }
    }
    if (entities.length === 0) errors.push('초기 배치가 최소 1개 필요합니다.');
    const entityIds = entities.map((entity) => entity.entityId.trim());
    if (entityIds.some((id) => !id)) errors.push('모든 초기 배치에 엔티티 ID가 필요합니다.');
    if (new Set(entityIds).size !== entityIds.length) errors.push('엔티티 ID는 중복될 수 없습니다.');
    return [...new Set(errors)];
  }, [entities, minimumChangeSeconds, routes]);

  useEffect(() => {
    let active = true;
    void sha256(new TextEncoder().encode(JSON.stringify(stageSpec))).then((hash) => {
      if (active) setStageHash(hash);
    });
    return () => { active = false; };
  }, [stageSpec]);

  const selectSource = async (kind: SourceKind, file: File) => {
    setPhase('IDLE');
    setMessage(null);
    setSourceErrors((current) => ({ ...current, [kind]: undefined }));
    try {
      const selected = await inspectSourceFile(kind, file);
      if (kind === 'SCRIPT') setScript(selected);
      else setMasterCue(selected);
    } catch (error) {
      if (kind === 'SCRIPT') setScript(null);
      else setMasterCue(null);
      setSourceErrors((current) => ({
        ...current,
        [kind]: error instanceof Error ? error.message : '파일을 확인할 수 없습니다.',
      }));
    }
  };

  const ready = Boolean(script && masterCue && stageErrors.length === 0);

  const startExtraction = async () => {
    if (!script || !masterCue || stageErrors.length > 0) return;

    const baseUrl = import.meta.env.VITE_STANDBY_API_BASE_URL as string | undefined;
    const localToken = import.meta.env.DEV
      ? (import.meta.env.VITE_STANDBY_API_TOKEN as string | undefined) ?? 'local-dev-token'
      : undefined;

    if (!baseUrl || !localToken) {
      setPhase('FAILED');
      setMessage(
        '세 입력은 준비됐지만 Production 인증 백엔드가 아직 연결되지 않았습니다. API key를 브라우저에 넣지 않고 서버 연결 후 추출해야 합니다.',
      );
      return;
    }

    const api = new StandbyApi({ baseUrl, getAccessToken: () => localToken });
    try {
      setPhase('UPLOADING');
      setMessage('Case를 만들고 세 입력을 업로드하고 있습니다.');
      const createdCase = await api.createCase(`STANDBY ${new Date().toLocaleString('ko-KR')}`);
      await Promise.all([
        api.uploadSourceFile(createdCase.case_id, 'SCRIPT', script.file, script.origin),
        api.uploadSourceFile(createdCase.case_id, 'MASTER_CUE', masterCue.file, masterCue.origin),
        api.uploadStageSpec(createdCase.case_id, stageSpec, SOURCE_ORIGIN),
      ]);

      setPhase('EXTRACTING');
      setMessage('Upstage가 입력에서 fact 후보를 추출하고 있습니다. 판정에는 아직 반영되지 않습니다.');
      const operation = await api.startExtraction(createdCase.case_id, 'UPSTAGE_AGENT');
      await api.waitForOperation(operation.operation_id);
      const queue = await api.getReviewQueue(createdCase.case_id);

      setPhase('SUCCEEDED');
      setMessage(`${queue.items.length}개의 fact 후보를 추출했습니다. 모두 UNREVIEWED 상태이며 사람의 승인이 필요합니다.`);
    } catch (error) {
      setPhase('FAILED');
      setMessage(
        error instanceof StandbyApiError
          ? `${error.code}: ${error.message}`
          : error instanceof Error ? error.message : '추출을 시작할 수 없습니다.',
      );
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="border-b border-border pb-5">
          <p className="mono text-[11px] tracking-[0.18em] text-muted-foreground">STANDBY / SOURCE INTAKE</p>
          <div className="mt-2 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-2xl font-medium">공연 검증 입력</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                대본·사람이 통합한 마스터 큐시트·무대 사양을 한 공연 순서로 대조합니다.
                AI는 fact 후보만 만들고, 검증 판정은 승인된 사실과 결정론적 규칙으로 수행합니다.
              </p>
            </div>
            <div className="mono text-[11px] text-muted-foreground">
              3 SOURCES · HUMAN AUTHORITY · EVIDENCE ALWAYS
            </div>
          </div>
        </header>

        <section className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          <SourceCard
            kind="SCRIPT"
            source={script}
            error={sourceErrors.SCRIPT}
            onFile={(file) => void selectSource('SCRIPT', file)}
          />
          <SourceCard
            kind="MASTER_CUE"
            source={masterCue}
            error={sourceErrors.MASTER_CUE}
            onFile={(file) => void selectSource('MASTER_CUE', file)}
          />
          <StageSpecCard
            crossover={crossover}
            minimumChangeSeconds={minimumChangeSeconds}
            routes={routes}
            entities={entities}
            hash={stageHash}
            errors={stageErrors}
            onCrossover={setCrossover}
            onMinimumChange={setMinimumChangeSeconds}
            onRoutes={setRoutes}
            onEntities={setEntities}
          />
        </section>

        <footer className="mt-5 flex flex-col gap-3 border border-border bg-surface p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium">리뷰 게이트</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              여기서 REVIEWED는 입력 역할과 파일을 사람이 확인했다는 뜻입니다. 추출된 fact는 별도로 승인될 때까지 UNREVIEWED입니다.
            </p>
          </div>
          <button
            type="button"
            disabled={!ready || phase === 'UPLOADING' || phase === 'EXTRACTING'}
            onClick={() => void startExtraction()}
            className={cn(
              'flex min-w-52 items-center justify-center gap-2 border px-5 py-3 text-sm font-medium',
              ready && phase !== 'UPLOADING' && phase !== 'EXTRACTING'
                ? 'border-foreground bg-foreground text-background hover:bg-muted-foreground'
                : 'cursor-not-allowed border-border bg-muted text-muted-foreground',
            )}
          >
            {(phase === 'UPLOADING' || phase === 'EXTRACTING') && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Upstage Fact 추출 시작
          </button>
        </footer>

        {message && <ExtractionStatus phase={phase} message={message} />}
      </div>
    </main>
  );
}

function SourceCard({
  kind,
  source,
  error,
  onFile,
}: {
  kind: SourceKind;
  source: SelectedSource | null;
  error?: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const config = SOURCE_CONFIG[kind];
  const Icon = kind === 'SCRIPT' ? FileText : FileSpreadsheet;

  return (
    <article className="border border-border bg-surface">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="flex gap-3">
          <div className="border border-border p-2"><Icon className="h-4 w-4" /></div>
          <div>
            <p className="mono text-xs font-semibold tracking-[0.1em]">{config.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{config.helper}</p>
          </div>
        </div>
        <AuthorityToken reviewed={Boolean(source)} />
      </div>

      <button
        type="button"
        className={cn(
          'm-4 flex min-h-40 w-[calc(100%-2rem)] flex-col items-center justify-center border border-dashed p-5 text-center',
          dragging ? 'border-foreground bg-muted' : error ? 'border-violation bg-violation-bg' : 'border-border bg-background',
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <span className="mt-3 text-sm font-medium">{source ? '다른 파일 선택' : '파일 선택 또는 드롭'}</span>
        <span className="mono mt-1 text-[11px] text-muted-foreground">{config.accept.replaceAll(',', ' · ')} / MAX 50MB</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={config.accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />

      <div className="border-t border-border p-4">
        {error ? (
          <div className="flex gap-2 text-xs leading-5 text-violation">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        ) : source ? (
          <dl className="space-y-2 text-xs">
            <SourceRow label="FILE" value={source.file.name} />
            <SourceRow label="SIZE" value={`${(source.file.size / 1024 / 1024).toFixed(2)} MB`} />
            <SourceRow label="ORIGIN" value={source.origin} />
            <SourceRow label="SHA-256" value={`${source.sha256.slice(0, 12)}…`} mono />
          </dl>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">선택 전에는 파일명이나 검증 결과를 가정하지 않습니다.</p>
        )}
      </div>
    </article>
  );
}

function StageSpecCard({
  crossover,
  minimumChangeSeconds,
  routes,
  entities,
  hash,
  errors,
  onCrossover,
  onMinimumChange,
  onRoutes,
  onEntities,
}: {
  crossover: Crossover;
  minimumChangeSeconds: string;
  routes: RouteDraft[];
  entities: EntityDraft[];
  hash: string;
  errors: string[];
  onCrossover: (value: Crossover) => void;
  onMinimumChange: (value: string) => void;
  onRoutes: (value: RouteDraft[]) => void;
  onEntities: (value: EntityDraft[]) => void;
}) {
  const valid = errors.length === 0;

  return (
    <article className="border border-border bg-surface">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="flex gap-3">
          <div className="border border-border p-2"><FileSpreadsheet className="h-4 w-4" /></div>
          <div>
            <p className="mono text-xs font-semibold tracking-[0.1em]">STAGE SPEC</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">윙·통로·이동시간·초기 배치를 직접 확인</p>
          </div>
        </div>
        <AuthorityToken reviewed={valid} />
      </div>

      <div className="space-y-5 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="백스테이지 통로">
            <select className="w-full border border-border bg-background px-2 py-2 text-xs" value={crossover} onChange={(event) => onCrossover(event.target.value as Crossover)}>
              <option value="UNKNOWN">확인 필요</option>
              <option value="AVAILABLE">있음</option>
              <option value="UNAVAILABLE">없음</option>
            </select>
          </Field>
          <Field label="최소 환복 시간 (초)">
            <input className="w-full border border-border bg-background px-2 py-2 text-xs" type="number" min="0" value={minimumChangeSeconds} onChange={(event) => onMinimumChange(event.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="mono text-[11px] text-muted-foreground">ROUTE TIMES</p>
            <button type="button" className="flex items-center gap-1 text-[11px]" onClick={() => onRoutes([...routes, newRoute()])}><Plus className="h-3 w-3" />경로</button>
          </div>
          <div className="space-y-2">
            {routes.map((route) => (
              <div key={route.id} className="border border-border bg-background p-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <ZoneSelect value={route.from} onChange={(from) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, from } : item))} />
                  <ZoneSelect value={route.to} onChange={(to) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, to } : item))} />
                  <button type="button" aria-label="경로 삭제" onClick={() => onRoutes(routes.filter((item) => item.id !== route.id))}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TimeInput label="MIN SEC" value={route.minSeconds} onChange={(minSeconds) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, minSeconds } : item))} />
                  <TimeInput label="MAX SEC" value={route.maxSeconds} onChange={(maxSeconds) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, maxSeconds } : item))} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="mono text-[11px] text-muted-foreground">INITIAL STATE</p>
            <button type="button" className="flex items-center gap-1 text-[11px]" onClick={() => onEntities([...entities, newEntity()])}><Plus className="h-3 w-3" />배치</button>
          </div>
          <div className="space-y-2">
            {entities.map((entity) => (
              <div key={entity.id} className="grid grid-cols-[1fr_90px_1fr_auto] gap-2 border border-border bg-background p-2">
                <input aria-label="엔티티 ID" placeholder="인물/소품 ID" className="min-w-0 border border-border bg-surface px-2 py-2 text-xs" value={entity.entityId} onChange={(event) => onEntities(entities.map((item) => item.id === entity.id ? { ...item, entityId: event.target.value } : item))} />
                <select aria-label="엔티티 종류" className="border border-border bg-surface px-2 text-xs" value={entity.kind} onChange={(event) => onEntities(entities.map((item) => item.id === entity.id ? { ...item, kind: event.target.value as EntityDraft['kind'] } : item))}>
                  <option value="PERSON">사람</option><option value="PROP">소품</option>
                </select>
                <ZoneSelect value={entity.zone} onChange={(zone) => onEntities(entities.map((item) => item.id === entity.id ? { ...item, zone } : item))} />
                <button type="button" aria-label="초기 배치 삭제" onClick={() => onEntities(entities.filter((item) => item.id !== entity.id))}><X className="h-4 w-4 text-muted-foreground" /></button>
              </div>
            ))}
          </div>
        </div>

        {errors.length > 0 && (
          <div className="border border-review bg-review-bg p-3 text-xs leading-5 text-review">
            {errors.map((error) => <p key={error}>· {error}</p>)}
          </div>
        )}

        <dl className="border-t border-border pt-3 text-xs">
          <SourceRow label="ORIGIN" value="USER_PROVIDED" />
          <SourceRow label="SHA-256" value={hash === '계산 중' ? hash : `${hash.slice(0, 12)}…`} mono />
        </dl>
      </div>
    </article>
  );
}

function AuthorityToken({ reviewed }: { reviewed: boolean }) {
  return (
    <span className={cn('mono border px-2 py-1 text-[10px]', reviewed ? 'border-consistent text-consistent' : 'border-review text-review')}>
      {reviewed ? 'REVIEWED' : 'UNREVIEWED'}
    </span>
  );
}

function SourceRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
      <dt className="mono text-[10px] text-muted-foreground">{label}</dt>
      <dd className={cn('truncate text-right', mono && 'mono')}>{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>{children}</label>;
}

function ZoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select aria-label="무대 구역" className="min-w-0 border border-border bg-surface px-2 py-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
      {ZONES.map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
    </select>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[54px_1fr] items-center gap-2">
      <span className="mono text-[9px] text-muted-foreground">{label}</span>
      <input className="min-w-0 border border-border bg-surface px-2 py-1 text-xs" type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ExtractionStatus({ phase, message }: { phase: SubmitPhase; message: string }) {
  const success = phase === 'SUCCEEDED';
  return (
    <div className={cn('mt-4 flex gap-3 border p-4', success ? 'border-consistent bg-consistent-bg' : phase === 'FAILED' ? 'border-review bg-review-bg' : 'border-border bg-surface')}>
      {success ? <Check className="h-5 w-5 shrink-0 text-consistent" /> : phase === 'FAILED' ? <AlertTriangle className="h-5 w-5 shrink-0 text-review" /> : <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" />}
      <div><p className="mono text-[10px] text-muted-foreground">{phase}</p><p className="mt-1 text-sm leading-6">{message}</p></div>
    </div>
  );
}
