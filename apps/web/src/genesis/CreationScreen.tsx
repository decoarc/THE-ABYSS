import { useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { PALETTE } from '../lib/palette';
import type { PartKind, Pattern } from '../services/wire';
import { CATALOG, blueprintCost, nextInstanceCost, previewTraits, validateBlueprint } from './blueprint';
import { canMirror, editorReducer, initialEditorState, type EditorAction, type EditorState } from './editor';
import { submitSpecies } from './genesisApi';

export interface Draft {
  editor: EditorState;
  email: string;
  name: string;
}

export const initialDraft: Draft = { editor: initialEditorState, email: '', name: '' };

export interface PreviewProps {
  state: EditorState;
  dispatch: (action: EditorAction) => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
const LINE = 'rgba(220,235,232,0.18)';

/** Nome e efeito em poucas palavras de cada peça, na ordem do catálogo do design (§5.2). */
const PART_INFO: Record<PartKind, { name: string; effect: string }> = {
  raspador: { name: 'Raspador', effect: 'come a flora' },
  filtro: { name: 'Boca-filtro', effect: 'come partículas soltas' },
  mandibula: { name: 'Mandíbula', effect: 'caça criaturas menores' },
  flagelo: { name: 'Flagelo', effect: 'nada mais rápido' },
  cilios: { name: 'Cílios', effect: 'arranque mais forte' },
  aleta: { name: 'Aleta', effect: 'vira mais rápido' },
  ocelo: { name: 'Ocelo', effect: 'enxerga mais longe' },
  cardume: { name: 'Filamento de cardume', effect: 'anda em grupo' },
  gancho: { name: 'Gancho de abrigo', effect: 'abriga-se na Floresta' },
  placa: { name: 'Placa', effect: 'escapa do bote' },
};

const GROUPS: { title: string; kinds: PartKind[] }[] = [
  { title: 'Boca · só uma', kinds: ['raspador', 'filtro', 'mandibula'] },
  { title: 'Movimento', kinds: ['flagelo', 'cilios', 'aleta'] },
  { title: 'Sentidos', kinds: ['ocelo'] },
  { title: 'Comportamento', kinds: ['cardume', 'gancho'] },
  { title: 'Defesa', kinds: ['placa'] },
];

const PATTERN_LABEL: Record<Pattern, string> = { liso: 'Liso', manchas: 'Manchas', listras: 'Listras', aneis: 'Anéis' };
const DIET_LABEL = { flora: 'flora', particles: 'partículas', predator: 'criaturas menores' } as const;

const CSS = `
.gen-root { position: fixed; inset: 0; display: grid; grid-template-columns: 360px 1fr; background: ${PALETTE.bg}; color: ${PALETTE.fg}; }
.gen-panel { overflow-y: auto; padding: 16px 18px 28px; background: rgba(2,10,16,0.92); border-right: 1px solid ${LINE}; display: flex; flex-direction: column; gap: 18px; }
.gen-stage { position: relative; min-height: 0; }
.gen-root button, .gen-root input, .gen-root select { font: 12px/1.3 ${MONO}; color: ${PALETTE.fg}; }
.gen-root button { cursor: pointer; }
.gen-root button:disabled { cursor: not-allowed; opacity: 0.35; }
.gen-root :focus-visible { outline: 1px solid ${PALETTE.cyan}; outline-offset: 2px; }
.gen-field { width: 100%; box-sizing: border-box; background: rgba(7,24,33,0.9); border: 1px solid rgba(220,235,232,0.25); padding: 8px 9px; }
.gen-field[aria-invalid="true"] { border-color: ${PALETTE.amber}; }
.gen-part { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; width: 100%; text-align: left; background: transparent; border: 1px solid rgba(220,235,232,0.22); padding: 7px 9px; }
.gen-part:not(:disabled):hover { border-color: ${PALETTE.cyan}; }
.gen-chip { background: transparent; border: 1px solid rgba(220,235,232,0.22); padding: 4px 8px; }
.gen-chip[aria-pressed="true"], .gen-chip[aria-checked="true"] { border-color: ${PALETTE.cyan}; color: ${PALETTE.cyan}; }
.gen-range { width: 100%; accent-color: ${PALETTE.cyan}; }
.gen-color { width: 44px; height: 28px; padding: 0; border: 1px solid rgba(220,235,232,0.25); background: transparent; }
.gen-release { width: 100%; padding: 11px 10px; letter-spacing: 0.08em; background: rgba(18,60,71,0.6); border: 1px solid ${PALETTE.cyan}; }
@media (max-width: 760px) {
  .gen-root { grid-template-columns: 1fr; grid-template-rows: 42vh 1fr; }
  .gen-stage { grid-row: 1; }
  .gen-panel { grid-row: 2; border-right: none; border-top: 1px solid ${LINE}; }
}
`;

const labelStyle: CSSProperties = { display: 'block', font: `11px/1.4 ${MONO}`, letterSpacing: '0.08em', opacity: 0.6, marginBottom: 5 };
const headingStyle: CSSProperties = { margin: '0 0 8px', font: `11px/1.4 ${MONO}`, letterSpacing: '0.08em', opacity: 0.6, fontWeight: 400 };
const errorStyle: CSSProperties = { margin: '5px 0 0', font: `11px/1.4 ${MONO}`, color: PALETTE.amber };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 style={headingStyle}>{title.toUpperCase()}</h3>
      {children}
    </section>
  );
}

function Slider({
  id, label, value, min, max, step, onChange, format,
}: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <label htmlFor={id}>{label}</label>
        <span aria-hidden="true">{format(value)}</span>
      </div>
      <input
        id={id}
        className="gen-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

const num = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function Meter({ label, value, base, cap, text }: { label: string; value: number; base: number; cap: number; text: string }) {
  const f = cap > base ? Math.min(Math.max((value - base) / (cap - base), 0), 1) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr 64px', alignItems: 'center', gap: 8, font: `12px/1.9 ${MONO}` }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span aria-hidden="true" style={{ height: 3, background: 'rgba(220,235,232,0.12)' }}>
        <span style={{ display: 'block', height: '100%', width: `${4 + f * 96}%`, background: PALETTE.cyan, opacity: 0.75 }} />
      </span>
      <span style={{ textAlign: 'right' }}>{text}</span>
    </div>
  );
}

type SendState = 'idle' | 'sending' | 'sent' | 'slow_down' | 'failed';

/** Tela de criação (arrumação A): formulário à esquerda, criatura ao vivo à direita. */
export function CreationScreen({
  draft,
  onDraftChange,
  onBack,
  Preview,
}: {
  draft: Draft;
  onDraftChange: (update: (d: Draft) => Draft) => void;
  onBack: () => void;
  Preview: ComponentType<PreviewProps>;
}) {
  const { editor, email, name } = draft;
  const { bp, selected } = editor;
  const [send, setSend] = useState<SendState>('idle');
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});

  const dispatch = (action: EditorAction) => onDraftChange((d) => {
    const next = editorReducer(d.editor, action);
    return next === d.editor ? d : { ...d, editor: next };
  });
  const setField = (field: 'email' | 'name', value: string) => {
    onDraftChange((d) => ({ ...d, [field]: value }));
    setServerErrors((e) => (e[field] ? { ...e, [field]: [] } : e));
  };

  const cost = blueprintCost(bp);
  const errors = validateBlueprint(bp);
  const filled = email.trim() !== '' && name.trim() !== '';
  const canRelease = errors.length === 0 && filled && send !== 'sending';
  const traits = previewTraits(bp);
  const { base, caps } = CATALOG;

  const release = async () => {
    if (!canRelease) return;
    setSend('sending');
    setServerErrors({});
    try {
      const result = await submitSpecies({ email: email.trim(), name: name.trim(), blueprint: bp });
      if (result === 'sent' || result === 'slow_down') setSend(result);
      else {
        setServerErrors(result.errors);
        setSend('idle');
      }
    } catch {
      setSend('failed');
    }
  };

  const fieldError = (field: string) => (serverErrors[field] ?? []).join(' ');
  const emailErr = fieldError('email');
  const nameErr = fieldError('name');
  const part = selected?.kind === 'part' ? bp.parts[selected.index] : undefined;
  const point = selected?.kind === 'point' ? bp.body.spine[selected.index] : undefined;
  const spine = bp.body.spine;
  const [pmin, pmax] = CATALOG.body.points;

  return (
    <div className="gen-root">
      <style>{CSS}</style>
      <form
        className="gen-panel"
        aria-label="Criar espécie"
        onSubmit={(e) => {
          e.preventDefault();
          void release();
        }}
      >
        <div>
          <button type="button" onClick={onBack} className="gen-chip" style={{ padding: '6px 10px', letterSpacing: '0.04em' }}>
            ← Voltar ao abismo
          </button>
          <h2 style={{ margin: '16px 0 2px', font: `400 24px/1.2 ${SERIF}` }}>Nova espécie</h2>
          <p style={{ margin: 0, font: `12px/1.5 ${MONO}`, opacity: 0.6 }}>
            Monte o corpo, escolha as peças e libere no abismo.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="gen-email" style={labelStyle}>E-mail</label>
            <input
              id="gen-email"
              className="gen-field"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={emailErr ? 'true' : undefined}
              aria-describedby={emailErr ? 'gen-email-err' : undefined}
              onChange={(e) => setField('email', e.target.value)}
            />
            {emailErr && <p id="gen-email-err" style={errorStyle}>{emailErr}</p>}
          </div>
          <div>
            <label htmlFor="gen-name" style={labelStyle}>Nome da espécie</label>
            <input
              id="gen-name"
              className="gen-field"
              type="text"
              maxLength={32}
              value={name}
              aria-invalid={nameErr ? 'true' : undefined}
              aria-describedby={nameErr ? 'gen-name-err' : undefined}
              onChange={(e) => setField('name', e.target.value)}
            />
            {nameErr && <p id="gen-name-err" style={errorStyle}>{nameErr}</p>}
          </div>
        </div>

        <Section title="Peças">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {GROUPS.map((g) => (
              <div key={g.title} role="group" aria-label={g.title}>
                <div style={{ font: `10px/1.4 ${MONO}`, letterSpacing: '0.08em', opacity: 0.45, marginBottom: 4 }}>{g.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.kinds.map((kind) => {
                    const next = nextInstanceCost(bp, kind);
                    const info = PART_INFO[kind];
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="gen-part"
                        disabled={next === null}
                        onClick={() => dispatch({ type: 'addPart', kind })}
                      >
                        <span>
                          {info.name}
                          <span style={{ opacity: 0.55 }}> · {info.effect}</span>
                        </span>
                        <span style={{ color: PALETTE.cyan }}>{next === null ? '—' : `+${next}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="No corpo">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {spine.map((_, i) => (
              <button
                key={`p${i}`}
                type="button"
                className="gen-chip"
                aria-pressed={selected?.kind === 'point' && selected.index === i}
                onClick={() => dispatch({ type: 'select', selected: { kind: 'point', index: i } })}
              >
                ponto {i + 1}
              </button>
            ))}
            {bp.parts.map((p, i) => (
              <button
                key={`q${i}`}
                type="button"
                className="gen-chip"
                aria-pressed={selected?.kind === 'part' && selected.index === i}
                onClick={() => dispatch({ type: 'select', selected: { kind: 'part', index: i } })}
              >
                {PART_INFO[p.kind].name.toLowerCase()}{p.mirror ? ' ×2' : ''}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className="gen-chip"
              disabled={spine.length >= pmax}
              onClick={() => dispatch({ type: 'addPoint' })}
            >
              + ponto
            </button>
          </div>

          {part && selected && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${LINE}` }}>
              <div style={{ font: `400 16px/1.3 ${SERIF}` }}>{PART_INFO[part.kind].name}</div>
              <Slider id="gen-size" label="Tamanho" value={part.size} min={CATALOG.part_size[0]} max={CATALOG.part_size[1]} step={0.05}
                format={(v) => num(v)} onChange={(v) => dispatch({ type: 'setPartSize', index: selected.index, size: v })} />
              <Slider id="gen-angle" label="Inclinação" value={part.angle} min={CATALOG.part_angle[0]} max={CATALOG.part_angle[1]} step={0.05}
                format={(v) => `${Math.round((v * 180) / Math.PI)}°`} onChange={(v) => dispatch({ type: 'setPartAngle', index: selected.index, angle: v })} />
              <Slider id="gen-at" label="Ao longo (cauda → cabeça)" value={part.at} min={0} max={1} step={0.01}
                format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => dispatch({ type: 'movePart', index: selected.index, at: v, around: part.around })} />
              <Slider id="gen-around" label="Em volta" value={part.around} min={-Math.PI} max={Math.PI} step={0.05}
                format={(v) => `${Math.round((v * 180) / Math.PI)}°`} onChange={(v) => dispatch({ type: 'movePart', index: selected.index, at: part.at, around: v })} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, font: `12px/1.4 ${MONO}` }}>
                <input
                  type="checkbox"
                  checked={part.mirror}
                  disabled={!part.mirror && !canMirror(bp, selected.index)}
                  onChange={() => dispatch({ type: 'toggleMirror', index: selected.index })}
                />
                Espelhar dos dois lados
              </label>
              <button type="button" className="gen-chip" style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'removePart', index: selected.index })}>
                Remover peça
              </button>
            </div>
          )}

          {point && selected && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${LINE}` }}>
              <div style={{ font: `400 16px/1.3 ${SERIF}` }}>Ponto {selected.index + 1} da espinha</div>
              <Slider id="gen-r" label="Espessura" value={point[2]} min={CATALOG.body.r[0]} max={CATALOG.body.r[1]} step={0.01}
                format={(v) => num(v)} onChange={(v) => dispatch({ type: 'setThickness', index: selected.index, r: v })} />
              <Slider id="gen-x" label="Frente ↔ trás" value={point[0]} min={-CATALOG.body.length_max} max={CATALOG.body.length_max} step={0.02}
                format={(v) => num(v)} onChange={(v) => dispatch({ type: 'movePoint', index: selected.index, x: v, y: point[1] })} />
              <Slider id="gen-y" label="Curva" value={point[1]} min={-CATALOG.body.bend_max} max={CATALOG.body.bend_max} step={0.02}
                format={(v) => num(v)} onChange={(v) => dispatch({ type: 'movePoint', index: selected.index, x: point[0], y: v })} />
              <button
                type="button"
                className="gen-chip"
                style={{ marginTop: 10 }}
                disabled={spine.length <= pmin}
                onClick={() => dispatch({ type: 'removePoint' })}
              >
                Remover ponto
              </button>
            </div>
          )}
          {!selected && (
            <p style={{ margin: '8px 0 0', font: `11px/1.5 ${MONO}`, opacity: 0.5 }}>
              Escolha um ponto ou uma peça para ajustar. Na criatura: arraste os pontos para esticar e curvar, a roda do mouse sobre um ponto muda a espessura, e as peças deslizam sobre o corpo.
            </p>
          )}
        </Section>

        <Section title="Cores e padrão">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px/1.4 ${MONO}` }}>
              <input type="color" className="gen-color" value={bp.colors.glow} onChange={(e) => dispatch({ type: 'setColor', which: 'glow', hex: e.target.value })} />
              Brilho
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12px/1.4 ${MONO}` }}>
              <input type="color" className="gen-color" value={bp.colors.body} onChange={(e) => dispatch({ type: 'setColor', which: 'body', hex: e.target.value })} />
              Corpo
            </label>
          </div>
          <div role="radiogroup" aria-label="Padrão" style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
            {(CATALOG.patterns as Pattern[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={bp.pattern === p}
                className="gen-chip"
                onClick={() => dispatch({ type: 'setPattern', pattern: p })}
              >
                {PATTERN_LABEL[p]}
              </button>
            ))}
          </div>
        </Section>

        <Section title="O que ela faz">
          <div style={{ font: `12px/1.9 ${MONO}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ opacity: 0.6 }}>come</span>
            <span>{DIET_LABEL[traits.diet]}</span>
          </div>
          <Meter label="velocidade" value={traits.max_speed} base={0} cap={caps.max_speed} text={num(traits.max_speed)} />
          <Meter label="arranque" value={traits.burst} base={base.burst} cap={caps.burst} text={num(traits.burst)} />
          <Meter label="giro" value={traits.turn_rate} base={base.turn_rate} cap={caps.turn_rate} text={num(traits.turn_rate)} />
          <Meter label="percepção" value={traits.perception} base={base.perception} cap={caps.perception} text={num(traits.perception, 1)} />
          <Meter label="defesa" value={traits.escape} base={0} cap={caps.escape} text={`${Math.round(traits.escape * 100)}%`} />
          <Meter label="gasto" value={traits.metabolism} base={0} cap={0.4} text={num(traits.metabolism, 3)} />
          {(traits.school || traits.shelter) && (
            <p style={{ margin: '4px 0 0', font: `11px/1.5 ${MONO}`, opacity: 0.6 }}>
              {[traits.school && 'anda em cardume', traits.shelter && 'busca abrigo na Floresta'].filter(Boolean).join(' · ')}
            </p>
          )}
        </Section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: `11px/1.4 ${MONO}`, letterSpacing: '0.08em', marginBottom: 5 }}>
              <span style={{ opacity: 0.6 }}>ORÇAMENTO</span>
              <span>{cost} usados de {CATALOG.budget}</span>
            </div>
            <div
              role="meter"
              aria-label="Orçamento"
              aria-valuemin={0}
              aria-valuemax={CATALOG.budget}
              aria-valuenow={cost}
              style={{ height: 4, background: 'rgba(220,235,232,0.12)' }}
            >
              <div style={{ height: '100%', width: `${Math.min(cost / CATALOG.budget, 1) * 100}%`, background: PALETTE.cyan }} />
            </div>
          </div>
          {(errors.length > 0 || (serverErrors.blueprint ?? []).length > 0) && (
            <ul style={{ margin: 0, paddingLeft: 16, font: `11px/1.5 ${MONO}`, color: PALETTE.amber }}>
              {[...new Set([...errors, ...(serverErrors.blueprint ?? [])])].map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {!filled && errors.length === 0 && (
            <p style={{ margin: 0, font: `11px/1.5 ${MONO}`, opacity: 0.6 }}>Falta o e-mail e o nome para liberar.</p>
          )}
          <button
            type="submit"
            className="gen-release"
            disabled={!canRelease}
            aria-busy={send === 'sending'}
            onClick={(e) => {
              // Clique trata aqui; Enter num campo chega pelo onSubmit do formulário.
              e.preventDefault();
              void release();
            }}
          >
            Liberar no abismo
          </button>
          <div role="status" style={{ font: `12px/1.5 ${MONO}`, minHeight: 18 }}>
            {send === 'sent' && 'Enviamos um link para o seu e-mail. Ele vale por 30 minutos.'}
            {send === 'slow_down' && 'Muitas tentativas. Espere alguns minutos e tente de novo.'}
            {send === 'failed' && 'Não foi possível falar com o abismo. Tente de novo.'}
          </div>
        </section>
      </form>
      <div className="gen-stage">
        <Preview state={editor} dispatch={dispatch} />
      </div>
    </div>
  );
}
