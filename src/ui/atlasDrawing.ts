import { stream } from '../engine/rng';
import type { World } from '../engine/types';

export const CHART_CENTER = [630, 418] as const;
export interface AtlasDistrict {
  name: string;
  anchor: string;
  at: [number, number];
  outline: string;
  color: string;
}

// Traced administrative groupings from the reference. They are fictional, approximate boundaries.
export const ATLAS_DISTRICTS: AtlasDistrict[] = [
  {
    name: '蓝移星区',
    anchor: '蓝移',
    at: [1020, 150],
    color: '#90b8cb',
    outline:
      'M845 102 Q920 69 1008 109 L1067 150 1077 223 1132 256 1134 326 1090 335 1050 294 1032 257 1020 223 980 202 960 146 917 169 873 168 829 141 Z',
  },
  {
    name: '天狼星区',
    anchor: '天狼',
    at: [748, 239],
    color: '#8dbaa1',
    outline:
      'M668 103 L703 122 723 104 761 88 805 118 823 145 794 169 756 194 740 220 702 244 686 295 648 316 628 278 628 229 646 198 637 158 Z',
  },
  {
    name: '菲律星区',
    anchor: '菲律',
    at: [867, 357],
    color: '#c29ab0',
    outline:
      'M686 295 L743 271 789 255 840 260 872 227 911 263 963 258 1020 223 1032 257 1020 322 1030 366 995 409 920 414 877 420 823 413 840 378 793 368 752 369 729 339 Z',
  },
  {
    name: '基协尔星区',
    anchor: '基协尔',
    at: [741, 436],
    color: '#b9b990',
    outline:
      'M629 371 L660 331 688 334 729 339 752 369 793 368 840 378 823 413 829 447 793 474 744 483 704 455 674 441 648 423 Z',
  },
  {
    name: '大角星区',
    anchor: '大角',
    at: [838, 510],
    color: '#88b9b5',
    outline:
      'M704 455 L744 483 793 474 829 447 877 420 903 453 940 490 929 530 947 565 930 604 918 649 864 655 834 613 807 562 758 559 733 532 Z',
  },
  {
    name: '蒙特佛星省',
    anchor: '蒙特佛',
    at: [657, 558],
    color: '#a1acbf',
    outline:
      'M648 423 L674 441 704 455 733 532 758 559 807 562 797 607 745 648 702 648 661 630 655 590 634 562 623 514 Z',
  },
  {
    name: '伊夫尼星区',
    anchor: '伊夫尼',
    at: [405, 622],
    color: '#adab88',
    outline:
      'M478 529 L520 546 548 598 600 596 634 562 655 590 661 630 622 664 582 662 549 658 509 646 468 634 457 669 421 684 388 693 350 719 287 750 273 712 337 688 370 646 411 628 443 573 Z',
  },
  {
    name: '诺曼星区',
    anchor: '诺曼',
    at: [584, 690],
    color: '#ba9e8e',
    outline:
      'M468 634 L509 646 549 658 582 662 622 664 661 630 702 648 745 648 765 679 743 722 702 749 666 748 657 776 614 800 567 814 514 810 487 771 441 745 431 713 457 669 Z',
  },
];

export const IMPERIAL_BORDER =
  'M227 383 C264 196 464 71 650 57 Q719 49 760 76 L845 77 951 85 1068 132 Q1161 196 1150 323 L1160 420 Q1164 508 1107 597 L1010 662 938 720 912 771 825 810 676 838 517 845 358 811 278 789 233 741 247 680 270 650 356 648 386 611 400 569 462 552 453 482 444 413 454 337 438 307 382 326 289 387 Z';
export const FOUNDATION_BORDER =
  'M273 437 C257 557 397 634 500 618 L599 609 646 552 681 518 705 498 740 457 735 416 693 386 635 365 630 341 603 324 557 347 510 365 472 372 438 395 385 416 327 440 Z';

const geometry = () => {
  const rng = stream('galactic-chart', 'ink-v1');
  const dust: { x: number; y: number; r: number; opacity: number; warm: boolean }[] = [];
  const arms: string[] = [];
  for (let arm = 0; arm < 4; arm++) {
    const points: string[] = [];
    for (let j = 0; j < 100; j++) {
      const t = j / 99;
      const radius = 35 + 430 * t;
      const angle = (arm * Math.PI) / 2 + 0.5 + t * 3.75;
      const x = CHART_CENTER[0] + Math.cos(angle) * radius;
      const y = CHART_CENTER[1] + Math.sin(angle) * radius * 0.7;
      points.push(`${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
      for (let d = 0; d < 7; d++) {
        const [a, b] = rng.normalPair();
        dust.push({
          x: x + a * (5 + t * 21),
          y: y + b * (4 + t * 15),
          r: 0.5 + rng.uniform() * 1.25,
          opacity: 0.12 + rng.uniform() * (0.48 - t * 0.18),
          warm: radius < 130,
        });
      }
    }
    arms.push(points.join(' '));
  }
  const stars = Array.from({ length: 380 }, () => ({
    x: 32 + rng.uniform() * 1280,
    y: 35 + rng.uniform() * 840,
    r: 0.5 + rng.uniform() * 0.75,
    opacity: 0.12 + rng.uniform() * 0.35,
  }));
  return { dust, arms, stars };
};
export const ATLAS_INK = geometry();

export interface MapCamera {
  x: number;
  y: number;
  k: number;
}
export interface AtlasLabel {
  i: number;
  dx: number;
  dy: number;
  font: number;
  anchor: 'start' | 'end';
}

/** Screen-space collision checks keep labels legible at every zoom, including a narrow phone. */
export function atlasLabels(
  world: World,
  positions: [number, number][],
  camera: MapCamera,
  viewport: { width: number; height: number },
  selected?: number,
): AtlasLabel[] {
  const scale = Math.max(0.001, Math.min(viewport.width / 1344, viewport.height / 910));
  const offsetX = (viewport.width - 1344 * scale) / 2;
  const offsetY = (viewport.height - 910 * scale) / 2;
  const project = ([x, y]: [number, number]) => [
    (x * camera.k + camera.x) * scale + offsetX,
    (y * camera.k + camera.y) * scale + offsetY,
  ];
  const points = positions.map(project);
  type Box = { x: number; y: number; w: number; h: number };
  const occupied: Box[] = points.map(([x, y]) => ({ x: x - 5, y: y - 5, w: 10, h: 10 }));
  if (camera.k < 1.9)
    for (const district of ATLAS_DISTRICTS) {
      const [x, y] = project(district.at);
      const width = district.name.length * 16 * scale * camera.k;
      occupied.push({
        x: x - width / 2,
        y: y - 16 * scale * camera.k,
        w: width,
        h: 18 * scale * camera.k,
      });
    }
  occupied.push({ x: 0, y: 0, w: 216, h: 66 });
  if (selected === undefined) occupied.push({ x: viewport.width - 170, y: 0, w: 170, h: 140 });
  const order = Array.from({ length: world.n }, (_, i) => i).sort((a, b) => {
    const priority = (i: number) =>
      i === selected ? 0 : i === world.capital ? 1 : i === world.terminus ? 2 : i < 19 ? 3 : 4;
    return priority(a) - priority(b) || a - b;
  });
  const labels: AtlasLabel[] = [];
  for (const i of order) {
    const [x, y] = points[i];
    if (x < 12 || y < 12 || x > viewport.width - 12 || y > viewport.height - 12) continue;
    const important = i === selected || i === world.capital || i === world.terminus;
    const font = important ? 13 : 11;
    const width = world.names[i].length * font + 4;
    const candidates = [
      { dx: 10, dy: 4, anchor: 'start' as const },
      { dx: 8, dy: -11, anchor: 'start' as const },
      { dx: -10, dy: 4, anchor: 'end' as const },
      { dx: -8, dy: 23, anchor: 'end' as const },
    ];
    for (const c of candidates) {
      const box = {
        x: x + c.dx - (c.anchor === 'end' ? width : 0),
        y: y + c.dy - font,
        w: width,
        h: font + 4,
      };
      if (
        box.x < 8 ||
        box.y < 8 ||
        box.x + width > viewport.width - 8 ||
        box.y + box.h > viewport.height - 8
      )
        continue;
      if (
        occupied.some(
          (b) =>
            box.x < b.x + b.w + 3 &&
            box.x + box.w + 3 > b.x &&
            box.y < b.y + b.h + 2 &&
            box.y + box.h + 2 > b.y,
        )
      )
        continue;
      occupied.push(box);
      labels.push({
        i,
        dx: c.dx / (scale * camera.k),
        dy: c.dy / (scale * camera.k),
        font: font / (scale * camera.k),
        anchor: c.anchor,
      });
      break;
    }
  }
  return labels;
}
