const express   = require("express");
const http      = require("http");
const cors      = require("cors");
const { Server } = require("socket.io");

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PORT       = process.env.PORT || 3001;
const MAX_HEALTH = 100;
const SPAWN_POSITIONS = [
    { x: 0,   y: 2, z: 0   },
    { x: 5,   y: 2, z: 5   },
    { x: -5,  y: 2, z: 5   },
    { x: 5,   y: 2, z: -5  },
    { x: -5,  y: 2, z: -5  },
    { x: 10,  y: 2, z: 0   },
    { x: -10, y: 2, z: 0   },
    { x: 0,   y: 2, z: 10  },
    { x: 0,   y: 2, z: -10 },
];

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
/**
 * @type {Map<string, {
 *   id: string,
 *   name: string,
 *   x: number, y: number, z: number,
 *   rotY: number,
 *   health: number,
 *   isDead: boolean,
 *   kills: number,
 *   deaths: number
 * }>}
 */
const players = new Map();
let spawnIndex = 0;

const POINTS_PER_KILL = 10;

const KILLS_TO_WIN = 5;


function getNextSpawn() {
    const pos = SPAWN_POSITIONS[spawnIndex % SPAWN_POSITIONS.length];
    spawnIndex++;
    return { ...pos };
}

/** Broadcast the current leaderboard to all connected clients. */
function broadcastLeaderboard() {
    const entries = Array.from(players.values())
        .map(({ id, name, kills, deaths }) => ({
            id,
            name,
            kills,
            deaths,
            points: kills * POINTS_PER_KILL,
        }))
        .sort((a, b) => b.points - a.points);

    io.emit("leaderboard:update", { entries });
}

function createPlayerState(id, name) {
    const spawn = getNextSpawn();
    return {
        id,
        name,
        x:      spawn.x,
        y:      spawn.y,
        z:      spawn.z,
        rotY:   0,
        health: MAX_HEALTH,
        isDead: false,
        kills:  0,
        deaths: 0,
    };
}

// ─────────────────────────────────────────────
// Server Setup
// ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Simple health-check endpoint
app.get("/", (req, res) => {
    res.json({
        status:  "ok",
        players: players.size,
        uptime:  process.uptime().toFixed(1) + "s",
    });
});

// Kill feed / leaderboard endpoint
app.get("/leaderboard", (req, res) => {
    const board = Array.from(players.values())
        .map(({ id, name, kills, deaths }) => ({
            id,
            name,
            kills,
            deaths,
            points: kills * POINTS_PER_KILL,
        }))
        .sort((a, b) => b.points - a.points);
    res.json(board);
});

const io = new Server(server, {
    cors: {
        origin: "*",          // Allow the Vite dev server (any origin in dev)
        methods: ["GET", "POST"],
    },
});

// ─────────────────────────────────────────────
// Socket.io Event Handlers
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
    const id = socket.id;
    console.log(`[+] Player connected: ${id}  (total: ${players.size + 1})`);

    // Read and sanitize the display name sent in the socket.io auth handshake
    const rawName  = socket.handshake.auth?.name ?? "";
    const safeName = String(rawName).replace(/[<>&"']/g, "").trim().slice(0, 18);
    const name     = safeName || `Player${Math.floor(Math.random() * 9999)}`;

    // Build state for new player
    const state = createPlayerState(id, name);
    players.set(id, state);

    // 1. Send the new player their own ID + snapshot of all current players
    socket.emit("init", {
        id,
        players: Object.fromEntries(players),
    });

    // 2. Tell everyone else about the new player
    socket.broadcast.emit("player:joined", { id, state });

    // 3. Send the fresh leaderboard to everyone (new player appears with 0 kills)
    broadcastLeaderboard();

    // ── player:move ──────────────────────────────────────
    socket.on("player:move", (data) => {
        const player = players.get(id);
        if (!player || player.isDead) return;

        // Basic server-side sanity clamp (prevent teleporting)
        const MAX_DELTA = 5;
        const dx = Math.abs(data.x - player.x);
        const dz = Math.abs(data.z - player.z);
        if (dx > MAX_DELTA || dz > MAX_DELTA) {
            // Suspicious movement — snap player back
            socket.emit("player:moved", { id, ...player });
            return;
        }

        player.x    = data.x;
        player.y    = data.y;
        player.z    = data.z;
        player.rotY = data.rotY;

        // Relay to everyone except the sender
        socket.broadcast.emit("player:moved", {
            id,
            x:    player.x,
            y:    player.y,
            z:    player.z,
            rotY: player.rotY,
        });
    });

    // ── player:shoot ─────────────────────────────────────
    socket.on("player:shoot", (data) => {
        const player = players.get(id);
        if (!player || player.isDead) return;

        socket.broadcast.emit("player:shot", {
            id,
            dirX: data.dirX,
            dirY: data.dirY,
            dirZ: data.dirZ,
        });
    });

    // ── player:hit ───────────────────────────────────────
    socket.on("player:hit", (data) => {
        const attacker = players.get(id);
        const target   = players.get(data.targetId);
        if (!attacker || attacker.isDead) return;
    

        if (!target   || target.isDead)   return;

        const damage = Math.min(Math.max(Number(data.damage) || 10, 1), 50); // clamp 1-50
        target.health = Math.max(0, target.health - damage);

        // Notify the target (and everyone else) of the health change
        io.emit("player:damaged", {
            id:         target.id,
            health:     target.health,
            attackerId: id,
        });



if (target.health <= 0 && !target.isDead) {
    target.isDead = true;
    target.deaths++;
    attacker.kills++;

    console.log(
        `[!] ${attacker.name} killed ${target.name} | ` +
        `K:${attacker.kills} (${attacker.kills * POINTS_PER_KILL}pts)`
    );

    // Tell everyone that the player died
    io.emit("player:died", {
        id: target.id,
        killerId: attacker.id,
    });

    // IMPORTANT: update leaderboard after EVERY kill
    broadcastLeaderboard();

    // Check whether this kill wins the match
    if (attacker.kills >= KILLS_TO_WIN) {
        // console.log(`[🏆] ${attacker.name} WON THE MATCH!`);


        console.log(
    `[🏆] ${attacker.name} WON THE MATCH with ${attacker.kills * POINTS_PER_KILL} POINTS!`
);

        io.emit("match:ended", {
            winnerId: attacker.id,
            winnerName: attacker.name,
        });

        return;
    }

    // Respawn after 3 seconds
    setTimeout(() => {
        if (!players.has(target.id)) return;

        const spawn = getNextSpawn();

        target.x = spawn.x;
        target.y = spawn.y;
        target.z = spawn.z;
        target.health = MAX_HEALTH;
        target.isDead = false;

        io.emit("player:respawned", {
            id: target.id,
            x: target.x,
            y: target.y,
            z: target.z,
            health: target.health,
        });

        console.log(`[~] ${target.name} respawned`);
    }, 3000);
}

});

    // ── player:respawn (manual) ───────────────────────────
    socket.on("player:respawn", () => {
        const player = players.get(id);
        if (!player) return;

        const spawn   = getNextSpawn();
        player.x      = spawn.x;
        player.y      = spawn.y;
        player.z      = spawn.z;
        player.health = MAX_HEALTH;
        player.isDead = false;

        io.emit("player:respawned", {
            id,
            x:      player.x,
            y:      player.y,
            z:      player.z,
            health: player.health,
        });
    });

    // ── disconnect 
    socket.on("disconnect", (reason) => {
        players.delete(id);
        io.emit("player:left", { id });
        console.log(`[-] Player disconnected: ${id}  reason=${reason}  (total: ${players.size})`);
        
        broadcastLeaderboard();
    });
});


// Start

server.listen(PORT, () => {
    console.log(`\n🎮  ev.io multiplayer server running on http://localhost:${PORT}`);
    console.log(`    Health check : GET /`);
    console.log(`    Leaderboard  : GET /leaderboard\n`);
});
