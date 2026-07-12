"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TankKind = "jackal" | "mammoth" | "longshot";
type Team = 0 | 1;
type Screen = "garage" | "match" | "paused" | "result";

type TankSpec = {
  name: string;
  role: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  reload: number;
  projectileSpeed: number;
  range: number;
  splash: number;
  ability: string;
  abilityCopy: string;
  cooldown: number;
  color: string;
  dark: string;
  stats: [number, number, number];
};

type Tank = {
  id: string;
  team: Team;
  slot: number;
  kind: TankKind;
  bot: boolean;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bodyAngle: number;
  turretAngle: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  lastFire: number;
  abilityReadyAt: number;
  shieldUntil: number;
  dashUntil: number;
  spawnShieldUntil: number;
  rapidUntil: number;
  respawnAt: number;
  aiThinkAt: number;
  aiStrafe: number;
  targetId?: string;
  lastDamager?: string;
};

type Projectile = {
  id: number;
  ownerId: string;
  team: Team;
  kind: TankKind;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  splash: number;
  life: number;
  bounces: number;
};

type ObstacleType = "steel" | "crate" | "barrel" | "furnace";
type Obstacle = {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  alive: boolean;
};

type Pickup = {
  id: number;
  type: "repair" | "rapid" | "armor";
  x: number;
  y: number;
  availableAt: number;
  respawn: number;
};

type Strike = {
  id: number;
  team: Team;
  ownerId: string;
  x: number;
  y: number;
  detonateAt: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type PlayerStats = {
  eliminations: number;
  deaths: number;
  damage: number;
  abilities: number;
};

type GameState = {
  teamSize: number;
  scoreTarget: number;
  score: [number, number];
  duration: number;
  elapsed: number;
  overtime: boolean;
  winner: Team | -1 | null;
  now: number;
  tanks: Tank[];
  projectiles: Projectile[];
  obstacles: Obstacle[];
  pickups: Pickup[];
  strikes: Strike[];
  particles: Particle[];
  camera: { x: number; y: number; shake: number };
  feed: { text: string; team: Team; at: number }[];
  stats: PlayerStats;
  nextId: number;
  lastSnapshot: number;
};

type HudState = {
  blue: number;
  orange: number;
  target: number;
  time: number;
  overtime: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  reload: number;
  ability: number;
  abilityMax: number;
  feed: { text: string; team: Team }[];
  stats: PlayerStats;
};

const VIEW_W = 1280;
const VIEW_H = 720;
const MAP_W = 3200;
const MAP_H = 1900;

const MODES = {
  1: { label: "1v1", name: "Duel", target: 5, copy: "No backup. First to 5." },
  2: { label: "2v2", name: "Clash", target: 8, copy: "One wingman. First to 8." },
  3: { label: "3v3", name: "Warzone", target: 12, copy: "Full squad. First to 12." },
} as const;

const TANKS: Record<TankKind, TankSpec> = {
  jackal: {
    name: "Jackal",
    role: "Light flanker",
    hp: 130,
    speed: 270,
    radius: 22,
    damage: 15,
    reload: 0.25,
    projectileSpeed: 720,
    range: 690,
    splash: 0,
    ability: "Rocket Skid",
    abilityCopy: "A steerable boost with damage reduction.",
    cooldown: 7,
    color: "#238be6",
    dark: "#0c477f",
    stats: [3, 5, 2],
  },
  mammoth: {
    name: "Mammoth",
    role: "Armored vanguard",
    hp: 240,
    speed: 160,
    radius: 30,
    damage: 32,
    reload: 0.72,
    projectileSpeed: 560,
    range: 630,
    splash: 0,
    ability: "Bulwark Field",
    abilityCopy: "Deploy 100 points of temporary shielding.",
    cooldown: 11,
    color: "#7f9f32",
    dark: "#3b531b",
    stats: [5, 2, 4],
  },
  longshot: {
    name: "Longshot",
    role: "Siege controller",
    hp: 155,
    speed: 185,
    radius: 25,
    damage: 46,
    reload: 1.05,
    projectileSpeed: 520,
    range: 920,
    splash: 58,
    ability: "Meteor Mortar",
    abilityCopy: "Mark a delayed, high-damage blast zone.",
    cooldown: 12,
    color: "#c66b2b",
    dark: "#713517",
    stats: [3, 3, 5],
  },
};

const emptyHud: HudState = {
  blue: 0,
  orange: 0,
  target: 5,
  time: 240,
  overtime: false,
  hp: 130,
  maxHp: 130,
  shield: 0,
  reload: 1,
  ability: 1,
  abilityMax: 7,
  feed: [],
  stats: { eliminations: 0, deaths: 0, damage: 0, abilities: 0 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const distance = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

function circleHitsRect(x: number, y: number, radius: number, rect: Obstacle) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return distance(x, y, cx, cy) < radius;
}

function lineHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Obstacle,
) {
  const steps = Math.max(2, Math.ceil(distance(x1, y1, x2, y2) / 38));
  for (let i = 1; i < steps; i += 1) {
    const p = i / steps;
    const x = x1 + (x2 - x1) * p;
    const y = y1 + (y2 - y1) * p;
    if (x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h) {
      return true;
    }
  }
  return false;
}

function makeMap() {
  let id = 1;
  const obstacles: Obstacle[] = [];
  const add = (
    type: ObstacleType,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const hp = type === "crate" ? 70 : type === "barrel" ? 35 : 99999;
    obstacles.push({ id: id++, type, x, y, w, h, hp, maxHp: hp, alive: true });
  };
  const mirror = (
    type: ObstacleType,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    add(type, x, y, w, h);
    add(type, MAP_W - x - w, y, w, h);
  };

  mirror("furnace", 420, 270, 190, 130);
  mirror("steel", 420, 640, 70, 290);
  mirror("steel", 560, 1050, 240, 60);
  mirror("furnace", 690, 1460, 180, 130);
  mirror("steel", 840, 380, 260, 60);
  mirror("steel", 930, 790, 70, 260);
  mirror("steel", 1010, 1260, 270, 58);
  mirror("crate", 690, 500, 74, 74);
  mirror("crate", 810, 550, 74, 74);
  mirror("crate", 1120, 250, 74, 74);
  mirror("crate", 1130, 1460, 74, 74);
  mirror("crate", 1260, 610, 74, 74);
  mirror("crate", 1260, 1040, 74, 74);
  mirror("barrel", 770, 890, 44, 44);
  mirror("barrel", 1130, 870, 44, 44);
  mirror("barrel", 1330, 330, 44, 44);
  mirror("barrel", 1360, 1390, 44, 44);

  add("furnace", 1450, 570, 130, 190);
  add("furnace", 1620, 570, 130, 190);
  add("furnace", 1450, 1120, 130, 190);
  add("furnace", 1620, 1120, 130, 190);
  add("steel", 1390, 280, 420, 55);
  add("steel", 1390, 1560, 420, 55);
  add("crate", 1515, 880, 74, 74);
  add("crate", 1610, 950, 74, 74);
  add("barrel", 1450, 920, 44, 44);
  add("barrel", 1710, 900, 44, 44);
  return obstacles;
}

function makePickups(): Pickup[] {
  return [
    { id: 1, type: "repair", x: 1600, y: 330, availableAt: 0, respawn: 18 },
    { id: 2, type: "rapid", x: 1600, y: 940, availableAt: 0, respawn: 22 },
    { id: 3, type: "armor", x: 1600, y: 1590, availableAt: 0, respawn: 24 },
  ];
}

function spawnPoint(team: Team, slot: number) {
  const ys = [520, 950, 1390];
  return { x: team === 0 ? 220 : MAP_W - 220, y: ys[slot] ?? 950 };
}

function createTank(
  id: string,
  team: Team,
  slot: number,
  kind: TankKind,
  bot: boolean,
  name: string,
): Tank {
  const spec = TANKS[kind];
  const spawn = spawnPoint(team, slot);
  return {
    id,
    team,
    slot,
    kind,
    bot,
    name,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    bodyAngle: team === 0 ? 0 : Math.PI,
    turretAngle: team === 0 ? 0 : Math.PI,
    hp: spec.hp,
    maxHp: spec.hp,
    shield: 0,
    alive: true,
    lastFire: -10,
    abilityReadyAt: 1.2,
    shieldUntil: 0,
    dashUntil: 0,
    spawnShieldUntil: 2,
    rapidUntil: 0,
    respawnAt: 0,
    aiThinkAt: 0,
    aiStrafe: Math.random() > 0.5 ? 1 : -1,
  };
}

function createGame(teamSize: number, selected: TankKind): GameState {
  const tanks: Tank[] = [createTank("player", 0, 0, selected, false, "YOU")];
  const allyKinds: TankKind[] = ["mammoth", "longshot", "jackal"];
  const enemyKinds: TankKind[] = ["jackal", "mammoth", "longshot"];
  for (let i = 1; i < teamSize; i += 1) {
    tanks.push(
      createTank(`ally-${i}`, 0, i, allyKinds[(i - 1) % allyKinds.length], true, `ALLY ${i}`),
    );
  }
  for (let i = 0; i < teamSize; i += 1) {
    tanks.push(
      createTank(`enemy-${i}`, 1, i, enemyKinds[i % enemyKinds.length], true, `RIVAL ${i + 1}`),
    );
  }
  return {
    teamSize,
    scoreTarget: MODES[teamSize as 1 | 2 | 3].target,
    score: [0, 0],
    duration: 240,
    elapsed: 0,
    overtime: false,
    winner: null,
    now: 0,
    tanks,
    projectiles: [],
    obstacles: makeMap(),
    pickups: makePickups(),
    strikes: [],
    particles: [],
    camera: { x: 0, y: 590, shake: 0 },
    feed: [{ text: "DEPLOYED TO RUSTFALL BASIN", team: 0, at: 0 }],
    stats: { eliminations: 0, deaths: 0, damage: 0, abilities: 0 },
    nextId: 100,
    lastSnapshot: -1,
  };
}

export default function TankWarzGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const screenRef = useRef<Screen>("garage");
  const keysRef = useRef(new Set<string>());
  const pointerRef = useRef({ x: VIEW_W * 0.72, y: VIEW_H / 2, down: false });
  const touchRef = useRef({ x: 0, y: 0, fire: false, abilityQueued: false });
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [screen, setScreen] = useState<Screen>("garage");
  const [mode, setMode] = useState<1 | 2 | 3>(1);
  const [tankKind, setTankKind] = useState<TankKind>("jackal");
  const [hud, setHud] = useState<HudState>(emptyHud);
  const [muted, setMuted] = useState(false);
  const [winner, setWinner] = useState<Team | -1 | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "escape") {
        setScreen((current) => {
          if (current === "match") return "paused";
          if (current === "paused") return "match";
          return current;
        });
        return;
      }
      const target = event.target as HTMLElement | null;
      const isInteractive =
        target?.matches("button, input, select, textarea, a[href], [contenteditable='true']") ?? false;
      if (screenRef.current !== "match" || isInteractive) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      keysRef.current.add(key);
      if (key === "e") touchRef.current.abilityQueued = true;
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const resetInput = () => {
      keysRef.current.clear();
      pointerRef.current.down = false;
      touchRef.current = { x: 0, y: 0, fire: false, abilityQueued: false };
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("blur", resetInput);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", resetInput);
    };
  }, []);

  const startMatch = useCallback(() => {
    if (!muted && !audioRef.current) audioRef.current = new AudioContext();
    if (!muted && audioRef.current?.state === "suspended") void audioRef.current.resume();
    const game = createGame(mode, tankKind);
    gameRef.current = game;
    setWinner(null);
    const spec = TANKS[tankKind];
    setHud({
      ...emptyHud,
      target: game.scoreTarget,
      hp: spec.hp,
      maxHp: spec.hp,
      abilityMax: spec.cooldown,
      time: 240,
    });
    lastFrameRef.current = performance.now();
    setScreen("match");
  }, [mode, muted, tankKind]);

  const playTone = useCallback(
    (frequency: number, duration: number, type: OscillatorType = "square", volume = 0.035) => {
      const audio = audioRef.current;
      if (!audio || mutedRef.current) return;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(35, frequency * 0.62),
        audio.currentTime + duration,
      );
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    },
    [],
  );

  const addParticles = useCallback(
    (game: GameState, x: number, y: number, color: string, count: number, force = 180) => {
      const budget = Math.max(0, 180 - game.particles.length);
      for (let i = 0; i < Math.min(count, budget); i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = force * (0.35 + Math.random() * 0.7);
        const life = 0.28 + Math.random() * 0.42;
        game.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          size: 3 + Math.random() * 7,
          color,
        });
      }
    },
    [],
  );

  const pushFeed = useCallback((game: GameState, text: string, team: Team) => {
    game.feed.unshift({ text, team, at: game.now });
    game.feed = game.feed.slice(0, 4);
  }, []);

  const hitTank = useCallback(
    (game: GameState, tank: Tank, amount: number, attackerId: string, shake = 2) => {
      if (!tank.alive || tank.spawnShieldUntil > game.now) return;
      const attacker = game.tanks.find((item) => item.id === attackerId);
      let damage = amount;
      if (tank.dashUntil > game.now) damage *= 0.5;
      if (tank.shield > 0 && tank.shieldUntil > game.now) {
        const absorbed = Math.min(tank.shield, damage);
        tank.shield -= absorbed;
        damage -= absorbed;
        addParticles(game, tank.x, tank.y, "#73efff", 7, 120);
      }
      if (damage <= 0) return;
      tank.hp -= damage;
      tank.lastDamager = attackerId;
      if (attackerId === "player") game.stats.damage += Math.round(damage);
      addParticles(game, tank.x, tank.y, "#ffc53d", 5, 130);
      if (tank.id === "player" && !reducedMotion.current) game.camera.shake = Math.max(shake, 2);
      if (tank.hp > 0) return;

      tank.hp = 0;
      tank.alive = false;
      tank.respawnAt = game.now + 3;
      tank.vx = 0;
      tank.vy = 0;
      if (tank.id === "player") game.stats.deaths += 1;
      if (attacker && attacker.team !== tank.team) {
        game.score[attacker.team] += 1;
        if (attacker.id === "player") game.stats.eliminations += 1;
        pushFeed(game, `${attacker.name} ▸ ${tank.name}`, attacker.team);
      } else {
        pushFeed(game, `RUSTFALL ▸ ${tank.name}`, tank.team === 0 ? 1 : 0);
      }
      addParticles(game, tank.x, tank.y, "#ff7043", 24, 280);
      addParticles(game, tank.x, tank.y, "#30343a", 14, 220);
      if (!reducedMotion.current) game.camera.shake = Math.max(game.camera.shake, 7);
    },
    [addParticles, pushFeed],
  );

  const explode = useCallback(
    (
      game: GameState,
      x: number,
      y: number,
      radius: number,
      damage: number,
      ownerId: string,
      friendlyFire = false,
    ) => {
      playTone(92, 0.24, "sawtooth", 0.055);
      addParticles(game, x, y, "#ffc53d", 18, 270);
      addParticles(game, x, y, "#ff7043", 18, 220);
      const owner = game.tanks.find((tank) => tank.id === ownerId);
      for (const tank of game.tanks) {
        if (!tank.alive) continue;
        if (!friendlyFire && owner && tank.team === owner.team) continue;
        const d = distance(x, y, tank.x, tank.y);
        if (d < radius + TANKS[tank.kind].radius) {
          const scaled = damage * clamp(1 - d / radius, 0.28, 1);
          hitTank(game, tank, scaled, ownerId, 7);
        }
      }
      if (!reducedMotion.current) game.camera.shake = Math.max(game.camera.shake, 6);
    },
    [addParticles, hitTank, playTone],
  );

  const destroyObstacle = useCallback(
    (game: GameState, obstacle: Obstacle, damage: number, ownerId: string) => {
      if (!obstacle.alive || obstacle.type === "steel" || obstacle.type === "furnace") return;
      obstacle.hp -= damage;
      addParticles(
        game,
        obstacle.x + obstacle.w / 2,
        obstacle.y + obstacle.h / 2,
        obstacle.type === "crate" ? "#b7793d" : "#ff7043",
        5,
        120,
      );
      if (obstacle.hp > 0) return;
      obstacle.alive = false;
      if (obstacle.type === "barrel") {
        explode(
          game,
          obstacle.x + obstacle.w / 2,
          obstacle.y + obstacle.h / 2,
          105,
          65,
          ownerId,
          true,
        );
      } else {
        addParticles(game, obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, "#64422f", 20, 190);
      }
    },
    [addParticles, explode],
  );

  const fire = useCallback(
    (game: GameState, tank: Tank) => {
      if (!tank.alive) return;
      const spec = TANKS[tank.kind];
      const reload = spec.reload * (tank.rapidUntil > game.now ? 0.75 : 1);
      if (game.now - tank.lastFire < reload) return;
      tank.lastFire = game.now;
      tank.spawnShieldUntil = 0;
      const spread = tank.kind === "jackal" ? (Math.random() - 0.5) * 0.07 : 0;
      const angle = tank.turretAngle + spread;
      const muzzle = spec.radius + (tank.kind === "longshot" ? 21 : 12);
      const x = tank.x + Math.cos(angle) * muzzle;
      const y = tank.y + Math.sin(angle) * muzzle;
      game.projectiles.push({
        id: game.nextId++,
        ownerId: tank.id,
        team: tank.team,
        kind: tank.kind,
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(angle) * spec.projectileSpeed,
        vy: Math.sin(angle) * spec.projectileSpeed,
        radius: tank.kind === "mammoth" ? 7 : 5,
        damage: spec.damage,
        splash: spec.splash,
        life: spec.range / spec.projectileSpeed,
        bounces: 0,
      });
      playTone(tank.kind === "jackal" ? 330 : tank.kind === "mammoth" ? 145 : 110, 0.08, "square", 0.028);
      addParticles(game, x, y, "#fff4b0", tank.kind === "jackal" ? 4 : 8, 115);
      tank.vx -= Math.cos(angle) * (tank.kind === "longshot" ? 26 : 10);
      tank.vy -= Math.sin(angle) * (tank.kind === "longshot" ? 26 : 10);
    },
    [addParticles, playTone],
  );

  const activateAbility = useCallback(
    (game: GameState, tank: Tank, aimX: number, aimY: number) => {
      if (!tank.alive || tank.abilityReadyAt > game.now) return;
      const spec = TANKS[tank.kind];
      tank.abilityReadyAt = game.now + spec.cooldown;
      playTone(tank.kind === "mammoth" ? 220 : 460, 0.18, "triangle", 0.032);
      tank.spawnShieldUntil = 0;
      if (tank.id === "player") game.stats.abilities += 1;
      if (tank.kind === "jackal") {
        const dx = aimX - tank.x;
        const dy = aimY - tank.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        tank.vx = (dx / length) * spec.speed * 3.2;
        tank.vy = (dy / length) * spec.speed * 3.2;
        tank.dashUntil = game.now + 0.55;
        addParticles(game, tank.x, tank.y, "#20a8ff", 16, 240);
      } else if (tank.kind === "mammoth") {
        tank.shield = 100;
        tank.shieldUntil = game.now + 3;
        addParticles(game, tank.x, tank.y, "#73efff", 18, 150);
      } else {
        const dx = aimX - tank.x;
        const dy = aimY - tank.y;
        const length = Math.hypot(dx, dy);
        const scale = length > 700 ? 700 / length : 1;
        game.strikes.push({
          id: game.nextId++,
          team: tank.team,
          ownerId: tank.id,
          x: tank.x + dx * scale,
          y: tank.y + dy * scale,
          detonateAt: game.now + 0.9,
        });
      }
    },
    [addParticles, playTone],
  );

  const tankCollides = useCallback((game: GameState, tank: Tank, x: number, y: number) => {
    const radius = TANKS[tank.kind].radius;
    if (x < radius || x > MAP_W - radius || y < radius || y > MAP_H - radius) {
      return true;
    }
    return (
      game.obstacles.some(
        (obstacle) => obstacle.alive && circleHitsRect(x, y, radius, obstacle),
      ) ||
      game.tanks.some(
        (other) =>
          other.alive &&
          other.id !== tank.id &&
          distance(x, y, other.x, other.y) < radius + TANKS[other.kind].radius,
      )
    );
  }, []);

  const moveTank = useCallback(
    (game: GameState, tank: Tank, moveX: number, moveY: number, dt: number) => {
      const spec = TANKS[tank.kind];
      const length = Math.hypot(moveX, moveY);
      const normalizedX = length > 0 ? moveX / length : 0;
      const normalizedY = length > 0 ? moveY / length : 0;
      const inWater =
        tank.y > 1320 &&
        tank.y < 1710 &&
        tank.x > 360 &&
        tank.x < MAP_W - 360 &&
        !((tank.x > 980 && tank.x < 1210) || (tank.x > 1990 && tank.x < 2220));
      const waterScale = inWater ? 0.8 : 1;
      if (tank.dashUntil <= game.now) {
        const targetX = normalizedX * spec.speed * waterScale;
        const targetY = normalizedY * spec.speed * waterScale;
        const response = tank.kind === "jackal" ? 9 : tank.kind === "mammoth" ? 5 : 6;
        tank.vx += (targetX - tank.vx) * Math.min(1, response * dt);
        tank.vy += (targetY - tank.vy) * Math.min(1, response * dt);
      }
      if (Math.hypot(tank.vx, tank.vy) > 12) tank.bodyAngle = Math.atan2(tank.vy, tank.vx);
      const nextX = tank.x + tank.vx * dt;
      if (!tankCollides(game, tank, nextX, tank.y)) tank.x = nextX;
      else tank.vx *= -0.16;
      const nextY = tank.y + tank.vy * dt;
      if (!tankCollides(game, tank, tank.x, nextY)) tank.y = nextY;
      else tank.vy *= -0.16;
    },
    [tankCollides],
  );

  const updateBot = useCallback(
    (game: GameState, tank: Tank, dt: number) => {
      if (!tank.alive) return;
      const enemies = game.tanks.filter((item) => item.team !== tank.team && item.alive);
      if (!enemies.length) return;
      let target = enemies.find((item) => item.id === tank.targetId);
      if (!target || game.now >= tank.aiThinkAt) {
        target = enemies.reduce((best, candidate) => {
          const score = distance(tank.x, tank.y, candidate.x, candidate.y) + candidate.hp * 1.2;
          const bestScore = distance(tank.x, tank.y, best.x, best.y) + best.hp * 1.2;
          return score < bestScore ? candidate : best;
        }, enemies[0]);
        tank.targetId = target.id;
        tank.aiThinkAt = game.now + 0.18 + Math.random() * 0.14;
        if (Math.random() < 0.18) tank.aiStrafe *= -1;
      }
      if (!target) return;
      const dx = target.x - tank.x;
      const dy = target.y - tank.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const preferred = tank.kind === "jackal" ? 270 : tank.kind === "mammoth" ? 340 : 610;
      const lead = tank.kind === "longshot" ? 0.4 : 0.24;
      const aimX = target.x + target.vx * lead;
      const aimY = target.y + target.vy * lead;
      tank.turretAngle = Math.atan2(aimY - tank.y, aimX - tank.x);
      let forward = d > preferred + 70 ? 1 : d < preferred - 85 ? -1 : 0;
      if (tank.hp / tank.maxHp < 0.28) forward = -1;
      let moveX = (dx / d) * forward + (-dy / d) * tank.aiStrafe * 0.58;
      let moveY = (dy / d) * forward + (dx / d) * tank.aiStrafe * 0.58;
      for (const strike of game.strikes) {
        if (strike.team === tank.team) continue;
        const sd = distance(tank.x, tank.y, strike.x, strike.y);
        if (sd < 180) {
          moveX += ((tank.x - strike.x) / Math.max(1, sd)) * 2.4;
          moveY += ((tank.y - strike.y) / Math.max(1, sd)) * 2.4;
        }
      }
      moveTank(game, tank, moveX, moveY, dt);
      const blocked = game.obstacles.some(
        (obstacle) =>
          obstacle.alive && lineHitsRect(tank.x, tank.y, target!.x, target!.y, obstacle),
      );
      if (!blocked && d < TANKS[tank.kind].range * 0.98) fire(game, tank);
      if (tank.abilityReadyAt <= game.now) {
        if (tank.kind === "jackal" && (d > 460 || tank.hp / tank.maxHp < 0.34)) {
          activateAbility(game, tank, target.x, target.y);
        } else if (tank.kind === "mammoth" && tank.hp / tank.maxHp < 0.68) {
          activateAbility(game, tank, target.x, target.y);
        } else if (tank.kind === "longshot" && d > 330) {
          activateAbility(game, tank, aimX, aimY);
        }
      }
    },
    [activateAbility, fire, moveTank],
  );

  const respawnTank = useCallback((game: GameState, tank: Tank) => {
    const spawn = spawnPoint(tank.team, tank.slot);
    const spec = TANKS[tank.kind];
    tank.x = spawn.x;
    tank.y = spawn.y;
    tank.vx = 0;
    tank.vy = 0;
    tank.hp = spec.hp;
    tank.maxHp = spec.hp;
    tank.shield = 0;
    tank.alive = true;
    tank.spawnShieldUntil = game.now + 2;
    tank.lastFire = game.now;
    tank.abilityReadyAt = Math.max(tank.abilityReadyAt, game.now + 1);
  }, []);

  const updateGame = useCallback(
    (game: GameState, dt: number) => {
      game.now += dt;
      game.elapsed += dt;
      const player = game.tanks[0];
      if (player.alive) {
        const keys = keysRef.current;
        const touch = touchRef.current;
        const moveX =
          (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
            (keys.has("a") || keys.has("arrowleft") ? 1 : 0) +
          touch.x;
        const moveY =
          (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
            (keys.has("w") || keys.has("arrowup") ? 1 : 0) +
          touch.y;
        const pointer = pointerRef.current;
        const aimX = game.camera.x + pointer.x;
        const aimY = game.camera.y + pointer.y;
        player.turretAngle = Math.atan2(aimY - player.y, aimX - player.x);
        moveTank(game, player, moveX, moveY, dt);
        if (pointer.down || touch.fire || keys.has(" ")) fire(game, player);
        if (touch.abilityQueued) {
          activateAbility(game, player, aimX, aimY);
          touch.abilityQueued = false;
        }
      }

      for (const tank of game.tanks) {
        if (!tank.alive) {
          if (game.now >= tank.respawnAt) respawnTank(game, tank);
          continue;
        }
        if (tank.bot) updateBot(game, tank, dt);
        if (tank.shieldUntil <= game.now) tank.shield = 0;
      }

      for (const projectile of game.projectiles) {
        projectile.px = projectile.x;
        projectile.py = projectile.y;
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;
        if (projectile.x < 0 || projectile.x > MAP_W || projectile.y < 0 || projectile.y > MAP_H) {
          projectile.life = -1;
          continue;
        }
        const obstacle = game.obstacles.find(
          (item) => item.alive && circleHitsRect(projectile.x, projectile.y, projectile.radius, item),
        );
        if (obstacle) {
          if (obstacle.type === "steel" && projectile.bounces < 1) {
            const centerX = obstacle.x + obstacle.w / 2;
            const centerY = obstacle.y + obstacle.h / 2;
            const nx = (projectile.x - centerX) / (obstacle.w / 2);
            const ny = (projectile.y - centerY) / (obstacle.h / 2);
            if (Math.abs(nx) > Math.abs(ny)) projectile.vx *= -1;
            else projectile.vy *= -1;
            projectile.x = projectile.px;
            projectile.y = projectile.py;
            projectile.bounces += 1;
            addParticles(game, projectile.x, projectile.y, "#bdeaf0", 5, 100);
          } else {
            destroyObstacle(game, obstacle, projectile.damage, projectile.ownerId);
            if (projectile.splash > 0) {
              explode(
                game,
                projectile.x,
                projectile.y,
                projectile.splash,
                projectile.damage * 0.72,
                projectile.ownerId,
              );
            }
            projectile.life = -1;
          }
          continue;
        }
        const victim = game.tanks.find(
          (tank) =>
            tank.alive &&
            tank.team !== projectile.team &&
            distance(projectile.x, projectile.y, tank.x, tank.y) <
              projectile.radius + TANKS[tank.kind].radius,
        );
        if (victim) {
          if (projectile.splash > 0) {
            explode(
              game,
              projectile.x,
              projectile.y,
              projectile.splash,
              projectile.damage,
              projectile.ownerId,
            );
          } else {
            hitTank(game, victim, projectile.damage, projectile.ownerId);
          }
          projectile.life = -1;
        }
      }
      game.projectiles = game.projectiles.filter((projectile) => projectile.life > 0);

      for (const strike of game.strikes) {
        if (game.now >= strike.detonateAt) {
          explode(game, strike.x, strike.y, 125, 90, strike.ownerId);
          strike.detonateAt = -1;
        }
      }
      game.strikes = game.strikes.filter((strike) => strike.detonateAt > 0);

      for (const pickup of game.pickups) {
        if (pickup.availableAt > game.now) continue;
        const collector = game.tanks.find(
          (tank) =>
            tank.alive &&
            tank.spawnShieldUntil <= game.now &&
            distance(tank.x, tank.y, pickup.x, pickup.y) < TANKS[tank.kind].radius + 28,
        );
        if (!collector) continue;
        if (pickup.type === "repair") collector.hp = Math.min(collector.maxHp, collector.hp + 45);
        if (pickup.type === "rapid") collector.rapidUntil = game.now + 7;
        if (pickup.type === "armor") {
          collector.shield = Math.max(collector.shield, 45);
          collector.shieldUntil = game.now + 10;
        }
        pickup.availableAt = game.now + pickup.respawn;
        playTone(680, 0.16, "triangle", 0.03);
        pushFeed(game, `${collector.name} SECURED ${pickup.type.toUpperCase()}`, collector.team);
        addParticles(game, pickup.x, pickup.y, "#b9e84c", 16, 180);
      }

      for (const particle of game.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
        particle.life -= dt;
      }
      game.particles = game.particles.filter((particle) => particle.life > 0);

      const desiredX = clamp(player.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
      const desiredY = clamp(player.y - VIEW_H / 2, 0, MAP_H - VIEW_H);
      game.camera.x += (desiredX - game.camera.x) * Math.min(1, dt * 5.5);
      game.camera.y += (desiredY - game.camera.y) * Math.min(1, dt * 5.5);
      game.camera.shake *= Math.pow(0.02, dt);

      let timeLeft = game.duration - game.elapsed;
      if (!game.overtime && timeLeft <= 0 && game.score[0] === game.score[1]) {
        game.overtime = true;
        game.duration = game.elapsed + 45;
        timeLeft = 45;
        pushFeed(game, "OVERTIME — NEXT ELIMINATION WINS", 0);
      }
      const reachedTarget = game.score[0] >= game.scoreTarget || game.score[1] >= game.scoreTarget;
      const overtimeLead = game.overtime && game.score[0] !== game.score[1];
      if (reachedTarget || overtimeLead || timeLeft <= 0) {
        game.winner = game.score[0] === game.score[1] ? -1 : game.score[0] > game.score[1] ? 0 : 1;
        setWinner(game.winner);
        setScreen("result");
      }

      if (game.now - game.lastSnapshot > 0.08 || game.winner !== null) {
        game.lastSnapshot = game.now;
        const spec = TANKS[player.kind];
        const reloadTime = spec.reload * (player.rapidUntil > game.now ? 0.75 : 1);
        setHud({
          blue: game.score[0],
          orange: game.score[1],
          target: game.scoreTarget,
          time: Math.max(0, Math.ceil(timeLeft)),
          overtime: game.overtime,
          hp: Math.ceil(player.hp),
          maxHp: player.maxHp,
          shield: Math.ceil(player.shield),
          reload: clamp((game.now - player.lastFire) / reloadTime, 0, 1),
          ability: clamp((game.now - (player.abilityReadyAt - spec.cooldown)) / spec.cooldown, 0, 1),
          abilityMax: spec.cooldown,
          feed: game.feed.filter((item) => game.now - item.at < 5).map(({ text, team }) => ({ text, team })),
          stats: { ...game.stats },
        });
      }
    },
    [activateAbility, addParticles, destroyObstacle, explode, fire, hitTank, moveTank, playTone, pushFeed, respawnTank, updateBot],
  );

  const drawTank = useCallback((ctx: CanvasRenderingContext2D, game: GameState, tank: Tank) => {
    if (!tank.alive) return;
    const spec = TANKS[tank.kind];
    const teamColor = tank.team === 0 ? "#20a8ff" : "#ff7043";
    ctx.save();
    ctx.translate(Math.round(tank.x), Math.round(tank.y));
    if (tank.spawnShieldUntil > game.now) {
      ctx.strokeStyle = teamColor;
      ctx.globalAlpha = 0.45 + Math.sin(game.now * 10) * 0.15;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, spec.radius + 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (tank.shield > 0 && tank.shieldUntil > game.now) {
      ctx.strokeStyle = "#73efff";
      ctx.fillStyle = "rgba(80, 232, 255, 0.09)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, spec.radius + 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.rotate(tank.bodyAngle);
    ctx.fillStyle = "#101820";
    ctx.fillRect(-spec.radius - 6, -spec.radius + 4, spec.radius * 2 + 12, 9);
    ctx.fillRect(-spec.radius - 6, spec.radius - 13, spec.radius * 2 + 12, 9);
    ctx.fillStyle = spec.dark;
    ctx.fillRect(-spec.radius + 2, -spec.radius + 1, spec.radius * 2 - 4, spec.radius * 2 - 2);
    ctx.fillStyle = spec.color;
    if (tank.kind === "jackal") {
      ctx.fillRect(-18, -14, 38, 28);
      ctx.fillRect(5, -10, 18, 20);
    } else if (tank.kind === "mammoth") {
      ctx.fillRect(-25, -22, 50, 44);
      ctx.fillStyle = "#a8bc50";
      ctx.fillRect(-20, -17, 24, 34);
    } else {
      ctx.fillRect(-24, -17, 48, 34);
      ctx.fillStyle = "#e08942";
      ctx.fillRect(-21, -12, 17, 24);
    }
    ctx.fillStyle = teamColor;
    ctx.fillRect(-7, -spec.radius + 4, 14, 5);
    ctx.restore();

    ctx.save();
    ctx.translate(Math.round(tank.x), Math.round(tank.y));
    ctx.rotate(tank.turretAngle);
    ctx.fillStyle = "#101820";
    const barrel = tank.kind === "longshot" ? 48 : tank.kind === "mammoth" ? 36 : 31;
    ctx.fillRect(0, -5, barrel, 10);
    ctx.fillStyle = spec.color;
    ctx.fillRect(6, -3, barrel - 9, 6);
    if (tank.kind === "jackal") ctx.fillRect(3, 5, 25, 5);
    ctx.fillStyle = spec.dark;
    ctx.beginPath();
    ctx.arc(0, 0, tank.kind === "mammoth" ? 17 : 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = teamColor;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();

    const barW = 56;
    ctx.fillStyle = "rgba(16,24,32,.86)";
    ctx.fillRect(tank.x - barW / 2 - 2, tank.y - spec.radius - 24, barW + 4, 9);
    ctx.fillStyle = teamColor;
    ctx.fillRect(tank.x - barW / 2, tank.y - spec.radius - 22, barW * (tank.hp / tank.maxHp), 5);
  }, []);

  const drawGame = useCallback(
    (game: GameState) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = "#294a37";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const shakeX = reducedMotion.current ? 0 : (Math.random() - 0.5) * game.camera.shake;
      const shakeY = reducedMotion.current ? 0 : (Math.random() - 0.5) * game.camera.shake;
      ctx.save();
      ctx.translate(-Math.round(game.camera.x) + shakeX, -Math.round(game.camera.y) + shakeY);

      ctx.fillStyle = "#517c3c";
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      const tile = 96;
      for (let x = 0; x < MAP_W; x += tile) {
        for (let y = 0; y < MAP_H; y += tile) {
          ctx.fillStyle = (x / tile + y / tile) % 2 === 0 ? "#4a7338" : "#456c35";
          ctx.fillRect(x, y, tile, tile);
          ctx.fillStyle = "rgba(185,232,76,.13)";
          ctx.fillRect(x + 8, y + 9, 22, 5);
          ctx.fillStyle = "rgba(16,24,32,.1)";
          ctx.fillRect(x + 62, y + 53, 18, 6);
        }
      }
      ctx.fillStyle = "#8a6a43";
      ctx.fillRect(0, 760, MAP_W, 390);
      ctx.fillStyle = "rgba(33,46,44,.18)";
      for (let x = 0; x < MAP_W; x += 110) ctx.fillRect(x, 775 + ((x / 110) % 3) * 96, 70, 11);

      ctx.fillStyle = "#218ac1";
      ctx.fillRect(360, 1320, MAP_W - 720, 390);
      ctx.fillStyle = "#2da9df";
      for (let x = 380; x < MAP_W - 380; x += 120) {
        ctx.fillRect(x, 1360 + ((x / 120) % 4) * 74, 65, 8);
      }
      ctx.fillStyle = "#7b684b";
      ctx.fillRect(980, 1320, 230, 390);
      ctx.fillRect(1990, 1320, 230, 390);

      ctx.font = "800 30px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = "#f5f1d6";
      ctx.fillText("NORTH FOUNDRY", MAP_W / 2, 150);
      ctx.fillText("FURNACE YARD", MAP_W / 2, 850);
      ctx.fillText("SOUTH FLOODWAY", MAP_W / 2, 1800);
      ctx.globalAlpha = 1;

      for (const pickup of game.pickups) {
        const ready = pickup.availableAt <= game.now;
        const pulse = 1 + Math.sin(game.now * 5) * 0.09;
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.strokeStyle = ready ? "#b9e84c" : "rgba(16,24,32,.4)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 28 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ready
          ? pickup.type === "repair"
            ? "#b9e84c"
            : pickup.type === "rapid"
              ? "#ffc53d"
              : "#8e7cff"
          : "#3c5555";
        ctx.fillRect(-13, -13, 26, 26);
        ctx.fillStyle = "#101820";
        if (pickup.type === "repair") {
          ctx.fillRect(-3, -9, 6, 18);
          ctx.fillRect(-9, -3, 18, 6);
        } else if (pickup.type === "rapid") {
          ctx.beginPath();
          ctx.moveTo(3, -11);
          ctx.lineTo(-7, 2);
          ctx.lineTo(1, 2);
          ctx.lineTo(-3, 12);
          ctx.lineTo(10, -3);
          ctx.lineTo(2, -3);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-8, -8, 16, 16);
          ctx.fillStyle = "#8e7cff";
          ctx.fillRect(-4, -4, 8, 8);
        }
        ctx.restore();
      }

      for (const obstacle of game.obstacles) {
        if (!obstacle.alive) continue;
        ctx.save();
        ctx.translate(obstacle.x, obstacle.y);
        if (obstacle.type === "steel" || obstacle.type === "furnace") {
          ctx.fillStyle = "#101820";
          ctx.fillRect(-4, -4, obstacle.w + 8, obstacle.h + 8);
          ctx.fillStyle = obstacle.type === "furnace" ? "#39464a" : "#52656b";
          ctx.fillRect(0, 0, obstacle.w, obstacle.h);
          ctx.fillStyle = "#7d9295";
          ctx.fillRect(8, 8, obstacle.w - 16, 8);
          if (obstacle.type === "furnace") {
            ctx.fillStyle = "#ff7043";
            ctx.fillRect(obstacle.w / 2 - 18, obstacle.h - 30, 36, 18);
          }
        } else if (obstacle.type === "crate") {
          ctx.fillStyle = "#39271e";
          ctx.fillRect(-4, -4, obstacle.w + 8, obstacle.h + 8);
          ctx.fillStyle = "#8b572f";
          ctx.fillRect(0, 0, obstacle.w, obstacle.h);
          ctx.strokeStyle = "#c18a4b";
          ctx.lineWidth = 7;
          ctx.strokeRect(7, 7, obstacle.w - 14, obstacle.h - 14);
          ctx.beginPath();
          ctx.moveTo(11, 11);
          ctx.lineTo(obstacle.w - 11, obstacle.h - 11);
          ctx.moveTo(obstacle.w - 11, 11);
          ctx.lineTo(11, obstacle.h - 11);
          ctx.stroke();
          if (obstacle.hp < obstacle.maxHp * 0.55) {
            ctx.strokeStyle = "#101820";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(obstacle.w / 2, 3);
            ctx.lineTo(obstacle.w / 2 - 10, obstacle.h / 2);
            ctx.lineTo(obstacle.w / 2 + 8, obstacle.h - 3);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = "#101820";
          ctx.fillRect(-3, -3, obstacle.w + 6, obstacle.h + 6);
          ctx.fillStyle = "#bc4a2e";
          ctx.fillRect(0, 0, obstacle.w, obstacle.h);
          ctx.fillStyle = "#ffc53d";
          ctx.fillRect(0, 14, obstacle.w, 8);
        }
        ctx.restore();
      }

      for (const strike of game.strikes) {
        const remaining = clamp((strike.detonateAt - game.now) / 0.9, 0, 1);
        ctx.strokeStyle = strike.team === 0 ? "#20a8ff" : "#ff7043";
        ctx.lineWidth = 6;
        ctx.setLineDash([16, 10]);
        ctx.beginPath();
        ctx.arc(strike.x, strike.y, 125 * (0.5 + remaining * 0.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,112,67,.2)";
        ctx.beginPath();
        ctx.arc(strike.x, strike.y, 125, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const projectile of game.projectiles) {
        ctx.strokeStyle = projectile.team === 0 ? "#8fe8ff" : "#ffb199";
        ctx.lineWidth = projectile.kind === "longshot" ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(projectile.px, projectile.py);
        ctx.lineTo(projectile.x, projectile.y);
        ctx.stroke();
        ctx.fillStyle = "#fff4b0";
        ctx.fillRect(
          projectile.x - projectile.radius,
          projectile.y - projectile.radius,
          projectile.radius * 2,
          projectile.radius * 2,
        );
      }
      for (const particle of game.particles) {
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
      ctx.globalAlpha = 1;
      for (const tank of game.tanks) drawTank(ctx, game, tank);
      ctx.restore();

      const mapX = VIEW_W - 226;
      const mapY = 78;
      const mapW = 202;
      const mapH = 118;
      ctx.fillStyle = "rgba(16,24,32,.9)";
      ctx.fillRect(mapX - 6, mapY - 6, mapW + 12, mapH + 12);
      ctx.fillStyle = "#385e43";
      ctx.fillRect(mapX, mapY, mapW, mapH);
      ctx.fillStyle = "#218ac1";
      ctx.fillRect(mapX + 22, mapY + 82, mapW - 44, 25);
      for (const pickup of game.pickups) {
        if (pickup.availableAt <= game.now) {
          ctx.fillStyle = "#b9e84c";
          ctx.fillRect(mapX + (pickup.x / MAP_W) * mapW - 2, mapY + (pickup.y / MAP_H) * mapH - 2, 4, 4);
        }
      }
      for (const tank of game.tanks) {
        if (!tank.alive) continue;
        ctx.fillStyle = tank.team === 0 ? "#20a8ff" : "#ff7043";
        const size = tank.id === "player" ? 7 : 5;
        ctx.fillRect(
          mapX + (tank.x / MAP_W) * mapW - size / 2,
          mapY + (tank.y / MAP_H) * mapH - size / 2,
          size,
          size,
        );
      }
      ctx.strokeStyle = "rgba(245,241,214,.7)";
      ctx.strokeRect(
        mapX + (game.camera.x / MAP_W) * mapW,
        mapY + (game.camera.y / MAP_H) * mapH,
        (VIEW_W / MAP_W) * mapW,
        (VIEW_H / MAP_H) * mapH,
      );

      if (screenRef.current === "match") {
        const pointer = pointerRef.current;
        ctx.strokeStyle = "rgba(245,241,214,.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 11, 0, Math.PI * 2);
        ctx.moveTo(pointer.x - 17, pointer.y);
        ctx.lineTo(pointer.x - 6, pointer.y);
        ctx.moveTo(pointer.x + 6, pointer.y);
        ctx.lineTo(pointer.x + 17, pointer.y);
        ctx.moveTo(pointer.x, pointer.y - 17);
        ctx.lineTo(pointer.x, pointer.y - 6);
        ctx.moveTo(pointer.x, pointer.y + 6);
        ctx.lineTo(pointer.x, pointer.y + 17);
        ctx.stroke();
      }
    },
    [drawTank],
  );

  useEffect(() => {
    if (screen !== "match") return;
    const tick = (timestamp: number) => {
      const game = gameRef.current;
      if (!game || screenRef.current !== "match") return;
      const dt = Math.min(0.033, Math.max(0.001, (timestamp - lastFrameRef.current) / 1000));
      lastFrameRef.current = timestamp;
      updateGame(game, dt);
      drawGame(game);
      if (screenRef.current === "match") rafRef.current = requestAnimationFrame(tick);
    };
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawGame, screen, updateGame]);

  useEffect(() => {
    if ((screen === "paused" || screen === "result") && gameRef.current) drawGame(gameRef.current);
  }, [drawGame, screen]);

  const canvasPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    pointerRef.current.y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
  };

  const resetPointerInput = () => {
    pointerRef.current.down = false;
  };

  const resetTouchInput = () => {
    touchRef.current.x = 0;
    touchRef.current.y = 0;
    touchRef.current.fire = false;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}:${String(seconds % 60).padStart(2, "0")}`;
  };

  const selectedSpec = TANKS[tankKind];
  const resultCopy =
    winner === -1 ? "STALEMATE" : winner === 0 ? "VICTORY" : "DEFEAT";

  return (
    <section className={`tw-app tw-screen-${screen}`} aria-label="Tank Warz browser game">
      {screen === "garage" ? (
        <div className="tw-garage">
          <div className="tw-keyart" aria-hidden="true" />
          <div className="tw-garage-shade" />
          <header className="tw-brand-row">
            <div>
              <p className="tw-eyebrow">Rustfall command // pilot online</p>
              <h1 className="tw-logo"><span>Tank</span> Warz</h1>
            </div>
            <button
              className="tw-sound"
              type="button"
              onClick={() => setMuted((current) => !current)}
              aria-pressed={muted}
              aria-label={muted ? "Enable battle sound" : "Mute battle sound"}
            >
              {muted ? "SOUND OFF" : "SOUND ON"}
            </button>
          </header>

          <div className="tw-setup-grid">
            <section className="tw-panel tw-mode-panel" aria-labelledby="mode-title">
              <p className="tw-kicker">01 // Choose formation</p>
              <h2 id="mode-title">Battle mode</h2>
              <div className="tw-mode-list">
                {([1, 2, 3] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`tw-mode-card ${mode === size ? "is-selected" : ""}`}
                    onClick={() => setMode(size)}
                    aria-pressed={mode === size}
                  >
                    <span className="tw-mode-number">{MODES[size].label}</span>
                    <span className="tw-mode-meta">
                      <strong>{MODES[size].name}</strong>
                      <small>{MODES[size].copy}</small>
                    </span>
                    <span className="tw-slots" aria-hidden="true">
                      {Array.from({ length: size }).map((_, index) => (
                        <i key={index} />
                      ))}
                      <b>VS</b>
                      {Array.from({ length: size }).map((_, index) => (
                        <i key={index} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="tw-panel tw-tank-panel" aria-labelledby="tank-title">
              <p className="tw-kicker">02 // Choose your steel</p>
              <div className="tw-panel-heading">
                <div>
                  <h2 id="tank-title">{selectedSpec.name}</h2>
                  <p>{selectedSpec.role}</p>
                </div>
                <span className={`tw-tank-badge badge-${tankKind}`} aria-hidden="true">{tankKind === "jackal" ? "J" : tankKind === "mammoth" ? "M" : "L"}</span>
              </div>
              <div className="tw-tank-tabs" role="list" aria-label="Playable tanks">
                {(Object.keys(TANKS) as TankKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={tankKind === kind ? "is-selected" : ""}
                    onClick={() => setTankKind(kind)}
                    aria-pressed={tankKind === kind}
                  >
                    <span>{TANKS[kind].name}</span>
                    <small>{TANKS[kind].role}</small>
                  </button>
                ))}
              </div>
              <div className="tw-stat-grid">
                {(["Armor", "Mobility", "Firepower"] as const).map((label, statIndex) => (
                  <div key={label} className="tw-stat">
                    <span>{label}</span>
                    <div aria-label={`${label}: ${selectedSpec.stats[statIndex]} out of 5`}>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <i key={index} className={index < selectedSpec.stats[statIndex] ? "is-full" : ""} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="tw-ability-card">
                <span className="tw-ability-key">E</span>
                <div>
                  <strong>{selectedSpec.ability}</strong>
                  <p>{selectedSpec.abilityCopy}</p>
                </div>
                <small>{selectedSpec.cooldown}s</small>
              </div>
            </section>
          </div>

          <footer className="tw-garage-footer">
            <div className="tw-controls-copy">
              <span><kbd>WASD</kbd> Move</span>
              <span><kbd>Mouse</kbd> Aim</span>
              <span><kbd>Click / Space</kbd> Fire</span>
              <span><kbd>E</kbd> Ability</span>
            </div>
            <button className="tw-deploy" type="button" onClick={startMatch}>
              <span>Deploy</span>
              <small>{MODES[mode].label}{" // "}{selectedSpec.name}</small>
            </button>
          </footer>
        </div>
      ) : (
        <div className="tw-battle-shell">
          <canvas
            ref={canvasRef}
            className="tw-canvas"
            aria-label="Rustfall Basin battle arena. Use WASD to move, mouse to aim, click or Space to fire, and E for your ability."
            onPointerMove={canvasPointer}
            onPointerDown={(event) => {
              canvasPointer(event);
              pointerRef.current.down = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              pointerRef.current.down = false;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerLeave={resetPointerInput}
            onPointerCancel={resetPointerInput}
            onLostPointerCapture={resetPointerInput}
            onContextMenu={(event) => event.preventDefault()}
          />
          <div className="tw-hud">
            <button
              type="button"
              className="tw-pause-button"
              onClick={() => setScreen("paused")}
              aria-label="Pause battle"
            >
              II
            </button>
            <div className="tw-scoreboard">
              <span className="tw-blue-score">{hud.blue}</span>
              <div>
                <strong>{hud.overtime ? "OVERTIME" : MODES[mode].label}</strong>
                <time>{formatTime(hud.time)}</time>
                <small>FIRST TO {hud.target}</small>
              </div>
              <span className="tw-orange-score">{hud.orange}</span>
            </div>
            <div className="tw-feed" aria-label="Elimination feed" aria-live="polite">
              {hud.feed.map((item, index) => (
                <p key={`${item.text}-${index}`} className={item.team === 0 ? "is-blue" : "is-orange"}>{item.text}</p>
              ))}
            </div>
            <div className="tw-player-card">
              <div className={`tw-tank-badge badge-${tankKind}`}>{selectedSpec.name.slice(0, 1)}</div>
              <div className="tw-health-block">
                <span>{selectedSpec.name}{" // PILOT"}</span>
                <div className="tw-health-track" role="progressbar" aria-label="Tank health" aria-valuemin={0} aria-valuemax={hud.maxHp} aria-valuenow={hud.hp}><i style={{ width: `${clamp(hud.hp / hud.maxHp, 0, 1) * 100}%` }} /></div>
                <strong>{hud.hp} / {hud.maxHp} HP {hud.shield > 0 ? `+ ${hud.shield} SHIELD` : ""}</strong>
              </div>
            </div>
            <div className="tw-combat-actions">
              <div className="tw-reload">
                <span>PRIMARY</span>
                <div role="progressbar" aria-label="Primary weapon reload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.reload * 100)}><i style={{ width: `${hud.reload * 100}%` }} /></div>
                <strong>{hud.reload >= 1 ? "READY" : "RELOADING"}</strong>
              </div>
              <button
                type="button"
                className="tw-ability-button"
                onClick={() => { touchRef.current.abilityQueued = true; }}
                disabled={screen !== "match" || hud.ability < 1}
                aria-label={`Use ${selectedSpec.ability}`}
              >
                <span>E</span>
                <strong>{selectedSpec.ability}</strong>
                <i style={{ transform: `scaleX(${hud.ability})` }} />
              </button>
            </div>
          </div>

          <div className="tw-touch-controls" aria-label="Touch controls">
            <div className="tw-touch-pad">
              <button type="button" aria-label="Move up" onPointerDown={() => { touchRef.current.y = -1; }} onPointerUp={resetTouchInput} onPointerCancel={resetTouchInput} onPointerLeave={resetTouchInput}>▲</button>
              <button type="button" aria-label="Move left" onPointerDown={() => { touchRef.current.x = -1; }} onPointerUp={resetTouchInput} onPointerCancel={resetTouchInput} onPointerLeave={resetTouchInput}>◀</button>
              <button type="button" aria-label="Move right" onPointerDown={() => { touchRef.current.x = 1; }} onPointerUp={resetTouchInput} onPointerCancel={resetTouchInput} onPointerLeave={resetTouchInput}>▶</button>
              <button type="button" aria-label="Move down" onPointerDown={() => { touchRef.current.y = 1; }} onPointerUp={resetTouchInput} onPointerCancel={resetTouchInput} onPointerLeave={resetTouchInput}>▼</button>
            </div>
            <div className="tw-touch-actions">
              <button type="button" className="is-fire" onPointerDown={() => { touchRef.current.fire = true; }} onPointerUp={resetTouchInput} onPointerCancel={resetTouchInput} onPointerLeave={resetTouchInput}>FIRE</button>
              <button type="button" onPointerDown={() => { touchRef.current.abilityQueued = true; }}>ABILITY</button>
            </div>
          </div>

          <div className="tw-rotate-gate" role="status">
            <strong>Rotate to landscape</strong>
            <span>Rustfall Basin needs a wider tactical view.</span>
            <button type="button" onClick={() => setScreen("paused")}>Pause battle</button>
          </div>

          {screen === "paused" && (
            <div className="tw-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <div className="tw-modal-card">
                <p className="tw-kicker">Battle suspended</p>
                <h2 id="pause-title">Paused</h2>
                <p>Rustfall Basin will hold your position.</p>
                <button type="button" className="tw-deploy" autoFocus onClick={() => setScreen("match")}><span>Resume</span><small>Return to battle</small></button>
                <button type="button" className="tw-secondary" onClick={() => setScreen("garage")}>Return to garage</button>
              </div>
            </div>
          )}

          {screen === "result" && (
            <div className="tw-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
              <div className="tw-modal-card tw-result-card">
                <p className="tw-kicker">Mission complete</p>
                <h2 id="result-title" className={winner === 0 ? "is-victory" : ""}>{resultCopy}</h2>
                <div className="tw-final-score"><span>{hud.blue}</span><b>—</b><span>{hud.orange}</span></div>
                <div className="tw-result-stats">
                  <div><strong>{hud.stats.eliminations}</strong><span>Eliminations</span></div>
                  <div><strong>{hud.stats.deaths}</strong><span>Deaths</span></div>
                  <div><strong>{hud.stats.damage}</strong><span>Damage</span></div>
                  <div><strong>{hud.stats.abilities}</strong><span>Abilities</span></div>
                </div>
                <button type="button" className="tw-deploy" autoFocus onClick={startMatch}><span>Rematch</span><small>Same loadout</small></button>
                <button type="button" className="tw-secondary" onClick={() => setScreen("garage")}>Change loadout</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
