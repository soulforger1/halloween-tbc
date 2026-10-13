import { mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const PORT = Number(process.env.PORT) || 3131;
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomUUID().slice(0, 8);
const PUBLIC_DIR = join(import.meta.dir, "public");
const DATA_DIR = join(import.meta.dir, "data");
const DATA_FILE = join(DATA_DIR, "rsvps.json");
const MAX_NAME = 40;
const MAX_RSVPS = 500;

type Rsvp = { name: string; coming: boolean; at: string };
type Team = { name: string; members: string[] };
// Everyone who finished the hidden poster task, in order. The first one not disqualified wins.
type EggSolver = { name: string; at: string; disqualified: boolean };
type Db = { rsvps: Rsvp[]; teams: Team[]; egg: EggSolver[] };

const TEAM_NAMES = [
  "Сүнснүүд",
  "Хулуунууд",
  "Сарьсан багваахайнууд",
  "Хар муурнууд",
  "Шуламнууд",
  "Араг яснууд",
  "Цус сорогчид",
  "Зомбинууд",
  "Аалзнууд",
  "Чөтгөрүүд",
  "Муминууд",
  "Хүн чононууд",
];

await mkdir(DATA_DIR, { recursive: true });
const dataFile = Bun.file(DATA_FILE);
const db: Db = (await dataFile.exists())
  ? { rsvps: [], teams: [], egg: [], ...(await dataFile.json()) }
  : { rsvps: [], teams: [], egg: [] };

// Writes are chained so two requests never write the file at the same time.
let pending: Promise<unknown> = Promise.resolve();
function save() {
  pending = pending.then(() => Bun.write(DATA_FILE, JSON.stringify(db, null, 2)));
  return pending;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeTeams(names: string[], teamCount: number): Team[] {
  const labels = shuffle(TEAM_NAMES);
  const teams: Team[] = Array.from({ length: teamCount }, (_, i) => ({
    name: labels[i] ?? `Баг ${i + 1}`,
    members: [],
  }));
  shuffle(names).forEach((name, i) => teams[i % teamCount].members.push(name));
  return teams;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const cleanName = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function publicState() {
  const coming = db.rsvps.filter((r) => r.coming).map((r) => r.name);
  return {
    coming,
    count: coming.length,
    notComingCount: db.rsvps.length - coming.length,
    teams: db.teams,
  };
}

async function api(req: Request, url: URL): Promise<Response> {
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/rsvps") return json(publicState());
  if (route === "GET /api/teams") return json({ teams: db.teams });

  if (route === "POST /api/rsvp") {
    const body = await readBody(req);
    const name = cleanName(body.name);
    if (!name) return json({ error: "name required" }, 400);
    if (typeof body.coming !== "boolean") return json({ error: "coming required" }, 400);

    const existing = db.rsvps.find((r) => sameName(r.name, name));
    if (existing) {
      existing.coming = body.coming;
      existing.at = new Date().toISOString();
    } else {
      if (db.rsvps.length >= MAX_RSVPS) return json({ error: "list is full" }, 400);
      db.rsvps.push({ name, coming: body.coming, at: new Date().toISOString() });
    }
    await save();
    return json(publicState());
  }

  if (route === "POST /api/egg") {
    const body = await readBody(req);
    const name = cleanName(body.name);
    if (!name) return json({ error: "name required" }, 400);

    if (!db.egg.some((e) => sameName(e.name, name))) {
      if (db.egg.length >= MAX_RSVPS) return json({ error: "list is full" }, 400);
      db.egg.push({ name, at: new Date().toISOString(), disqualified: false });
      await save();
    }
    const valid = db.egg.filter((e) => !e.disqualified);
    return json({
      winner: valid[0]?.name ?? null,
      place: valid.findIndex((e) => sameName(e.name, name)) + 1,
    });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (url.searchParams.get("key") !== ADMIN_KEY) return json({ error: "unauthorized" }, 401);

    if (route === "POST /api/admin/egg") {
      const body = await readBody(req);
      const solver = db.egg.find((e) => sameName(e.name, String(body.name ?? "")));
      if (!solver) return json({ error: "not found" }, 404);
      solver.disqualified = body.disqualified === true;
      await save();
      return json(db);
    }

    if (route === "GET /api/admin/rsvps") return json(db);

    if (route === "DELETE /api/admin/rsvp") {
      const body = await readBody(req);
      const name = String(body.name ?? "");
      db.rsvps = db.rsvps.filter((r) => !sameName(r.name, name));
      await save();
      return json(db);
    }

    if (route === "POST /api/admin/teams") {
      const body = await readBody(req);
      const names = db.rsvps.filter((r) => r.coming).map((r) => r.name);
      if (!names.length) return json({ error: "no attendees" }, 400);

      const teamSize = Number(body.teamSize);
      const requested = Number(body.teamCount) || Math.ceil(names.length / teamSize);
      if (!Number.isFinite(requested) || requested < 1) {
        return json({ error: "teamSize or teamCount required" }, 400);
      }
      db.teams = makeTeams(names, Math.min(Math.floor(requested), names.length));
      await save();
      return json(db);
    }

    if (route === "DELETE /api/admin/teams") {
      db.teams = [];
      await save();
      return json(db);
    }
  }

  return json({ error: "not found" }, 404);
}

async function serveStatic(pathname: string): Promise<Response> {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (path === "/") path = "/index.html";
  if (path === "/admin") path = "/admin.html";

  const filePath = resolve(PUBLIC_DIR, "." + path);
  if (!filePath.startsWith(PUBLIC_DIR + sep)) return new Response("Not found", { status: 404 });

  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file);
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    return url.pathname.startsWith("/api/") ? api(req, url) : serveStatic(url.pathname);
  },
});

console.log(`Quiz Night RSVP:  http://localhost:${server.port}`);
console.log(`Admin:            http://localhost:${server.port}/admin?key=${ADMIN_KEY}`);
