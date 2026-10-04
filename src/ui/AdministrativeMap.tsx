import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useId,
} from 'react';
import { atlasPosition, ATLAS_SIZE } from '../engine/atlas';
import { routeTo } from '../engine/strategy';
import type { State, World } from '../engine/types';
import type { GalaxyHandle, SceneSector } from './GalaxyScene';
import {
  ATLAS_DISTRICTS,
  ATLAS_INK,
  IMPERIAL_BORDER,
  FOUNDATION_BORDER,
  atlasLabels,
} from './atlasDrawing';

export type AtlasLayer = 'risk' | 'supply' | 'trade';
interface Props {
  world: World;
  state: State;
  sectors: SceneSector[];
  selected?: number;
  network: boolean;
  layer: AtlasLayer;
  onSelect: (i: number) => void;
}
const colors = ['#ef9a91', '#dbbf79', '#92cfb6'];

const AdministrativeMap = forwardRef<GalaxyHandle, Props>(function AdministrativeMap(
  { world, state, sectors, selected, network, layer, onSelect },
  ref,
) {
  const svg = useRef<SVGSVGElement>(null);
  const crop = useId();
  const grid = useId();
  const [viewport, setViewport] = useState({ width: 1100, height: 680 });
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 });
  const cameraRef = useRef(camera);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; k: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  cameraRef.current = camera;
  const limit = (c: typeof camera) => ({
    k: c.k,
    x: Math.max(ATLAS_SIZE.width * (1 - c.k) - 80, Math.min(80, c.x)),
    y: Math.max(ATLAS_SIZE.height * (1 - c.k) - 60, Math.min(60, c.y)),
  });
  const zoom = (factor: number, center = { x: 672, y: 455 }) =>
    setCamera((c) => {
      const k = Math.max(1, Math.min(5, c.k / factor));
      return limit({
        k,
        x: center.x - ((center.x - c.x) * k) / c.k,
        y: center.y - ((center.y - c.y) * k) / c.k,
      });
    });
  useImperativeHandle(ref, () => ({ reset: () => setCamera({ x: 0, y: 0, k: 1 }), zoom }));
  const point = (x: number, y: number) => {
    const p = svg.current!.createSVGPoint();
    p.x = x;
    p.y = y;
    return p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.12 : 0.88, point(e.clientX, e.clientY));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (selected === undefined || cameraRef.current.k <= 1.2) return;
    const [x, y] = atlasPosition(world, selected);
    setCamera((c) => limit({ ...c, x: 672 - x * c.k, y: 455 - y * c.k }));
  }, [selected, world]);
  const path = selected === undefined ? [] : routeTo(world, state, selected);
  const positions = useMemo(
    () => Array.from({ length: world.n }, (_, i) => atlasPosition(world, i)),
    [world],
  );
  const labels = atlasLabels(world, positions, camera, viewport, selected);
  const scale = Math.max(0.001, Math.min(viewport.width / 1344, viewport.height / 910));
  const markerScale = Math.min(2.5, 1 / Math.max(0.1, scale * camera.k));
  return (
    <svg
      className={`administrative-map ${dragging ? 'dragging' : ''}`}
      ref={svg}
      viewBox="0 0 1344 910"
      aria-label="重绘银河行政星图"
      role="group"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === '+' || e.key === '=') zoom(0.8);
        else if (e.key === '-') zoom(1.25);
        else if (e.key === '0') setCamera({ x: 0, y: 0, k: 1 });
        else if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          setCamera((c) =>
            limit({
              ...c,
              x: c.x + (e.key === 'ArrowRight' ? -65 : e.key === 'ArrowLeft' ? 65 : 0),
              y: c.y + (e.key === 'ArrowDown' ? -65 : e.key === 'ArrowUp' ? 65 : 0),
            }),
          );
        }
      }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('[data-atlas-node]')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        setDragging(true);
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: cameraRef.current.k };
        }
      }}
      onPointerMove={(e) => {
        const previous = pointers.current.get(e.pointerId);
        if (!previous) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2 && gesture.current) {
          const [a, b] = [...pointers.current.values()];
          const wanted = Math.max(
            1,
            Math.min(
              5,
              (gesture.current.k * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.current.distance,
            ),
          );
          zoom(cameraRef.current.k / wanted, point((a.x + b.x) / 2, (a.y + b.y) / 2));
        } else {
          const p = point(previous.x, previous.y),
            q = point(e.clientX, e.clientY);
          setCamera((c) => limit({ ...c, x: c.x + q.x - p.x, y: c.y + q.y - p.y }));
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
        setDragging(pointers.current.size > 0);
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
        setDragging(false);
      }}
    >
      <defs>
        <clipPath id={crop}>
          <rect width="1344" height="910" />
        </clipPath>
        <pattern id={grid} width="64" height="64" patternUnits="userSpaceOnUse">
          <path
            d="M64 0 H0 V64"
            fill="none"
            stroke="#71908e"
            strokeOpacity="0.12"
            strokeWidth="0.7"
          />
        </pattern>
      </defs>
      <g clipPath={`url(#${crop})`}>
        <rect width="1344" height="910" fill="#0b1216" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <g pointerEvents="none" aria-hidden="true">
            <rect width="1344" height="910" fill={`url(#${grid})`} />
            {ATLAS_INK.stars.map((star, i) => (
              <circle key={`background-${i}`} {...star} cx={star.x} cy={star.y} fill="#d0d7cb" />
            ))}
            {ATLAS_INK.arms.map((d, i) => (
              <g
                key={i}
                fill="none"
                stroke={i % 2 ? '#bd9ca8' : '#8cafbd'}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={d} strokeWidth="42" opacity="0.045" />
                <path d={d} strokeWidth="16" opacity="0.06" />
                <path d={d} strokeWidth="2" opacity="0.14" />
              </g>
            ))}
            {ATLAS_INK.dust.map((star, i) => (
              <circle
                key={`dust-${i}`}
                cx={star.x}
                cy={star.y}
                r={star.r}
                opacity={star.opacity}
                fill={star.warm ? '#ddbbad' : '#98b5c3'}
              />
            ))}
            <path
              d="M227 418H1163 M630 70V842"
              stroke="#b9c5b6"
              strokeWidth="1"
              strokeDasharray="8 9"
              opacity="0.22"
            />
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i} transform={`translate(${630 - i * 80} 418)`}>
                <path d="M0 -6V6" stroke="#c7d0bf" opacity="0.5" />
                <text y="22" fill="#adb5a4" fontSize="12" textAnchor="middle">
                  {i ? `${i * 10000}` : '0'}
                </text>
              </g>
            ))}
            {ATLAS_DISTRICTS.map((district) => {
              const i = world.names.indexOf(district.anchor);
              const lost = i >= 0 && state.phase[i] === 3;
              return (
                <g key={district.name} opacity={lost ? 0.36 : 0.8}>
                  <path
                    d={district.outline}
                    fill={district.color}
                    fillOpacity="0.035"
                    stroke={district.color}
                    strokeOpacity="0.55"
                    strokeWidth="1"
                    strokeDasharray={lost ? '5 7' : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  {camera.k < 1.9 && (
                    <text
                      x={district.at[0]}
                      y={district.at[1]}
                      fill={district.color}
                      fontSize="16"
                      opacity="0.68"
                      textAnchor="middle"
                    >
                      {district.name}
                    </text>
                  )}
                </g>
              );
            })}
            <path
              d={IMPERIAL_BORDER}
              fill="none"
              stroke="#88b2c4"
              strokeWidth="1.5"
              strokeDasharray="10 8"
              opacity="0.65"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={FOUNDATION_BORDER}
              fill="none"
              stroke="#cb9997"
              strokeWidth="1.4"
              strokeDasharray="6 8"
              opacity="0.55"
              vectorEffect="non-scaling-stroke"
            />
            <text x="255" y="220" fill="#879ea6" fontSize="17">
              帝国旧疆
            </text>
            <text x="400" y="508" fill="#b69896" fontSize="16">
              核心星域
            </text>
          </g>
          {network &&
            world.edges.map(([a, b]) => (
              <line
                key={`${a}:${b}`}
                x1={positions[a][0]}
                y1={positions[a][1]}
                x2={positions[b][0]}
                y2={positions[b][1]}
                stroke={state.phase[a] === 3 || state.phase[b] === 3 ? '#c28b9a' : '#8bd3cf'}
                strokeOpacity={state.phase[a] === 3 || state.phase[b] === 3 ? 0.18 : 0.35}
                strokeDasharray={state.phase[a] === 3 || state.phase[b] === 3 ? '4 5' : undefined}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          {path.length > 1 && (
            <polyline
              className="atlas-route"
              points={path.map((i) => positions[i].join(',')).join(' ')}
              fill="none"
              stroke="#f5da8d"
              strokeWidth="3"
              strokeDasharray="7 6"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {sectors.map((sector, i) => {
            const color =
              state.phase[i] === 3
                ? '#8393ac'
                : layer === 'risk' || !state.strategic
                  ? sector.color
                  : colors[Math.min(2, Math.floor(state.strategic[layer][i] * 3))];
            return (
              <g
                key={i}
                data-atlas-node={i}
                transform={`translate(${positions[i][0]} ${positions[i][1]})`}
                className={`atlas-node ${selected === i ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${sector.label}，${sector.status}`}
                aria-pressed={selected === i}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(i);
                  }
                }}
              >
                <title>{`${sector.label} · ${sector.status}`}</title>
                <circle r={Math.min(32, 20 / Math.max(0.1, scale * camera.k))} fill="transparent" />
                {(selected === i || sector.event) && (
                  <circle
                    className="atlas-halo"
                    r={(selected === i ? 10 : 8) * markerScale}
                    stroke={color}
                    strokeWidth="1.6"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  r={(i === world.capital ? 4.5 : 3.4) * markerScale}
                  fill={color}
                  stroke="#fff4d7"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          <g pointerEvents="none" className="atlas-labels">
            {labels.map(({ i, dx, dy, font, anchor }) => (
              <text
                key={i}
                x={positions[i][0] + dx}
                y={positions[i][1] + dy}
                textAnchor={anchor}
                fontSize={font}
                fill={
                  selected === i || i === world.capital || i === world.terminus
                    ? '#efe6cf'
                    : '#c3ceca'
                }
                stroke="#0b1216"
                strokeWidth={3 / (scale * camera.k)}
                paintOrder="stroke"
              >
                {world.names[i]}
              </text>
            ))}
          </g>
        </g>
        {viewport.width >= 760 && (
          <g className="atlas-cartouche" pointerEvents="none" aria-hidden="true">
            <g transform="translate(52 785)" fill="#bdc9c0" fontSize="13">
              <path d="M0 0H200 M0 -4V4 M100 -4V4 M200 -4V4" stroke="#bdc9c0" />
              <text y="22">0</text>
              <text x="78" y="22">
                10,000
              </text>
              <text x="167" y="22">
                20,000 光年
              </text>
              <path d="M0 51H26" stroke="#88b2c4" strokeDasharray="6 4" />
              <text x="38" y="56">
                帝国旧疆
              </text>
              <circle cx="180" cy="51" r="4" fill="#d0be82" />
              <text x="193" y="56">
                星区首府
              </text>
            </g>
          </g>
        )}
      </g>
    </svg>
  );
});
export default AdministrativeMap;
