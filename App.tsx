import React, { useEffect, useRef, useState } from 'react';

type Direction = { x: number; y: number };
type Point = { x: number; y: number };

const GRID_SIZE = 20;
const CELL_SIZE = 24;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
const INITIAL_SNAKE: Point[] = [
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 }
];

const directionEquals = (a: Direction, b: Direction) => a.x === b.x && a.y === b.y;

const getRandomFood = (snake: Point[]): Point => {
  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE)
    };
    if (!snake.some((segment) => segment.x === candidate.x && segment.y === candidate.y)) {
      return candidate;
    }
  }
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snakeRef = useRef<Point[]>(INITIAL_SNAKE);
  const directionRef = useRef<Direction>({ x: 1, y: 0 });
  const nextDirectionRef = useRef<Direction>({ x: 1, y: 0 });
  const foodRef = useRef<Point>(getRandomFood(INITIAL_SNAKE));

  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'gameover'>('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [tick, setTick] = useState(0);

  const resetGame = () => {
    snakeRef.current = [...INITIAL_SNAKE];
    directionRef.current = { x: 1, y: 0 };
    nextDirectionRef.current = { x: 1, y: 0 };
    foodRef.current = getRandomFood(snakeRef.current);
    setScore(0);
    setStatus('idle');
    setTick((prev) => prev + 1);
  };

  const startGame = () => {
    if (status === 'gameover') {
      resetGame();
    }
    setStatus('running');
  };

  const togglePause = () => {
    setStatus((prev) => (prev === 'running' ? 'paused' : 'running'));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) {
        event.preventDefault();
      }

      const currentDirection = directionRef.current;
      let next: Direction | null = null;

      switch (event.key) {
        case 'ArrowUp':
        case 'w':
          next = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
          next = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
          next = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
          next = { x: 1, y: 0 };
          break;
        case ' ':
          if (status === 'running') {
            setStatus('paused');
          } else if (status === 'paused' || status === 'idle') {
            setStatus('running');
          }
          return;
        default:
          return;
      }

      if (!next) return;
      const opposite = { x: -currentDirection.x, y: -currentDirection.y };
      if (!directionEquals(next, opposite)) {
        nextDirectionRef.current = next;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  useEffect(() => {
    if (status !== 'running') return;

    const interval = window.setInterval(() => {
      const snake = snakeRef.current;
      const direction = nextDirectionRef.current;
      directionRef.current = direction;

      const head = snake[0];
      const newHead = { x: head.x + direction.x, y: head.y + direction.y };

      const hitWall = newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE;
      const hitSelf = snake.some((segment) => segment.x === newHead.x && segment.y === newHead.y);

      if (hitWall || hitSelf) {
        setStatus('gameover');
        setBestScore((prev) => Math.max(prev, score));
        return;
      }

      let nextSnake: Point[];
      const ateFood = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      if (ateFood) {
        nextSnake = [newHead, ...snake];
        setScore((prev) => prev + 1);
        foodRef.current = getRandomFood(nextSnake);
      } else {
        nextSnake = [newHead, ...snake.slice(0, -1)];
      }

      snakeRef.current = nextSnake;
      setTick((prev) => prev + 1);
    }, 120);

    return () => window.clearInterval(interval);
  }, [score, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    for (let i = 0; i <= GRID_SIZE; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
      ctx.stroke();
    }

    const snake = snakeRef.current;
    snake.forEach((segment, index) => {
      ctx.fillStyle = index === 0 ? '#38bdf8' : '#94a3b8';
      ctx.fillRect(
        segment.x * CELL_SIZE + 2,
        segment.y * CELL_SIZE + 2,
        CELL_SIZE - 4,
        CELL_SIZE - 4
      );
    });

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(
      foodRef.current.x * CELL_SIZE + CELL_SIZE / 2,
      foodRef.current.y * CELL_SIZE + CELL_SIZE / 2,
      CELL_SIZE / 2 - 4,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (status === 'paused' || status === 'gameover' || status === 'idle') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 28px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        status === 'gameover' ? 'Game Over' : status === 'paused' ? 'Paused' : 'Ready?',
        CANVAS_SIZE / 2,
        CANVAS_SIZE / 2 - 10
      );
      ctx.font = '16px "Inter", sans-serif';
      ctx.fillText('Press Space to play', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 24);
    }
  }, [status, tick]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full grid md:grid-cols-[1.2fr_0.8fr] gap-8">
        <div className="bg-slate-900/60 rounded-3xl p-6 shadow-2xl border border-slate-800 flex flex-col items-center">
          <h1 className="text-3xl font-black tracking-tight mb-4">贪吃蛇</h1>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="rounded-2xl shadow-inner border border-slate-800"
          />
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={startGame}
              className="px-5 py-2.5 rounded-full bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition"
            >
              {status === 'running' ? '进行中' : status === 'gameover' ? '重新开始' : '开始游戏'}
            </button>
            <button
              onClick={togglePause}
              className="px-5 py-2.5 rounded-full bg-slate-800 text-slate-100 font-semibold hover:bg-slate-700 transition"
              disabled={status === 'idle' || status === 'gameover'}
            >
              {status === 'paused' ? '继续' : '暂停'}
            </button>
            <button
              onClick={resetGame}
              className="px-5 py-2.5 rounded-full bg-slate-800 text-slate-100 font-semibold hover:bg-slate-700 transition"
            >
              重置
            </button>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400 font-semibold">Score</p>
            <p className="text-4xl font-black text-sky-400">{score}</p>
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400 font-semibold">Best</p>
            <p className="text-3xl font-black">{bestScore}</p>
          </div>
          <div className="border-t border-slate-800 pt-4 space-y-2 text-sm text-slate-300">
            <p className="font-semibold text-slate-200">操作说明</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>方向键 / WASD 控制蛇的方向。</li>
              <li>按空格开始或暂停。</li>
              <li>吃到橘色食物得分并增长。</li>
            </ul>
          </div>
          <div className="border-t border-slate-800 pt-4 text-sm text-slate-400">
            <p>避免撞到墙壁或自己，分数越高蛇越长。</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
