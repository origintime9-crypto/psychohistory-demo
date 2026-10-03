import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { atlasPosition, ATLAS_SIZE } from '../engine/atlas';
import { routeTo } from '../engine/strategy';
import type { State, World } from '../engine/types';
import type { GalaxyHandle, SceneSector } from './GalaxyScene';

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
    if (selected === undefined || cameraRef.current.k <= 1.2) return;
    const [x, y] = atlasPosition(world, selected);
    setCamera((c) => limit({ ...c, x: 600 - x * c.k, y: 430 - y * c.k }));
  }, [selected, world]);
  const path = selected === undefined ? [] : routeTo(world, state, selected);
  const positions = Array.from({ length: world.n }, (_, i) => atlasPosition(world, i));
  return (
    <svg
      className={`administrative-map ${dragging ? 'dragging' : ''}`}
      ref={svg}
      viewBox="0 0 1344 910"
      aria-label="行政星图"
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
        <clipPath id="atlas-crop">
          <rect width="1344" height="910" />
        </clipPath>
      </defs>
      <g clipPath="url(#atlas-crop)">
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <image
            href={`${import.meta.env.BASE_URL}maps/galactic-administration-reference.jpg`}
            x="-52"
            y="-130"
            width="1440"
            height="1080"
            aria-hidden="true"
          />
          <rect width="1344" height="910" fill="#030817" opacity="0.2" pointerEvents="none" />
          {network &&
            world.edges.map(([a, b]) => (
              <line
                key={`${a}:${b}`}
                x1={positions[a][0]}
                y1={positions[a][1]}
                x2={positions[b][0]}
                y2={positions[b][1]}
                stroke={state.phase[a] === 3 || state.phase[b] === 3 ? '#c28b9a' : '#8bd3cf'}
                strokeOpacity={state.phase[a] === 3 || state.phase[b] === 3 ? 0.2 : 0.5}
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
                <title>
                  {sector.label} · {sector.status}
                </title>
                <circle r="17" fill="transparent" />
                {(selected === i || sector.event) && (
                  <circle
                    className="atlas-halo"
                    r={selected === i ? 15 : 11}
                    stroke={color}
                    strokeWidth="1.6"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  r={i === world.capital ? 7 : 5}
                  fill={color}
                  stroke="#fff4d7"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                {(selected === i || i === world.capital || i === world.terminus) && (
                  <text
                    y="-21"
                    textAnchor="middle"
                    fill="#fff6dd"
                    stroke="#070c19"
                    paintOrder="stroke"
                    strokeWidth="4"
                    fontSize="18"
                  >
                    {sector.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
});
export default AdministrativeMap;
