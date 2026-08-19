

import { io, Socket } from "socket.io-client";
import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    Mesh,
    DynamicTexture,
    TransformNode,
    AnimationGroup,
} from "@babylonjs/core";
import {
    createCharacterInstance,
    createGunInstance,
} from "./assetManager";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface PlayerState {
    id:     string;
    name:   string; // Display name chosen by the client
    x:      number;
    y:      number;
    z:      number;
    rotY:   number;
    health: number;
    isDead: boolean;
    kills:  number;
    deaths: number;
}

export interface LeaderboardEntry {
    id:     string;
    name:   string;
    kills:  number;
    deaths: number;
    points: number;
}

interface RemotePlayer {
    state:      PlayerState;
    root:       TransformNode;
    hitCapsule: Mesh;
    label:      Mesh;       // Floating name plane
    labelTex:   DynamicTexture;
    walkAnim:   AnimationGroup | null;
    lastPos:    Vector3;
}

const _rawUrl   = import.meta.env.VITE_SERVER_URL as string | undefined;
const SERVER_URL = (_rawUrl && _rawUrl.length > 0) ? _rawUrl : "http://localhost:3001";

if (!_rawUrl || _rawUrl.length === 0) {
    console.warn(
        "[NET] ⚠️  VITE_SERVER_URL is not set!\n" +
        "    Multiplayer will only work on localhost.\n" +
        "    Add VITE_SERVER_URL as a GitHub Secret pointing to your Railway server.",
    );
}

const MOVE_SEND_RATE_MS = 50;  // Send position ~20 times/sec

// ─────────────────────────────────────────────
// Player Name — persisted in localStorage
// ─────────────────────────────────────────────
const ADJECTIVES = ["Swift","Bold","Rogue","Shadow","Storm","Iron","Neon","Dark","Cyber","Ghost",
                    "Ultra","Steel","Blaze","Void","Hyper","Toxic","Nova","Ace","Grim","Apex"];
const NOUNS      = ["Wolf","Hawk","Fox","Blade","Viper","Knight","Sniper","Reaper","Hunter","Ghost",
                    "Ranger","Titan","Wraith","Phantom","Raven","Bullet","Cobra","Eagle","Shark","Bear"];

function generateRandomName(): string {
    const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun  = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num   = Math.floor(Math.random() * 99) + 1;
    return `${adj}${noun}${num}`;
}

/** Returns this player's display name, creating and persisting one if needed. */
export function getLocalPlayerName(): string {
    let name = localStorage.getItem("ev_player_name");
    if (!name || name.trim() === "") {
        name = generateRandomName();
        localStorage.setItem("ev_player_name", name);
    }
    return name;
}

let socket: Socket;
let scene:  Scene;
let myId:   string = "";

/** All remote players keyed by socket ID */
const remotePlayers = new Map<string, RemotePlayer>();



type OnDamagedCb     = (health: number, attackerId: string) => void;
type OnDiedCb        = (killerId: string) => void;
type OnRespawnedCb   = (x: number, y: number, z: number) => void;
type OnLeaderboardCb = (entries: LeaderboardEntry[]) => void;
type OnMatchEndedCb  = (winnerId: string, winnerName: string) => void;

let onDamagedCb:     OnDamagedCb     | null = null;
let onDiedCb:        OnDiedCb        | null = null;
let onRespawnedCb:   OnRespawnedCb   | null = null;
let onLeaderboardCb: OnLeaderboardCb | null = null;
let onMatchEndedCb:  OnMatchEndedCb  | null = null;


// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/** Boot the network layer. Call once after the BabylonJS scene is ready. */
export function initNetwork(babylonScene: Scene) {
    scene  = babylonScene;
    // Pass the display name to the server via the auth handshake so it's
    // available from the very first connection event — no extra round-trip needed.
    socket = io(SERVER_URL, {
        transports: ["websocket"],
        auth: { name: getLocalPlayerName() },
    });

    socket.on("connect",    () => console.log(`[NET] Connected  id=${socket.id}  name=${getLocalPlayerName()}`));
    socket.on("disconnect", () => console.log("[NET] Disconnected"));

    socket.on("init",              handleInit);
    socket.on("player:joined",     handlePlayerJoined);
    socket.on("player:left",       handlePlayerLeft);
    socket.on("player:moved",      handlePlayerMoved);
    socket.on("player:damaged",    handlePlayerDamaged);
    socket.on("player:died",       handlePlayerDied);

    socket.on("match:ended", (data) => {
    console.log("🏆 MATCH ENDED");
    console.log("Winner ID:", data.winnerId);
    console.log("Winner Name:", data.winnerName);

    onMatchEndedCb?.(data.winnerId, data.winnerName);
});

    socket.on("player:respawned",  handlePlayerRespawned);
    socket.on("leaderboard:update", handleLeaderboardUpdate);
}

/** Call this every frame (or on a timer) with the local player's current position. */
let _lastSendTime = 0;
export function sendMove(x: number, y: number, z: number, rotY: number) {
    const now = performance.now();
    if (now - _lastSendTime < MOVE_SEND_RATE_MS) return;
    _lastSendTime = now;
    socket?.emit("player:move", { x, y, z, rotY });
}

/** Emit a shot event so other clients can see the bullet direction. */
export function sendShoot(dirX: number, dirY: number, dirZ: number) {
    socket?.emit("player:shoot", { dirX, dirY, dirZ });
}

/** Tell the server that we hit a remote player. */
export function sendHit(targetId: string, damage: number) {
    socket?.emit("player:hit", { targetId, damage });
}

/** Tell the server we are respawning (manual respawn button). */
export function sendRespawn() {
    socket?.emit("player:respawn");
}

/** Register a callback for when OUR player takes damage. */
export function onDamaged(cb: OnDamagedCb)   { onDamagedCb  = cb; }

/** Register a callback for when OUR player dies. */
export function onDied(cb: OnDiedCb)          { onDiedCb     = cb; }

export function onMatchEnded(cb: OnMatchEndedCb) {
    onMatchEndedCb = cb;
}



/** Register a callback for when OUR player respawns (server-authoritative). */
export function onRespawned(cb: OnRespawnedCb) { onRespawnedCb = cb; }

/** Register a callback for leaderboard updates. */
export function onLeaderboard(cb: OnLeaderboardCb) { onLeaderboardCb = cb; }

/** Returns true if the mesh name encodes a remote player socket ID. */
export function getRemotePlayerIdFromMesh(meshName: string): string | null {
    // Remote player body meshes are named  "rp_body_<socketId>"
    if (meshName.startsWith("rp_body_")) return meshName.slice(8);
    return null;
}

/** Expose our own socket ID so player.ts can read it. */
export function getMyId(): string { return myId; }

// ─────────────────────────────────────────────
// Server → Client handlers
// ─────────────────────────────────────────────

function handleInit(data: { id: string; players: Record<string, PlayerState> }) {
    myId = data.id;
    console.log(`[NET] Init — my id=${myId}, ${Object.keys(data.players).length} player(s) online`);

    for (const [id, state] of Object.entries(data.players)) {
        if (id !== myId) spawnRemotePlayer(id, state);
    }
}

function handlePlayerJoined(data: { id: string; state: PlayerState }) {
    if (data.id === myId) return;
    console.log(`[NET] Player joined: ${data.id}`);
    spawnRemotePlayer(data.id, data.state);
}

function handlePlayerLeft(data: { id: string }) {
    console.log(`[NET] Player left: ${data.id}`);
    despawnRemotePlayer(data.id);
}

function handlePlayerMoved(data: { id: string; x: number; y: number; z: number; rotY: number }) {
    if (data.id === myId) return;
    const rp = remotePlayers.get(data.id);
    if (!rp) return;

    const targetPos      = new Vector3(data.x, data.y - 0.9, data.z);
    const targetLabelPos = new Vector3(data.x, data.y + 2.2, data.z);
    const targetCapsPos  = new Vector3(data.x, data.y,       data.z); // world-space capsule centre

    // Walk animation (speed 1.2 matching local player)
    const isMoving = Vector3.DistanceSquared(targetPos, rp.lastPos) > 0.001;
    rp.lastPos.copyFrom(targetPos);

    if (rp.walkAnim) {
        if (isMoving) {
            if (!rp.walkAnim.isPlaying) rp.walkAnim.start(true, 1.2);
        } else {
            if (rp.walkAnim.isPlaying) rp.walkAnim.pause();
        }
    }

    // Lerp character root, label, and hit capsule together
    rp.root.position       = Vector3.Lerp(rp.root.position,       targetPos,      0.3);
    rp.label.position      = Vector3.Lerp(rp.label.position,      targetLabelPos, 0.3);
    rp.hitCapsule.position = Vector3.Lerp(rp.hitCapsule.position, targetCapsPos,  0.3);
    rp.root.rotation.y     = data.rotY;

    rp.state.x    = data.x;
    rp.state.y    = data.y;
    rp.state.z    = data.z;
    rp.state.rotY = data.rotY;
}

function handlePlayerDamaged(data: { id: string; health: number; attackerId: string }) {
    if (data.id === myId) {
        // This is OUR player taking damage — notify player.ts
        onDamagedCb?.(data.health, data.attackerId);
    } else {
        // Visual feedback: flash the remote player red
        const rp = remotePlayers.get(data.id);
        if (rp) flashMesh(rp.hitCapsule);
    }
}

function handlePlayerDied(data: { id: string; killerId: string }) {
    if (data.id === myId) {
        onDiedCb?.(data.killerId);
    } else {
        const rp = remotePlayers.get(data.id);
        if (rp) {
            rp.root.setEnabled(false);
            rp.label.isVisible = false;
            if (rp.walkAnim?.isPlaying) rp.walkAnim.pause();
            rp.state.isDead = true;
        }
    }
}

function handleLeaderboardUpdate(data: { entries: LeaderboardEntry[] }) {
    onLeaderboardCb?.(data.entries);
}

function handlePlayerRespawned(data: { id: string; x: number; y: number; z: number; health: number }) {
    if (data.id === myId) {
        onRespawnedCb?.(data.x, data.y, data.z);
    } else {
        const rp = remotePlayers.get(data.id);
        if (rp) {
            rp.root.position = new Vector3(data.x, data.y - 0.9, data.z);
            rp.label.position = new Vector3(data.x, data.y + 2.2, data.z);
            rp.root.setEnabled(true);
            rp.label.isVisible = true;
            rp.state.health = data.health;
            rp.state.isDead = false;
        }
    }
}

// ─────────────────────────────────────────────
// Mesh helpers
// ─────────────────────────────────────────────

/**
 * Deterministically map a socket ID to a unique, vibrant Color3.
 * Uses a simple djb2-style hash → HSL with high saturation & mid lightness
 * so colors are always vivid and distinguishable, never black/white/grey.
 */
function idToColor(id: string): Color3 {
    // Hash the string into a 32-bit integer
    let hash = 5381;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) + hash) ^ id.charCodeAt(i);
        hash = hash >>> 0; // keep unsigned 32-bit
    }

    // Spread hue evenly around the wheel, lock saturation & lightness for vividness
    const hue        = (hash % 360 + 360) % 360;          // 0-359
    const saturation = 70 + (hash % 20);                  // 70-89 %
    const lightness  = 45 + ((hash >> 8) % 15);           // 45-59 %

    // Convert HSL → RGB (0-1 range for BabylonJS Color3)
    const s = saturation / 100;
    const l = lightness  / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if      (hue < 60)  { r = c; g = x; b = 0; }
    else if (hue < 120) { r = x; g = c; b = 0; }
    else if (hue < 180) { r = 0; g = c; b = x; }
    else if (hue < 240) { r = 0; g = x; b = c; }
    else if (hue < 300) { r = x; g = 0; b = c; }
    else                { r = c; g = 0; b = x; }

    return new Color3(r + m, g + m, b + m);
}

/**
 * Create a GLB character instance + gun + invisible hit capsule + floating name label.
 * Body hit capsule is named "rp_body_<socketId>" so raycast hits can identify targets.
 */
function spawnRemotePlayer(id: string, state: PlayerState) {
    if (remotePlayers.has(id)) return;

    const playerColor = idToColor(id);

    // Instantiate GLB character (proper Mesh clones — always visible)
    const { root, meshes: charMeshes, walkAnim, weaponBone, charScale } =
        createCharacterInstance(scene, `rp_${id}`);

    root.position.set(state.x, state.y - 0.9, state.z);
    root.rotation.y = state.rotY;

    // Guarantee the hierarchy is enabled & every mesh is visible
    root.setEnabled(true);
    charMeshes.forEach(m => {
        m.isVisible  = true;
        m.isPickable = false;
    });

    // Hit capsule — create as a SIBLING of root (not child), so its position
    // is in world space and is not affected by root.scaling = charScale.
    const hitCapsule = MeshBuilder.CreateCapsule(`rp_body_${id}`, { height: 1.8, radius: 0.45 }, scene);
    hitCapsule.isVisible  = false;
    hitCapsule.isPickable = true;
    // Position is driven every frame in handlePlayerMoved via the root lerp;
    // set an initial world position here.
    hitCapsule.position.set(state.x, state.y, state.z);

    // GLB gun — scale relative to charScale
    const { root: gunRoot } = createGunInstance(scene, `rp_gun_${id}`);
    const rpGunScale = charScale * 18;
    gunRoot.scaling.setAll(rpGunScale);

    if (weaponBone) {
        gunRoot.parent = weaponBone;
        gunRoot.position.set(0, 0, 0);
        gunRoot.rotation.set(0, 0, 0); // gun GLB already faces forward
    } else {
        // Fallback offset in the wrapper's LOCAL space
        gunRoot.parent = root;
        gunRoot.position.set(
            0.35 / charScale,
            1.05 / charScale,
            0.25 / charScale,
        );
        gunRoot.rotation.set(0, 0, 0); // gun GLB already faces forward
    }

    // If player was already dead when we connected, hide immediately
    if (state.isDead) {
        root.setEnabled(false);
    }

    // Floating name label
    const labelPlane = MeshBuilder.CreatePlane(`rp_label_${id}`, { width: 2, height: 0.5 }, scene);
    labelPlane.position    = new Vector3(state.x, state.y + 2.2, state.z);
    labelPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    labelPlane.isPickable  = false;
    labelPlane.isVisible   = !state.isDead;

    const labelTex = new DynamicTexture(`rp_label_tex_${id}`, { width: 256, height: 64 }, scene, false);
    labelTex.hasAlpha = true;
    drawNameLabel(labelTex, state.name || id.slice(0, 8), playerColor);

    const labelMat = new StandardMaterial(`rp_label_mat_${id}`, scene);
    labelMat.diffuseTexture   = labelTex;
    labelMat.emissiveColor    = new Color3(1, 1, 1);
    labelMat.backFaceCulling  = false;
    labelPlane.material       = labelMat;

    remotePlayers.set(id, {
        state,
        root,
        hitCapsule,
        label:    labelPlane,
        labelTex,
        walkAnim,
        lastPos: new Vector3(state.x, state.y - 0.9, state.z),
    });

    console.log(`[NET] Spawned remote player: ${id} (charScale=${charScale.toFixed(4)})`);
}

function despawnRemotePlayer(id: string) {
    const rp = remotePlayers.get(id);
    if (!rp) return;
    rp.root.dispose();
    rp.label.dispose();
    rp.labelTex.dispose();
    remotePlayers.delete(id);
}

function drawNameLabel(tex: DynamicTexture, name: string, color?: Color3) {
    // BabylonJS returns ICanvasRenderingContext — cast to native API for full access
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 64);

    // Rounded-rect helper (roundRect not in BabylonJS ICanvasRenderingContext types)
    function roundedRect(x: number, y: number, w: number, h: number, r: number) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y,     x + w, y + r,     r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x,     y + h, x,     y + h - r, r);
        ctx.lineTo(x,     y + r);
        ctx.arcTo(x,     y,     x + r, y,          r);
        ctx.closePath();
    }

    // Background pill
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundedRect(4, 4, 248, 56, 12);
    ctx.fill();

    // Colored border matching the player's body color
    if (color) {
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth = 3;
        roundedRect(4, 4, 248, 56, 12);
        ctx.stroke();
    }

    // Name text
    ctx.fillStyle    = "#ffffff";
    ctx.font         = "bold 24px Arial";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 128, 32);
    tex.update();
}

/** Flash a mesh to white briefly to indicate a hit. */
function flashMesh(mesh: Mesh) {
    const mat = mesh.material as StandardMaterial;
    if (!mat) return;
    const original = mat.diffuseColor.clone();
    mat.diffuseColor = new Color3(1, 1, 1);
    setTimeout(() => { mat.diffuseColor = original; }, 100);
}
