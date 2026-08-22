import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileText,
  Info,
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
import { FactReviewPanel, type FactReviewCommand } from '@/components/domain';
import { useStandbyWorkspaceStore } from '@/store';
import type { FactCandidate } from '@/types/standby';
import { authConfigured, getStandbyAccessToken, supabase } from '@/lib/auth';
import { useI18n, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';

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
type SubmitPhase = 'IDLE' | 'UPLOADING' | 'EXTRACTING' | 'REVIEW' | 'VERIFYING' | 'SUCCEEDED' | 'FAILED';

type SelectedSource = {
  file: File;
  sha256: string;
  origin: SourceOrigin;
};

type RouteDraft = {
  id: string;
  routeId: string;
  capacity: string;
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
  accept: string;
  extensions: string[];
}> = {
  SCRIPT: {
    label: 'SCRIPT',
    accept: '.pdf,.docx',
    extensions: ['pdf', 'docx'],
  },
  MASTER_CUE: {
    label: 'MASTER CUE',
    accept: '.xlsx,.pdf,.json',
    extensions: ['xlsx', 'pdf', 'json'],
  },
};

function newRoute(
  from = 'STAGE_LEFT_WING',
  to = 'STAGE_LEFT_CHANGE',
  routeId = '',
): RouteDraft {
  return {
    id: crypto.randomUUID(),
    routeId,
    capacity: '1',
    from,
    to,
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

async function inspectSourceFile(kind: SourceKind, file: File, locale: Locale): Promise<SelectedSource> {
  const config = SOURCE_CONFIG[kind];
  const extension = extensionOf(file.name);

  if (!config.extensions.includes(extension)) {
    throw new Error(locale === 'ko'
      ? `${config.accept.replaceAll(',', ', ')} 형식만 사용할 수 있습니다.`
      : `Only ${config.accept.replaceAll(',', ', ')} files are supported.`);
  }
  if (file.size === 0) throw new Error(locale === 'ko' ? '빈 파일은 사용할 수 없습니다.' : 'Empty files are not supported.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error(locale === 'ko' ? '파일은 50MB 이하여야 합니다.' : 'Files must be 50MB or smaller.');

  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes.slice(0, 5));
  const isPdf = String.fromCharCode(...signature) === '%PDF-';
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b;
  const text = new TextDecoder().decode(bytes);

  if (extension === 'pdf' && !isPdf) throw new Error(locale === 'ko' ? '확장자와 PDF 파일 서명이 일치하지 않습니다.' : 'The extension does not match the PDF file signature.');
  if ((extension === 'docx' || extension === 'xlsx') && !isZip) {
    throw new Error(locale === 'ko' ? '확장자와 Office 파일 서명이 일치하지 않습니다.' : 'The extension does not match the Office file signature.');
  }
  if (extension === 'json') {
    try {
      JSON.parse(text);
    } catch {
      throw new Error(locale === 'ko' ? 'JSON 파일 형식이 올바르지 않습니다.' : 'The JSON file format is invalid.');
    }
  }

  return { file, sha256: await sha256(bytes), origin: SOURCE_ORIGIN };
}

export function InputScreen() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const setWorkspace = useStandbyWorkspaceStore((state) => state.setWorkspace);
  const clearWorkspace = useStandbyWorkspaceStore((state) => state.clear);
  const [script, setScript] = useState<SelectedSource | null>(null);
  const [masterCue, setMasterCue] = useState<SelectedSource | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<SourceKind, string>>>({});
  const [crossover, setCrossover] = useState<Crossover>('UNKNOWN');
  const [minimumChangeSeconds, setMinimumChangeSeconds] = useState('60');
  const [routes, setRoutes] = useState<RouteDraft[]>([
    newRoute('STAGE_LEFT_WING', 'STAGE_LEFT_CHANGE', 'ROUTE_TO_CHANGE'),
    newRoute('STAGE_LEFT_CHANGE', 'STAGE', 'ROUTE_TO_ENTRY'),
  ]);
  const [entities, setEntities] = useState<EntityDraft[]>([newEntity()]);
  const [stageHash, setStageHash] = useState('계산 중');
  const [phase, setPhase] = useState<SubmitPhase>('IDLE');
  const [message, setMessage] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [facts, setFacts] = useState<FactCandidate[]>([]);
  const [authEmail, setAuthEmail] = useState<string | null>(import.meta.env.DEV ? 'local-dev' : null);
  const [loginEmail, setLoginEmail] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthEmail(data.session?.user.email ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user.email ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

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
    route_capacities: routes.map((route) => ({
      route_id: route.routeId.trim(),
      capacity: Number(route.capacity),
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
      errors.push(t('input.error.changeTime'));
    }
    if (routes.length < 2) errors.push(t('input.error.routes'));
    const routeIds = routes.map((route) => route.routeId.trim());
    if (routeIds.some((routeId) => !routeId)) errors.push(t('input.error.routeId'));
    if (new Set(routeIds).size !== routeIds.length) errors.push(t('input.error.routeIdDuplicate'));
    for (const route of routes) {
      const min = Number(route.minSeconds);
      const max = Number(route.maxSeconds);
      const capacity = Number(route.capacity);
      if (route.from === route.to) errors.push(t('input.error.routeSame'));
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
        errors.push(t('input.error.routeTime'));
      }
      if (!Number.isInteger(capacity) || capacity < 1) {
        errors.push(t('input.error.capacity'));
      }
    }
    if (entities.length === 0) errors.push(t('input.error.entity'));
    const entityIds = entities.map((entity) => entity.entityId.trim());
    if (entityIds.some((id) => !id)) errors.push(t('input.error.entityId'));
    if (new Set(entityIds).size !== entityIds.length) errors.push(t('input.error.entityDuplicate'));
    return [...new Set(errors)];
  }, [entities, locale, minimumChangeSeconds, routes]);

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
    setCaseId(null);
    setFacts([]);
    clearWorkspace();
    setSourceErrors((current) => ({ ...current, [kind]: undefined }));
    try {
      const selected = await inspectSourceFile(kind, file, locale);
      if (kind === 'SCRIPT') setScript(selected);
      else setMasterCue(selected);
    } catch (error) {
      if (kind === 'SCRIPT') setScript(null);
      else setMasterCue(null);
      setSourceErrors((current) => ({
        ...current,
        [kind]: error instanceof Error ? error.message : locale === 'ko' ? '파일을 확인할 수 없습니다.' : 'Could not inspect the file.',
      }));
    }
  };

  const ready = Boolean(script && masterCue && stageErrors.length === 0);
  const authenticated = Boolean(authEmail);

  const apiClient = () => {
    const baseUrl = import.meta.env.VITE_STANDBY_API_BASE_URL as string | undefined;
    return baseUrl && (import.meta.env.DEV || authConfigured)
      ? new StandbyApi({ baseUrl, getAccessToken: getStandbyAccessToken })
      : null;
  };

  const startExtraction = async () => {
    if (!script || !masterCue || stageErrors.length > 0) return;

    if (!authenticated) {
      setPhase('FAILED');
      setMessage(t('input.error.login'));
      return;
    }

    const api = apiClient();
    if (!api) {
      setPhase('FAILED');
      setMessage(
        t('input.error.api'),
      );
      return;
    }

    try {
      setPhase('UPLOADING');
      setMessage(t('input.status.upload'));
      const createdCase = await api.createCase(`STANDBY ${new Date().toLocaleString('ko-KR')}`);
      await Promise.all([
        api.uploadSourceFile(createdCase.case_id, 'SCRIPT', script.file, script.origin),
        api.uploadSourceFile(createdCase.case_id, 'MASTER_CUE', masterCue.file, masterCue.origin),
        api.uploadStageSpec(createdCase.case_id, stageSpec, SOURCE_ORIGIN),
      ]);

      setPhase('EXTRACTING');
      setMessage(t('input.status.extract'));
      const operation = await api.startExtraction(createdCase.case_id, 'UPSTAGE_AGENT');
      await api.waitForOperation(operation.operation_id);
      const queue = await api.getReviewQueue(createdCase.case_id);

      setCaseId(createdCase.case_id);
      setFacts(queue.items);
      setPhase('REVIEW');
      setMessage(t('input.status.review', { count: queue.items.length }));
    } catch (error) {
      setPhase('FAILED');
      setMessage(
        error instanceof StandbyApiError
          ? `${error.code}: ${error.message}`
          : error instanceof Error ? error.message : t('input.error.extract'),
      );
    }
  };

  const completeReview = async (reviews: FactReviewCommand[]) => {
    const api = apiClient();
    if (!api || !caseId) {
      setPhase('FAILED');
      setMessage(t('input.error.noCase'));
      return;
    }
    try {
      setPhase('VERIFYING');
      setMessage(t('input.status.verify'));
      if (reviews.length > 0) await api.reviewFacts(caseId, reviews);
      await api.freezeReviewSnapshot(caseId);
      const workspace = await api.getWorkspace(caseId);
      setWorkspace(caseId, workspace);
      setPhase('SUCCEEDED');
      setMessage(t('input.status.done'));
      await navigate({ to: '/workspace' });
    } catch (error) {
      setPhase('FAILED');
      setMessage(
        error instanceof StandbyApiError
          ? `${error.code}: ${error.message}`
          : error instanceof Error ? error.message : t('input.error.review'),
      );
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="border-b border-border pb-5">
          <h1 className="text-2xl font-medium">{t('input.title')}</h1>
        </header>

        {!import.meta.env.DEV && (
          <AuthPanel
            configured={authConfigured}
            email={authEmail}
            loginEmail={loginEmail}
            message={authMessage}
            onEmail={setLoginEmail}
            onSend={async () => {
              if (!supabase || !loginEmail.trim()) return;
              const { error } = await supabase.auth.signInWithOtp({
                email: loginEmail.trim(),
                options: { emailRedirectTo: window.location.origin },
              });
              setAuthMessage(error ? error.message : t('input.linkSent'));
            }}
            onSignOut={async () => {
              await supabase?.auth.signOut();
              setAuthMessage(t('input.signedOut'));
            }}
          />
        )}

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

        <footer className="mt-5 flex justify-end border border-border bg-surface p-4">
          <button
            type="button"
            disabled={!ready || !authenticated || phase === 'UPLOADING' || phase === 'EXTRACTING' || phase === 'REVIEW' || phase === 'VERIFYING'}
            onClick={() => void startExtraction()}
            className={cn(
              'flex min-w-52 items-center justify-center gap-2 border px-5 py-3 text-sm font-medium',
              ready && authenticated && phase !== 'UPLOADING' && phase !== 'EXTRACTING' && phase !== 'REVIEW' && phase !== 'VERIFYING'
                ? 'border-foreground bg-foreground text-background hover:bg-muted-foreground'
                : 'cursor-not-allowed border-border bg-muted text-muted-foreground',
            )}
          >
            {(phase === 'UPLOADING' || phase === 'EXTRACTING') && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {t('input.start')}
          </button>
        </footer>

        {message && <ExtractionStatus phase={phase} message={message} />}

        {facts.length > 0 && (phase === 'REVIEW' || phase === 'VERIFYING' || phase === 'FAILED') && (
          <FactReviewPanel
            key={caseId}
            facts={facts}
            busy={phase === 'VERIFYING'}
            onSubmit={(reviews) => void completeReview(reviews)}
          />
        )}
      </div>
    </main>
  );
}

function AuthPanel({
  configured,
  email,
  loginEmail,
  message,
  onEmail,
  onSend,
  onSignOut,
}: {
  configured: boolean;
  email: string | null;
  loginEmail: string;
  message: string | null;
  onEmail: (value: string) => void;
  onSend: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const { t } = useI18n();
  if (!configured) {
    return (
      <section className="mt-5 border border-insufficient bg-insufficient/10 p-4">
        <p className="text-sm font-medium">{t('input.authMissing')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('input.authMissingHelp')}
        </p>
      </section>
    );
  }
  if (email) {
    return (
      <section className="mt-5 flex items-center justify-between border border-consistent bg-consistent-bg p-4">
        <div><p className="text-sm font-medium">{t('input.authenticated')}</p><p className="mono mt-1 text-[10px] text-muted-foreground">{email}</p></div>
        <button type="button" onClick={() => void onSignOut()} className="border border-border px-3 py-2 text-xs">{t('input.signOut')}</button>
      </section>
    );
  }
  return (
    <section className="mt-5 border border-border bg-surface p-4">
      <p className="text-sm font-medium">{t('input.signIn')}</p>
      <div className="mt-3 flex gap-2">
        <input type="email" value={loginEmail} onChange={(event) => onEmail(event.target.value)} placeholder="team@example.com" className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm" />
        <button type="button" disabled={!loginEmail.trim()} onClick={() => void onSend()} className="border border-foreground bg-foreground px-4 py-2 text-sm text-background disabled:border-border disabled:bg-muted disabled:text-muted-foreground">{t('input.sendLink')}</button>
      </div>
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </section>
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
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const config = SOURCE_CONFIG[kind];
  const Icon = kind === 'SCRIPT' ? FileText : FileSpreadsheet;
  const helper = kind === 'SCRIPT' ? t('input.script.helper') : t('input.cue.helper');

  return (
    <article className="border border-border bg-surface">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="flex gap-3">
          <div className="border border-border p-2"><Icon className="h-4 w-4" /></div>
          <div>
            <p className="mono text-xs font-semibold tracking-[0.1em]">{config.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>
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
        <span className="mt-3 text-sm font-medium">{source ? t('input.replace') : t('input.choose')}</span>
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
          <div className="space-y-2 text-xs">
            <dl className="space-y-2">
              <SourceRow label={t('input.file')} value={source.file.name} />
              <SourceRow label={t('input.size')} value={`${(source.file.size / 1024 / 1024).toFixed(2)} MB`} />
            </dl>
            <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)} className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground"><Info size={12} />{t('input.details')}</button>
            {detailsOpen && (
              <dl className="space-y-2 border-t border-border pt-2">
                <SourceRow label={t('input.origin')} value={source.origin} />
                <SourceRow label="SHA-256" value={`${source.sha256.slice(0, 12)}…`} mono />
              </dl>
            )}
          </div>
        ) : null}
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
  const { t } = useI18n();
  const valid = errors.length === 0;
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article className="border border-border bg-surface">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="flex gap-3">
          <div className="border border-border p-2"><FileSpreadsheet className="h-4 w-4" /></div>
          <div>
            <p className="mono text-xs font-semibold tracking-[0.1em]">STAGE SPEC</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('input.stage.helper')}</p>
          </div>
        </div>
        <AuthorityToken reviewed={valid} />
      </div>

      <div className="space-y-5 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('input.crossover')}>
            <select className="w-full border border-border bg-background px-2 py-2 text-xs" value={crossover} onChange={(event) => onCrossover(event.target.value as Crossover)}>
              <option value="UNKNOWN">{t('input.crossover.unknown')}</option>
              <option value="AVAILABLE">{t('input.crossover.available')}</option>
              <option value="UNAVAILABLE">{t('input.crossover.unavailable')}</option>
            </select>
          </Field>
          <Field label={t('input.minimumChange')}>
            <input className="w-full border border-border bg-background px-2 py-2 text-xs" type="number" min="0" value={minimumChangeSeconds} onChange={(event) => onMinimumChange(event.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">{t('input.routeTimes')}</p>
            <button type="button" className="flex items-center gap-1 text-[11px]" onClick={() => onRoutes([...routes, newRoute()])}><Plus className="h-3 w-3" />{t('input.addRoute')}</button>
          </div>
          <div className="space-y-2">
            {routes.map((route) => (
              <div key={route.id} className="border border-border bg-background p-2">
                <div className="mb-2 grid grid-cols-[1fr_100px] gap-2">
                  <Field label="ROUTE ID">
                    <input
                      aria-label="경로 ID"
                      placeholder="HASU_CROSSOVER"
                      className="w-full border border-border bg-surface px-2 py-1.5 text-xs"
                      value={route.routeId}
                      onChange={(event) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, routeId: event.target.value } : item))}
                    />
                  </Field>
                  <Field label="CAPACITY">
                    <input
                      aria-label="경로 수용 인원"
                      className="w-full border border-border bg-surface px-2 py-1.5 text-xs"
                      type="number"
                      min="1"
                      step="1"
                      value={route.capacity}
                      onChange={(event) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, capacity: event.target.value } : item))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <ZoneSelect value={route.from} onChange={(from) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, from } : item))} />
                  <ZoneSelect value={route.to} onChange={(to) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, to } : item))} />
                  <button type="button" aria-label="경로 삭제" onClick={() => onRoutes(routes.filter((item) => item.id !== route.id))}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TimeInput label={t('input.min')} value={route.minSeconds} onChange={(minSeconds) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, minSeconds } : item))} />
                  <TimeInput label={t('input.max')} value={route.maxSeconds} onChange={(maxSeconds) => onRoutes(routes.map((item) => item.id === route.id ? { ...item, maxSeconds } : item))} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">{t('input.initialState')}</p>
            <button type="button" className="flex items-center gap-1 text-[11px]" onClick={() => onEntities([...entities, newEntity()])}><Plus className="h-3 w-3" />{t('input.addEntity')}</button>
          </div>
          <div className="space-y-2">
            {entities.map((entity) => (
              <div key={entity.id} className="grid grid-cols-[1fr_90px_1fr_auto] gap-2 border border-border bg-background p-2">
                <input aria-label="Entity ID" placeholder={t('input.entityPlaceholder')} className="min-w-0 border border-border bg-surface px-2 py-2 text-xs" value={entity.entityId} onChange={(event) => onEntities(entities.map((item) => item.id === entity.id ? { ...item, entityId: event.target.value } : item))} />
                <select aria-label="엔티티 종류" className="border border-border bg-surface px-2 text-xs" value={entity.kind} onChange={(event) => onEntities(entities.map((item) => item.id === entity.id ? { ...item, kind: event.target.value as EntityDraft['kind'] } : item))}>
                  <option value="PERSON">{t('input.person')}</option><option value="PROP">{t('input.prop')}</option>
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

        <div className="border-t border-border pt-3 text-xs">
          <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)} className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground"><Info size={12} />{t('input.details')}</button>
          {detailsOpen && (
            <dl className="mt-2 space-y-2">
              <SourceRow label={t('input.origin')} value="USER_PROVIDED" />
              <SourceRow label="SHA-256" value={hash === '계산 중' ? hash : `${hash.slice(0, 12)}…`} mono />
            </dl>
          )}
        </div>
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
  const { locale } = useI18n();
  return (
    <select aria-label="무대 구역" className="min-w-0 border border-border bg-surface px-2 py-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
      {ZONES.map(([zone, label]) => <option key={zone} value={zone}>{locale === 'ko' ? label : {
        STAGE: 'Stage',
        STAGE_RIGHT_WING: 'Stage Right Wing',
        STAGE_LEFT_WING: 'Stage Left Wing',
        STAGE_RIGHT_CHANGE: 'Stage Right Change Area',
        STAGE_LEFT_CHANGE: 'Stage Left Change Area',
      }[zone]}</option>)}
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
