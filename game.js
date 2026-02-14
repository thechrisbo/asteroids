// ── Canvas Setup ──────────────────────────────────────────────
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ── Constants ─────────────────────────────────────────────────
const SHIP_SIZE = 20;
const FRICTION = 0.98;
const BULLET_SPEED = 500;
const MAX_BULLETS = 8;
const INVINCIBLE_TIME = 2.5;
const ASTEROID_SPEED_BASE = 40;
const ASTEROID_SIZES = { large: 50, medium: 25, small: 12 };
const ASTEROID_POINTS = { large: 20, medium: 50, small: 100 };
const INITIAL_ASTEROIDS = 4;
const PARTICLE_COUNT = 12;
const PARTICLE_LIFETIME = 0.8;
const SPLASH_RADIUS = 60;

// Ship-stat-driven values (set by applyShipStats)
let shipThrust = 300;
let shipTurnSpeed = 5;
let shipFireCooldown = 0.15;
let shipBulletLife = 1.2;

// UFO constants
const UFO_SPAWN_INTERVAL_BASE = 15;
const UFO_SPAWN_INTERVAL_MIN = 8;
const UFO_SPEED_LARGE = 100;
const UFO_SPEED_SMALL = 150;
const UFO_BULLET_SPEED = 250;
const UFO_FIRE_INTERVAL_LARGE = 2.0;
const UFO_FIRE_INTERVAL_SMALL = 1.2;
const UFO_SIZE_LARGE = 30;
const UFO_SIZE_SMALL = 16;
const UFO_POINTS = { large: 200, small: 1000 };
const UFO_ZIGZAG_INTERVAL = 1.5;

const WAVE_BANNER_DURATION = 2.5;

// Highscore
const MAX_HIGHSCORES = 10;
const NAME_LENGTH = 5;
const LS_KEY = "asteroids_top10";

// ── Supabase Leaderboard ─────────────────────────────────────
const SUPABASE_URL = "https://ddcbluicunryrafsqygf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fOY0xoYLE1YqGmF7ceEuSA_gjP9L3Yd";
const LEADERBOARD_TABLE = "highscores";
let leaderboardLoading = false;
let leaderboardError = false;
let lastLeaderboardFetch = 0;
const LEADERBOARD_CACHE_MS = 30000;

// ── Ship Types ────────────────────────────────────────────────
const SHIP_TYPES = [
    {
        name: "THE WAVE",
        speed: 5, attack: 5, range: 3,
        special: null,
        desc: "BALANCED ALL-ROUNDER",
    },
    {
        name: "INTERSTELLAR",
        speed: 7, attack: 3, range: 5,
        special: null,
        desc: "FAST + LONG RANGE",
    },
    {
        name: "TERMINATOR",
        speed: 3, attack: 7, range: 2,
        special: "splash",
        desc: "SPLASH DAMAGE ON HIT",
    },
];

function applyShipStats(shipType) {
    const t = shipType;
    // Speed 5 = base (300 thrust, 5 turn). Each point ±15% thrust, ±10% turn.
    shipThrust = 300 * (1 + (t.speed - 5) * 0.15);
    shipTurnSpeed = 5 * (1 + (t.speed - 5) * 0.10);
    // Attack 5 = 0.15s cooldown. Each point -0.015s (lower = faster).
    shipFireCooldown = Math.max(0.05, 0.15 - (t.attack - 5) * 0.015);
    // Range 5 = 1.2s bullet life. Each point ±0.15s.
    shipBulletLife = Math.max(0.3, 1.2 + (t.range - 5) * 0.15);
}

// ── Highscore Persistence ─────────────────────────────────────
function loadHighscores() {
    try {
        const data = JSON.parse(localStorage.getItem(LS_KEY));
        if (Array.isArray(data)) return data.slice(0, MAX_HIGHSCORES);
    } catch (e) {}
    return [];
}

function saveHighscores(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function getTopScore(list) {
    return list.length > 0 ? list[0].score : 0;
}

function qualifiesForHighscore(sc, list) {
    if (sc <= 0) return false;
    if (list.length < MAX_HIGHSCORES) return true;
    return sc > list[list.length - 1].score;
}

function insertHighscore(name, sc, wv, list, shipName) {
    const entry = { name: name.toUpperCase(), score: sc, wave: wv, ship: shipName || "" };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    if (list.length > MAX_HIGHSCORES) list.length = MAX_HIGHSCORES;
    saveHighscores(list);
    return list;
}

let highscores = loadHighscores();

// ── Supabase Leaderboard Functions ───────────────────────────
async function fetchLeaderboard() {
    const now = Date.now();
    if (now - lastLeaderboardFetch < LEADERBOARD_CACHE_MS && highscores.length > 0) return;
    leaderboardLoading = true;
    leaderboardError = false;
    try {
        const url = `${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}?select=name,score,wave,ship&order=score.desc&limit=${MAX_HIGHSCORES}`;
        const res = await fetch(url, {
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        highscores = data.map(row => ({
            name: row.name,
            score: row.score,
            wave: row.wave,
            ship: row.ship || "",
        }));
        saveHighscores(highscores);
        lastLeaderboardFetch = now;
    } catch (err) {
        console.warn("Leaderboard fetch failed, using local cache:", err);
        leaderboardError = true;
        highscores = loadHighscores();
    } finally {
        leaderboardLoading = false;
    }
}

async function submitScore(name, sc, wv, shipName) {
    // localStorage already updated via insertHighscore before this call
    try {
        const url = `${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}`;
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            body: JSON.stringify({ name, score: sc, wave: wv, ship: shipName }),
        });
        if (!res.ok) {
            const errBody = await res.text();
            console.warn("Score submit failed:", res.status, errBody);
        }
    } catch (err) {
        console.warn("Score submit failed (network):", err);
    }
    lastLeaderboardFetch = 0;
    await fetchLeaderboard();
}

fetchLeaderboard();

// ── Audio ─────────────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(freq, duration, type = "square", volume = 0.15) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function sfxShoot() { playSound(800, 0.08, "square", 0.1); }
function sfxExplosionLarge() { playSound(60, 0.4, "sawtooth", 0.2); }
function sfxExplosionMedium() { playSound(100, 0.3, "sawtooth", 0.15); }
function sfxExplosionSmall() { playSound(180, 0.2, "sawtooth", 0.12); }
function sfxThrust() { playSound(50, 0.1, "sawtooth", 0.06); }
function sfxDeath() {
    playSound(200, 0.5, "sawtooth", 0.25);
    setTimeout(() => playSound(100, 0.6, "sawtooth", 0.2), 150);
}
function sfxUFOShoot() { playSound(400, 0.12, "triangle", 0.1); }
function sfxUFOExplosion() {
    playSound(300, 0.3, "sawtooth", 0.2);
    setTimeout(() => playSound(150, 0.4, "square", 0.15), 100);
}
function sfxNameEntry() { playSound(600, 0.06, "square", 0.08); }
function sfxSelect() { playSound(500, 0.08, "square", 0.1); }
function sfxConfirm() {
    playSound(800, 0.1, "square", 0.12);
    setTimeout(() => playSound(1000, 0.12, "square", 0.12), 80);
}
function sfxSplash() { playSound(200, 0.25, "sawtooth", 0.18); }

let ufoHumOsc = null;
let ufoHumGain = null;

function startUFOHum() {
    if (ufoHumOsc) return;
    ufoHumOsc = audioCtx.createOscillator();
    ufoHumGain = audioCtx.createGain();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 4;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(ufoHumGain.gain);
    ufoHumOsc.type = "square";
    ufoHumOsc.frequency.value = 80;
    ufoHumGain.gain.value = 0.06;
    ufoHumOsc.connect(ufoHumGain);
    ufoHumGain.connect(audioCtx.destination);
    lfo.start();
    ufoHumOsc.start();
    ufoHumOsc._lfo = lfo;
}

function stopUFOHum() {
    if (!ufoHumOsc) return;
    try { ufoHumOsc._lfo.stop(); ufoHumOsc.stop(); } catch (e) {}
    ufoHumOsc = null;
    ufoHumGain = null;
}

// ── Input ─────────────────────────────────────────────────────
const keys = {};
let lastKeyDown = null;

window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    lastKeyDown = e;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
    }
    if (e.code === "Backspace") e.preventDefault();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

// ── Game State ────────────────────────────────────────────────
let ship, bullets, asteroids, particles;
let ufo, ufoBullets, ufoSpawnTimer;
let score, lives, wave;
let state; // "start", "shipselect", "playing", "gameover", "entername", "scores"
let invincibleTimer, respawnTimer;
let shootCooldown, thrustSoundTimer;
let waveBannerTimer, speedMultiplier;
let splashRings; // visual expanding rings for Terminator

// Ship selection state
let selectedShip; // index 0-2
let selectInputCooldown;

// Name entry state
let entryName, entryCursorBlink, nameEntryRank;

function initGame() {
    applyShipStats(SHIP_TYPES[selectedShip]);
    ship = createShip();
    bullets = [];
    asteroids = [];
    particles = [];
    splashRings = [];
    ufo = null;
    ufoBullets = [];
    ufoSpawnTimer = 10;
    score = 0;
    lives = 3;
    wave = 0;
    invincibleTimer = 0;
    respawnTimer = 0;
    shootCooldown = 0;
    thrustSoundTimer = 0;
    waveBannerTimer = 0;
    speedMultiplier = 1.0;
    stopUFOHum();
    spawnWave();
}

function createShip() {
    return {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: 0, vy: 0,
        angle: -Math.PI / 2,
        radius: SHIP_SIZE * 0.6,
        alive: true,
    };
}

// ── Asteroids ─────────────────────────────────────────────────
function createAsteroid(x, y, size) {
    const baseSpeed = ASTEROID_SPEED_BASE + Math.random() * 40 + (3 - Object.keys(ASTEROID_SIZES).indexOf(size)) * 15;
    const speed = baseSpeed * speedMultiplier;
    const angle = Math.random() * Math.PI * 2;
    const radius = ASTEROID_SIZES[size];
    const verts = [];
    const numVerts = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numVerts; i++) {
        const a = (i / numVerts) * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.3);
        verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return {
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius, size, verts,
        rotAngle: 0, rotSpeed: (Math.random() - 0.5) * 1.5,
    };
}

function spawnWave() {
    wave++;
    speedMultiplier = Math.min(2.0, 1.0 + (wave - 1) * 0.08);
    const interval = Math.max(UFO_SPAWN_INTERVAL_MIN, UFO_SPAWN_INTERVAL_BASE - (wave - 1) * 0.8);
    ufoSpawnTimer = interval;
    const count = INITIAL_ASTEROIDS + (wave - 1);
    for (let i = 0; i < count; i++) {
        let x, y;
        do {
            x = Math.random() * canvas.width;
            y = Math.random() * canvas.height;
        } while (dist(x, y, ship.x, ship.y) < 200);
        asteroids.push(createAsteroid(x, y, "large"));
    }
    waveBannerTimer = WAVE_BANNER_DURATION;
}

// ── UFO ───────────────────────────────────────────────────────
function createUFO(type) {
    const fromLeft = Math.random() < 0.5;
    const size = type === "large" ? UFO_SIZE_LARGE : UFO_SIZE_SMALL;
    const speed = type === "large" ? UFO_SPEED_LARGE : UFO_SPEED_SMALL;
    const baseFireInterval = type === "large" ? UFO_FIRE_INTERVAL_LARGE : UFO_FIRE_INTERVAL_SMALL;
    const fireInterval = Math.max(0.5, baseFireInterval - (wave - 1) * 0.05);
    return {
        type,
        x: fromLeft ? -size : canvas.width + size,
        y: Math.random() * canvas.height * 0.6 + canvas.height * 0.2,
        vx: (fromLeft ? 1 : -1) * speed,
        vy: (Math.random() - 0.5) * 60,
        size, radius: size * 0.7,
        fireInterval, fireTimer: fireInterval * 0.5,
        zigzagTimer: UFO_ZIGZAG_INTERVAL,
        direction: fromLeft ? 1 : -1,
    };
}

function getUFOType() {
    const smallProb = Math.min(0.85, (wave - 1) * 0.12);
    return Math.random() < smallProb ? "small" : "large";
}

// ── Particles & Splash Rings ──────────────────────────────────
function spawnExplosion(x, y, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 120;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5),
            maxLife: PARTICLE_LIFETIME,
        });
    }
}

function spawnSplashRing(x, y) {
    splashRings.push({
        x, y,
        radius: 5,
        maxRadius: SPLASH_RADIUS,
        life: 0.4,
        maxLife: 0.4,
    });
}

// ── Helpers ───────────────────────────────────────────────────
function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function wrap(obj) {
    if (obj.x < -50) obj.x += canvas.width + 100;
    if (obj.x > canvas.width + 50) obj.x -= canvas.width + 100;
    if (obj.y < -50) obj.y += canvas.height + 100;
    if (obj.y > canvas.height + 50) obj.y -= canvas.height + 100;
}

function wrapVertical(obj) {
    if (obj.y < -50) obj.y += canvas.height + 100;
    if (obj.y > canvas.height + 50) obj.y -= canvas.height + 100;
}

function hasSpecialSplash() {
    return SHIP_TYPES[selectedShip].special === "splash";
}

// ── Splash Damage (Terminator) ────────────────────────────────
function applySplashDamage(x, y) {
    if (!hasSpecialSplash()) return;
    spawnSplashRing(x, y);
    sfxSplash();

    // Damage nearby asteroids
    for (let j = asteroids.length - 1; j >= 0; j--) {
        const a = asteroids[j];
        if (dist(x, y, a.x, a.y) < SPLASH_RADIUS + a.radius) {
            score += ASTEROID_POINTS[a.size];
            splitAsteroid(a, j);
        }
    }

    // Damage UFO if in range
    if (ufo && dist(x, y, ufo.x, ufo.y) < SPLASH_RADIUS + ufo.radius) {
        score += UFO_POINTS[ufo.type];
        spawnExplosion(ufo.x, ufo.y, 16);
        sfxUFOExplosion();
        destroyUFO(true);
    }
}

// ── Update ────────────────────────────────────────────────────
function update(dt) {
    // ── Title Screen ──
    if (state === "start" || state === "scores") {
        if (state === "start" && (keys["Space"] || keys["Enter"])) {
            keys["Space"] = false;
            keys["Enter"] = false;
            if (audioCtx.state === "suspended") audioCtx.resume();
            selectedShip = 0;
            selectInputCooldown = 0.2;
            state = "shipselect";
        }
        if (state === "start" && keys["KeyH"]) {
            keys["KeyH"] = false;
            state = "scores";
        }
        if (state === "scores" && (keys["Escape"] || keys["KeyH"] || keys["Space"] || keys["Enter"])) {
            keys["Escape"] = false;
            keys["KeyH"] = false;
            keys["Space"] = false;
            keys["Enter"] = false;
            state = "start";
        }
        for (const a of asteroids) {
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.rotAngle += a.rotSpeed * dt;
            wrap(a);
        }
        return;
    }

    // ── Ship Select ──
    if (state === "shipselect") {
        selectInputCooldown -= dt;
        if (selectInputCooldown <= 0) {
            if (keys["ArrowLeft"] || keys["KeyA"]) {
                selectedShip = (selectedShip + 2) % 3;
                sfxSelect();
                selectInputCooldown = 0.18;
            }
            if (keys["ArrowRight"] || keys["KeyD"]) {
                selectedShip = (selectedShip + 1) % 3;
                sfxSelect();
                selectInputCooldown = 0.18;
            }
            // Direct select with 1/2/3
            if (keys["Digit1"]) { selectedShip = 0; sfxSelect(); selectInputCooldown = 0.18; }
            if (keys["Digit2"]) { selectedShip = 1; sfxSelect(); selectInputCooldown = 0.18; }
            if (keys["Digit3"]) { selectedShip = 2; sfxSelect(); selectInputCooldown = 0.18; }
        }
        if (keys["Space"] || keys["Enter"]) {
            keys["Space"] = false;
            keys["Enter"] = false;
            sfxConfirm();
            initGame();
            state = "playing";
        }
        if (keys["Escape"]) {
            keys["Escape"] = false;
            state = "start";
        }
        for (const a of asteroids) {
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            a.rotAngle += a.rotSpeed * dt;
            wrap(a);
        }
        return;
    }

    // ── Name Entry ──
    if (state === "entername") {
        entryCursorBlink += dt;
        handleNameEntry();
        return;
    }

    // ── Game Over ──
    if (state === "gameover") {
        if (keys["Space"] || keys["Enter"]) {
            keys["Space"] = false;
            keys["Enter"] = false;
            initTitleScreen();
            state = "start";
        }
        return;
    }

    // ── Playing ──
    if (waveBannerTimer > 0) waveBannerTimer -= dt;

    if (ship.alive) {
        if (keys["ArrowLeft"] || keys["KeyA"]) ship.angle -= shipTurnSpeed * dt;
        if (keys["ArrowRight"] || keys["KeyD"]) ship.angle += shipTurnSpeed * dt;

        if (keys["ArrowUp"] || keys["KeyW"]) {
            ship.vx += Math.cos(ship.angle) * shipThrust * dt;
            ship.vy += Math.sin(ship.angle) * shipThrust * dt;
            thrustSoundTimer -= dt;
            if (thrustSoundTimer <= 0) { sfxThrust(); thrustSoundTimer = 0.12; }
        } else {
            thrustSoundTimer = 0;
        }

        ship.vx *= Math.pow(FRICTION, dt * 60);
        ship.vy *= Math.pow(FRICTION, dt * 60);
        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;
        wrap(ship);

        shootCooldown -= dt;
        if (keys["Space"] && shootCooldown <= 0 && bullets.length < MAX_BULLETS) {
            bullets.push({
                x: ship.x + Math.cos(ship.angle) * SHIP_SIZE,
                y: ship.y + Math.sin(ship.angle) * SHIP_SIZE,
                vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
                vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
                life: shipBulletLife,
            });
            shootCooldown = shipFireCooldown;
            sfxShoot();
        }

        if (invincibleTimer > 0) invincibleTimer -= dt;
    } else {
        respawnTimer -= dt;
        if (respawnTimer <= 0) {
            if (lives > 0) {
                ship = createShip();
                invincibleTimer = INVINCIBLE_TIME;
            } else {
                stopUFOHum();
                if (qualifiesForHighscore(score, highscores)) {
                    state = "entername";
                    entryName = [];
                    entryCursorBlink = 0;
                    lastKeyDown = null;
                } else {
                    state = "gameover";
                }
            }
        }
    }

    // Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        wrap(b);
        if (b.life <= 0) bullets.splice(i, 1);
    }

    // Asteroids
    for (const a of asteroids) {
        a.x += a.vx * dt; a.y += a.vy * dt;
        a.rotAngle += a.rotSpeed * dt;
        wrap(a);
    }

    // UFO Spawn
    if (!ufo) {
        ufoSpawnTimer -= dt;
        if (ufoSpawnTimer <= 0) { ufo = createUFO(getUFOType()); startUFOHum(); }
    }

    // UFO Update
    if (ufo) {
        ufo.x += ufo.vx * dt; ufo.y += ufo.vy * dt;
        ufo.zigzagTimer -= dt;
        if (ufo.zigzagTimer <= 0) {
            ufo.vy = (Math.random() - 0.5) * 120;
            ufo.zigzagTimer = UFO_ZIGZAG_INTERVAL * (0.7 + Math.random() * 0.6);
        }
        wrapVertical(ufo);
        if ((ufo.direction === 1 && ufo.x > canvas.width + ufo.size + 20) ||
            (ufo.direction === -1 && ufo.x < -ufo.size - 20)) {
            destroyUFO(false);
        }
        if (ufo) {
            ufo.fireTimer -= dt;
            if (ufo.fireTimer <= 0) { fireUFOBullet(); ufo.fireTimer = ufo.fireInterval; }
        }
    }

    // UFO Bullets
    for (let i = ufoBullets.length - 1; i >= 0; i--) {
        const b = ufoBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        wrap(b);
        if (b.life <= 0) ufoBullets.splice(i, 1);
    }

    // Bullet–Asteroid Collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const b = bullets[i]; const a = asteroids[j];
            if (!b || !a) continue;
            if (dist(b.x, b.y, a.x, a.y) < a.radius) {
                const hitX = b.x, hitY = b.y;
                bullets.splice(i, 1);
                score += ASTEROID_POINTS[a.size];
                splitAsteroid(a, j);
                applySplashDamage(hitX, hitY);
                break;
            }
        }
    }

    // Player Bullet–UFO Collision
    if (ufo) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (dist(b.x, b.y, ufo.x, ufo.y) < ufo.radius) {
                const hitX = b.x, hitY = b.y;
                bullets.splice(i, 1);
                score += UFO_POINTS[ufo.type];
                spawnExplosion(ufo.x, ufo.y, 16);
                sfxUFOExplosion();
                destroyUFO(true);
                applySplashDamage(hitX, hitY);
                break;
            }
        }
    }

    // Player Bullet–UFO Bullet Collision
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = ufoBullets.length - 1; j >= 0; j--) {
            const pb = bullets[i]; const ub = ufoBullets[j];
            if (!pb || !ub) continue;
            if (dist(pb.x, pb.y, ub.x, ub.y) < 8) {
                bullets.splice(i, 1);
                ufoBullets.splice(j, 1);
                spawnExplosion(ub.x, ub.y, 3);
                break;
            }
        }
    }

    // UFO Bullet–Asteroid Collision
    for (let i = ufoBullets.length - 1; i >= 0; i--) {
        for (let j = asteroids.length - 1; j >= 0; j--) {
            const b = ufoBullets[i]; const a = asteroids[j];
            if (!b || !a) continue;
            if (dist(b.x, b.y, a.x, a.y) < a.radius) {
                ufoBullets.splice(i, 1);
                splitAsteroid(a, j);
                break;
            }
        }
    }

    // Ship–Asteroid Collisions
    if (ship.alive && invincibleTimer <= 0) {
        for (let j = asteroids.length - 1; j >= 0; j--) {
            if (dist(ship.x, ship.y, asteroids[j].x, asteroids[j].y) < asteroids[j].radius + ship.radius) {
                killShip(); break;
            }
        }
    }

    // Ship–UFO Collision
    if (ship.alive && invincibleTimer <= 0 && ufo) {
        if (dist(ship.x, ship.y, ufo.x, ufo.y) < ufo.radius + ship.radius) {
            spawnExplosion(ufo.x, ufo.y, 12);
            sfxUFOExplosion();
            destroyUFO(true);
            killShip();
        }
    }

    // UFO Bullet–Ship Collision
    if (ship.alive && invincibleTimer <= 0) {
        for (let i = ufoBullets.length - 1; i >= 0; i--) {
            if (dist(ufoBullets[i].x, ufoBullets[i].y, ship.x, ship.y) < ship.radius + 4) {
                ufoBullets.splice(i, 1);
                killShip(); break;
            }
        }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Splash Rings
    for (let i = splashRings.length - 1; i >= 0; i--) {
        const r = splashRings[i];
        r.life -= dt;
        r.radius = r.maxRadius * (1 - r.life / r.maxLife);
        if (r.life <= 0) splashRings.splice(i, 1);
    }

    // Next Wave
    if (asteroids.length === 0 && ship.alive && !ufo && ufoBullets.length === 0) {
        spawnWave();
    }
}

// ── Name Entry Logic ──────────────────────────────────────────
function handleNameEntry() {
    const e = lastKeyDown;
    lastKeyDown = null;
    if (!e) return;
    const code = e.code;
    const key = e.key;

    if (code === "Backspace") {
        if (entryName.length > 0) { entryName.pop(); sfxNameEntry(); }
        return;
    }
    if (code === "Enter" && entryName.length > 0) {
        while (entryName.length < NAME_LENGTH) entryName.push(" ");
        const playerName = entryName.join("");
        const shipName = SHIP_TYPES[selectedShip].name;
        // Optimistic local update — instant feedback
        highscores = insertHighscore(playerName, score, wave, highscores, shipName);
        playSound(1000, 0.15, "square", 0.12);
        setTimeout(() => playSound(1200, 0.15, "square", 0.12), 100);
        setTimeout(() => playSound(1500, 0.2, "square", 0.12), 200);
        state = "scores";
        // Submit to global leaderboard in background
        submitScore(playerName, score, wave, shipName);
        return;
    }
    if (entryName.length < NAME_LENGTH && key.length === 1 && /[a-zA-Z]/.test(key)) {
        entryName.push(key.toUpperCase());
        sfxNameEntry();
    }
}

// ── Shared Logic ──────────────────────────────────────────────
function splitAsteroid(a, index) {
    spawnExplosion(a.x, a.y, a.size === "large" ? PARTICLE_COUNT : a.size === "medium" ? 8 : 5);
    if (a.size === "large") {
        sfxExplosionLarge();
        asteroids.push(createAsteroid(a.x, a.y, "medium"));
        asteroids.push(createAsteroid(a.x, a.y, "medium"));
    } else if (a.size === "medium") {
        sfxExplosionMedium();
        asteroids.push(createAsteroid(a.x, a.y, "small"));
        asteroids.push(createAsteroid(a.x, a.y, "small"));
    } else {
        sfxExplosionSmall();
    }
    asteroids.splice(index, 1);
}

function killShip() {
    ship.alive = false;
    lives--;
    respawnTimer = 2;
    sfxDeath();
    spawnExplosion(ship.x, ship.y, 20);
}

function destroyUFO(exploded) {
    stopUFOHum();
    ufo = null;
    const interval = Math.max(UFO_SPAWN_INTERVAL_MIN, UFO_SPAWN_INTERVAL_BASE - (wave - 1) * 0.8);
    ufoSpawnTimer = interval * (0.6 + Math.random() * 0.4);
}

function fireUFOBullet() {
    if (!ufo || !ship.alive) return;
    let angle;
    if (ufo.type === "large") {
        angle = Math.random() * Math.PI * 2;
    } else {
        angle = Math.atan2(ship.y - ufo.y, ship.x - ufo.x);
        angle += (Math.random() - 0.5) * Math.max(0.05, 0.3 - wave * 0.02);
    }
    ufoBullets.push({
        x: ufo.x, y: ufo.y,
        vx: Math.cos(angle) * UFO_BULLET_SPEED,
        vy: Math.sin(angle) * UFO_BULLET_SPEED,
        life: shipBulletLife * 1.2,
    });
    sfxUFOShoot();
}

// ── Draw ──────────────────────────────────────────────────────
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state === "start") { drawBackgroundAsteroids(); drawTitleScreen(); return; }
    if (state === "scores") { drawBackgroundAsteroids(); drawScoresScreen(); return; }
    if (state === "shipselect") { drawBackgroundAsteroids(); drawShipSelectScreen(); return; }
    if (state === "entername") { drawNameEntryScreen(); return; }

    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.5;

    if (ship.alive) {
        if (invincibleTimer <= 0 || Math.floor(invincibleTimer * 8) % 2 === 0) {
            drawShipAt(ship.x, ship.y, ship.angle, SHIP_SIZE, selectedShip, true);
        }
    }

    for (const b of bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
    }

    ctx.lineWidth = 1.5;
    for (const a of asteroids) drawAsteroid(a);
    if (ufo) drawUFO(ufo);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    for (const b of ufoBullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
        ctx.stroke();
    }

    for (const p of particles) {
        ctx.fillStyle = `rgba(255,255,255,${p.life / p.maxLife})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    // Splash rings
    for (const r of splashRings) {
        const alpha = r.life / r.maxLife;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 2 * alpha;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.fillStyle = "#fff";
    drawHUD();
    if (waveBannerTimer > 0) drawWaveBanner();
    if (state === "gameover") drawGameOver();
}

function drawBackgroundAsteroids() {
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    for (const a of asteroids) drawAsteroid(a);
}

// ── Ship Drawing (3 types) ────────────────────────────────────
function drawShipAt(x, y, angle, size, typeIdx, showFlame) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;

    if (typeIdx === 0) drawShipWave(size);
    else if (typeIdx === 1) drawShipInterstellar(size);
    else drawShipTerminator(size);

    // Thrust flame
    if (showFlame && (keys["ArrowUp"] || keys["KeyW"])) {
        const flicker = 0.6 + Math.random() * 0.4;
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, -size * 0.2);
        ctx.lineTo(-size * (0.7 + 0.4 * flicker), 0);
        ctx.lineTo(-size * 0.4, size * 0.2);
        ctx.stroke();
    }
    ctx.restore();
}

function drawShipWave(s) {
    // Manta ray — swept curves
    ctx.beginPath();
    ctx.moveTo(s, 0);
    // Upper wing — curved
    ctx.quadraticCurveTo(s * 0.2, -s * 0.3, -s * 0.8, -s * 0.7);
    ctx.lineTo(-s * 0.5, -s * 0.25);
    ctx.lineTo(-s * 0.35, 0);
    // Lower wing — curved
    ctx.lineTo(-s * 0.5, s * 0.25);
    ctx.lineTo(-s * 0.8, s * 0.7);
    ctx.quadraticCurveTo(s * 0.2, s * 0.3, s, 0);
    ctx.closePath();
    ctx.stroke();
}

function drawShipInterstellar(s) {
    // Sleek needle/arrow
    ctx.beginPath();
    ctx.moveTo(s * 1.1, 0);
    ctx.lineTo(-s * 0.2, -s * 0.2);
    ctx.lineTo(-s * 0.6, -s * 0.5);
    ctx.lineTo(-s * 0.45, -s * 0.15);
    ctx.lineTo(-s * 0.7, 0);
    ctx.lineTo(-s * 0.45, s * 0.15);
    ctx.lineTo(-s * 0.6, s * 0.5);
    ctx.lineTo(-s * 0.2, s * 0.2);
    ctx.closePath();
    ctx.stroke();
}

function drawShipTerminator(s) {
    // Heavy angular gunship
    ctx.beginPath();
    ctx.moveTo(s * 0.8, 0);
    ctx.lineTo(s * 0.2, -s * 0.2);
    ctx.lineTo(-s * 0.1, -s * 0.2);
    ctx.lineTo(-s * 0.3, -s * 0.65);
    ctx.lineTo(-s * 0.7, -s * 0.65);
    ctx.lineTo(-s * 0.5, -s * 0.2);
    ctx.lineTo(-s * 0.6, 0);
    ctx.lineTo(-s * 0.5, s * 0.2);
    ctx.lineTo(-s * 0.7, s * 0.65);
    ctx.lineTo(-s * 0.3, s * 0.65);
    ctx.lineTo(-s * 0.1, s * 0.2);
    ctx.lineTo(s * 0.2, s * 0.2);
    ctx.closePath();
    ctx.stroke();
    // Center line detail
    ctx.beginPath();
    ctx.moveTo(s * 0.2, 0);
    ctx.lineTo(-s * 0.5, 0);
    ctx.stroke();
}

function drawShipMiniIcon(x, y, typeIdx) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    if (typeIdx === 0) drawShipWave(8);
    else if (typeIdx === 1) drawShipInterstellar(8);
    else drawShipTerminator(8);
    ctx.restore();
}

function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rotAngle);
    ctx.beginPath();
    ctx.moveTo(a.verts[0].x, a.verts[0].y);
    for (let i = 1; i < a.verts.length; i++) ctx.lineTo(a.verts[i].x, a.verts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

function drawUFO(u) {
    const s = u.size;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, -s * 0.15);
    ctx.lineTo(-s * 0.15, -s * 0.45);
    ctx.lineTo(s * 0.15, -s * 0.45);
    ctx.lineTo(s * 0.35, -s * 0.15);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.35, s * 0.2);
    ctx.lineTo(-s * 0.35, s * 0.2);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.stroke();
    ctx.restore();
}

// ── HUD ───────────────────────────────────────────────────────
function drawHUD() {
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = "24px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(score.toString().padStart(6, "0"), 20, 40);

    ctx.textAlign = "center";
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("HI " + getTopScore(highscores).toString().padStart(6, "0"), canvas.width / 2, 40);

    ctx.textAlign = "right";
    ctx.fillText("WAVE " + wave, canvas.width - 20, 40);

    // Lives as ship icons matching selected ship
    for (let i = 0; i < lives; i++) {
        drawShipMiniIcon(30 + i * 25, 65, selectedShip);
    }
    ctx.restore();
}

// ── Ship Select Screen ────────────────────────────────────────
function drawShipSelectScreen() {
    ctx.save();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 36px 'Courier New', monospace";
    ctx.fillText("CHOOSE YOUR SHIP", cx, cy - 200);

    const colW = 220;
    const totalW = 3 * colW;
    const startX = cx - totalW / 2 + colW / 2;

    for (let i = 0; i < 3; i++) {
        const t = SHIP_TYPES[i];
        const colX = startX + i * colW;
        const isSelected = i === selectedShip;

        // Selection highlight
        if (isSelected) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.strokeRect(colX - colW / 2 + 10, cy - 160, colW - 20, 340);
        }

        // Ship number
        ctx.fillStyle = isSelected ? "#fff" : "rgba(255,255,255,0.4)";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText("[" + (i + 1) + "]", colX, cy - 140);

        // Ship name
        ctx.fillStyle = isSelected ? "#fff" : "rgba(255,255,255,0.5)";
        ctx.font = (isSelected ? "bold " : "") + "18px 'Courier New', monospace";
        ctx.fillText(t.name, colX, cy - 118);

        // Ship preview
        const previewSize = 30;
        drawShipAt(colX, cy - 65, -Math.PI / 2, previewSize, i, false);

        // Stat bars
        const barY = cy - 20;
        const barW = 100;
        const barH = 8;
        const stats = [
            { label: "SPD", val: t.speed },
            { label: "ATK", val: t.attack },
            { label: "RNG", val: t.range },
        ];

        for (let s = 0; s < stats.length; s++) {
            const sy = barY + s * 30;
            ctx.fillStyle = isSelected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)";
            ctx.font = "12px 'Courier New', monospace";
            ctx.textAlign = "right";
            ctx.fillText(stats[s].label, colX - barW / 2 - 5, sy + barH - 1);

            // Bar background
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(colX - barW / 2, sy, barW, barH);

            // Bar fill
            ctx.fillStyle = isSelected ? "#fff" : "rgba(255,255,255,0.5)";
            ctx.fillRect(colX - barW / 2, sy, barW * (stats[s].val / 10), barH);

            // Value
            ctx.textAlign = "left";
            ctx.fillStyle = isSelected ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)";
            ctx.fillText(stats[s].val + "/10", colX + barW / 2 + 5, sy + barH - 1);
        }

        ctx.textAlign = "center";

        // Description / special
        ctx.fillStyle = isSelected ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)";
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText(t.desc, colX, cy + 100);

        // Splash icon for Terminator
        if (t.special === "splash" && isSelected) {
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(colX, cy + 125, 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(colX, cy + 125, 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font = "10px 'Courier New', monospace";
            ctx.fillText("EXPLOSIVE", colX, cy + 148);
        }
    }

    // Controls hint
    ctx.textAlign = "center";
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("LEFT/RIGHT or 1/2/3 to select  |  SPACE to confirm  |  ESC to go back", cx, cy + 180);

    ctx.restore();
}

// ── Wave Banner ───────────────────────────────────────────────
function drawWaveBanner() {
    const t = waveBannerTimer / WAVE_BANNER_DURATION;
    let alpha;
    if (t > 0.85) alpha = (1 - t) / 0.15;
    else if (t < 0.2) alpha = t / 0.2;
    else alpha = 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 48px 'Courier New', monospace";
    ctx.fillText("WAVE " + wave, canvas.width / 2, canvas.height / 2 - 20);
    if (wave > 1) {
        ctx.font = "18px 'Courier New', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("Speed x" + speedMultiplier.toFixed(1), canvas.width / 2, canvas.height / 2 + 20);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// ── Title Screen ──────────────────────────────────────────────
function drawTitleScreen() {
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.font = "bold 64px 'Courier New', monospace";
    ctx.fillText("ASTEROIDS", cx, cy - 100);

    ctx.font = "18px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("ARROWS or WASD to move  |  SPACE to shoot", cx, cy - 45);

    if (leaderboardLoading && highscores.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText("LOADING GLOBAL SCORES...", cx, cy + 20);
    }

    if (highscores.length > 0) {
        ctx.font = "16px 'Courier New', monospace";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        const label = leaderboardError ? "── TOP SCORES (OFFLINE) ──" : "── GLOBAL TOP SCORES ──";
        ctx.fillText(label, cx, cy + 5);
        const show = Math.min(5, highscores.length);
        for (let i = 0; i < show; i++) {
            const e = highscores[i];
            const rank = (i + 1).toString().padStart(2, " ");
            const name = e.name.padEnd(NAME_LENGTH, " ");
            const sc = e.score.toString().padStart(7, " ");
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.font = "15px 'Courier New', monospace";
            ctx.fillText(`${rank}. ${name}  ${sc}`, cx, cy + 30 + i * 22);
        }
        if (highscores.length > 5) {
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.font = "14px 'Courier New', monospace";
            ctx.fillText("Press H for full leaderboard", cx, cy + 30 + show * 22 + 8);
        }
    }

    const promptY = highscores.length > 0
        ? cy + 30 + Math.min(5, highscores.length) * 22 + 40
        : cy + 30;

    if (Math.floor(Date.now() / 600) % 2 === 0) {
        ctx.fillStyle = "#fff";
        ctx.font = "22px 'Courier New', monospace";
        ctx.fillText("PRESS SPACE OR ENTER TO START", cx, promptY);
    }

    if (highscores.length <= 5 && highscores.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText("Press H for full leaderboard", cx, promptY + 28);
    }
    ctx.restore();
}

function drawScoresScreen() {
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    const cx = canvas.width / 2;
    let y = canvas.height / 2 - 180;

    ctx.font = "bold 36px 'Courier New', monospace";
    const title = leaderboardError ? "HIGH SCORES (OFFLINE)" : "GLOBAL HIGH SCORES";
    ctx.fillText(title, cx, y);
    y += 20;

    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("RANK  NAME    SCORE    WAVE  SHIP", cx, y += 25);
    ctx.fillText("─".repeat(38), cx, y += 18);

    if (highscores.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "16px 'Courier New', monospace";
        ctx.fillText(leaderboardLoading ? "Loading..." : "No scores yet. Play a game!", cx, y += 40);
    } else {
        for (let i = 0; i < highscores.length; i++) {
            const e = highscores[i];
            const rank = (i + 1).toString().padStart(2, " ");
            const name = e.name.padEnd(NAME_LENGTH, " ");
            const sc = e.score.toString().padStart(7, " ");
            const wv = (e.wave || "?").toString().padStart(3, " ");
            const sh = (e.ship || "").substring(0, 4).padEnd(4, " ");
            if (i === 0) { ctx.fillStyle = "#fff"; ctx.font = "bold 17px 'Courier New', monospace"; }
            else { ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "16px 'Courier New', monospace"; }
            ctx.fillText(`${rank}.  ${name}  ${sc}    W${wv}  ${sh}`, cx, y += 28);
        }
        for (let i = highscores.length; i < MAX_HIGHSCORES; i++) {
            const rank = (i + 1).toString().padStart(2, " ");
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.font = "16px 'Courier New', monospace";
            ctx.fillText(`${rank}.  -----  -------    W  -  ----`, cx, y += 28);
        }
    }

    y += 30;
    if (Math.floor(Date.now() / 600) % 2 === 0) {
        ctx.fillStyle = "#fff";
        ctx.font = "18px 'Courier New', monospace";
        ctx.fillText("PRESS SPACE OR ESC TO RETURN", cx, y);
    }
    ctx.restore();
}

function drawNameEntryScreen() {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.font = "bold 36px 'Courier New', monospace";
    ctx.fillText("NEW HIGH SCORE!", cx, cy - 100);
    ctx.font = "28px 'Courier New', monospace";
    ctx.fillText(score.toString(), cx, cy - 60);
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("WAVE " + wave + "  |  Speed x" + speedMultiplier.toFixed(1), cx, cy - 32);

    ctx.fillStyle = "#fff";
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillText("ENTER YOUR NAME", cx, cy + 10);

    const slotW = 36, slotH = 44;
    const totalW = NAME_LENGTH * slotW + (NAME_LENGTH - 1) * 8;
    const startX = cx - totalW / 2;
    const slotY = cy + 35;

    ctx.font = "bold 30px 'Courier New', monospace";
    ctx.textAlign = "center";

    for (let i = 0; i < NAME_LENGTH; i++) {
        const sx = startX + i * (slotW + 8);
        const isActive = i === entryName.length;
        const isFilled = i < entryName.length;

        if (isActive) {
            const show = Math.floor(entryCursorBlink * 3) % 2 === 0;
            ctx.strokeStyle = show ? "#fff" : "rgba(255,255,255,0.3)";
            ctx.lineWidth = 2;
        } else if (isFilled) {
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
        } else {
            ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
        }
        ctx.beginPath();
        ctx.moveTo(sx, slotY + slotH);
        ctx.lineTo(sx + slotW, slotY + slotH);
        ctx.stroke();

        if (isFilled) {
            ctx.fillStyle = "#fff";
            ctx.fillText(entryName[i], sx + slotW / 2, slotY + slotH - 8);
        }
    }

    ctx.textAlign = "center";
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("TYPE A-Z  |  BACKSPACE to delete  |  ENTER to confirm", cx, slotY + slotH + 40);
    ctx.restore();
}

function drawGameOver() {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 52px 'Courier New', monospace";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = "22px 'Courier New', monospace";
    ctx.fillText("SCORE: " + score, canvas.width / 2, canvas.height / 2 + 10);
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("WAVE " + wave + "  |  Speed x" + speedMultiplier.toFixed(1), canvas.width / 2, canvas.height / 2 + 40);
    if (Math.floor(Date.now() / 600) % 2 === 0) {
        ctx.fillStyle = "#fff";
        ctx.font = "18px 'Courier New', monospace";
        ctx.fillText("PRESS SPACE OR ENTER TO CONTINUE", canvas.width / 2, canvas.height / 2 + 85);
    }
    ctx.restore();
}

// ── Title Screen Init ─────────────────────────────────────────
function initTitleScreen() {
    state = "start";
    ship = createShip();
    asteroids = [];
    bullets = [];
    particles = [];
    splashRings = [];
    ufoBullets = [];
    ufo = null;
    speedMultiplier = 1.0;
    selectedShip = 0;
    stopUFOHum();
    for (let i = 0; i < 6; i++) {
        asteroids.push(createAsteroid(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
            "large"
        ));
    }
    fetchLeaderboard();
}

// ── Game Loop ─────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

initTitleScreen();
requestAnimationFrame((t) => { lastTime = t; gameLoop(t); });
