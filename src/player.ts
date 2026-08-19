import {
    Scene,
    UniversalCamera,
    Vector3,
    StandardMaterial,
    Color3,
} from "@babylonjs/core";
import {
    createCharacterInstance,
} from "./assetManager";
import {
    sendMove,
    sendShoot,
    sendHit,
    sendRespawn,
    onDamaged,
    onDied,
    onRespawned,
    onLeaderboard,
    getRemotePlayerIdFromMesh,
    getMyId,
    onMatchEnded,
    getLocalPlayerName,
    type LeaderboardEntry,
} from "./network";
import {
    isMobileDevice,
    setupMobileControls,
    getMobileInput,
    resetFrameInput,
} from "./mobile-controls";

// ── Module-level camera reference (consumed by network.ts if needed) ─────────
let _camera: UniversalCamera;
export function getCamera(): UniversalCamera { return _camera; }

// ── Sounds ───────────────────────────────────────────────────────────────────
const gunFireSound    = new Audio("/sounds/gun-fire.wav");
gunFireSound.volume   = 0.7;

const backgroundSound  = new Audio("/sounds/background.mp3");
backgroundSound.loop   = true;
backgroundSound.volume = 0.25;

// =============================================================================
// SETUP PLAYER
// =============================================================================
export function setupPlayer(scene: Scene, canvas: HTMLCanvasElement) {

    const isMobile = isMobileDevice();

    backgroundSound.play().catch(err => console.error("Background sound:", err));

    // ── Camera / Spawn ────────────────────────────────────────────────────────
    const spawnPoint = new Vector3(0, 1, 0);
    const camera     = new UniversalCamera("playerCamera", spawnPoint.clone(), scene);
    camera.setTarget(new Vector3(0, 0, 10));
    camera.attachControl(canvas, true);
    _camera = camera;

    // ── Movement keys ─────────────────────────────────────────────────────────
    camera.keysUp.push(87);    // W
    camera.keysDown.push(83);  // S
    camera.keysLeft.push(65);  // A
    camera.keysRight.push(68); // D
    camera.speed = 0.4;
    camera.angularSensibility = isMobile ? 9_999_999 : 2500;

    // ── Physics ───────────────────────────────────────────────────────────────
    camera.applyGravity    = true;
    camera.checkCollisions = true;
    camera.ellipsoid       = new Vector3(0.5, 1, 0.5);
    camera.ellipsoidOffset = new Vector3(0, 1, 0);

    // =========================================================================
    // LOCAL PLAYER CHARACTER (GLB)
    // The mesh stays invisible in first-person, but the skeleton/animation
    // is still driven so that remote players see correct leg movement via the
    // position + walkAnim state broadcast over the network.
    // =========================================================================
    const {
        root:     localPlayerRoot,
        meshes:   localPlayerMeshes,
        walkAnim: localWalkAnim,
    } = createCharacterInstance(scene, "local_player");

    // Hide local character from its own camera (first-person)
    localPlayerMeshes.forEach(m => {
        m.isPickable      = false;
        m.checkCollisions = false;
        m.isVisible       = false;
    });

    // Local player gun is intentionally NOT shown — the player plays in
    // first-person and should not see a floating gun in their own view.
    // Enemy guns are still visible via network.ts (attached to remote characters).

    // =========================================================================
    // HEALTH & DEATH
    // =========================================================================
    const maxHealth  = 100;
    let currentHealth = maxHealth;
    let isDead        = false;
    let matchEnded    = false;

    const healthFill    = document.getElementById("health-fill")    as HTMLDivElement;
    const healthText    = document.getElementById("health-text")     as HTMLSpanElement;
    const deathScreen   = document.getElementById("death-screen")   as HTMLDivElement;
    const winScreen     = document.getElementById("win-screen")      as HTMLDivElement;
    const respawnBtn    = document.getElementById("respawn-btn")     as HTMLButtonElement;
    const leaderboardEl = document.getElementById("leaderboard-list") as HTMLOListElement;
    const deathWinnerList = document.getElementById("death-winner-list") as HTMLDivElement;

    function updateHealthUI() {
        const pct = Math.max(0, (currentHealth / maxHealth) * 100);
        if (healthFill) {
            healthFill.style.width           = pct + "%";
            healthFill.style.backgroundColor =
                pct > 60 ? "green" : pct > 30 ? "yellow" : "red";
        }
        if (healthText) healthText.textContent = Math.round(pct) + "%";
    }

    function takeDamageLocal(amount: number) {
        if (isDead) return;
        currentHealth = Math.max(0, currentHealth - amount);
        updateHealthUI();
        if (currentHealth <= 0) killLocal();
    }

    function killLocal() {
        isDead = true;
        if (deathScreen) deathScreen.style.display = "flex";
        if (!isMobile) document.exitPointerLock?.();
    }

    // ── Network damage / death / respawn callbacks ────────────────────────────
    onDamaged((health: number, _attackerId: string) => {
        if (isDead) return;
        currentHealth = health;
        updateHealthUI();
        if (currentHealth <= 0) killLocal();
    });

    onDied((_killerId: string) => {
        if (isDead) return;
        currentHealth = 0;
        updateHealthUI();
        killLocal();
    });

    onRespawned((x: number, y: number, z: number) => {
        currentHealth = maxHealth;
        updateHealthUI();
        isDead = false;
        if (deathScreen) deathScreen.style.display = "none";
        camera.position = new Vector3(x, y, z);
        if (matchEnded) return;
        camera.cameraDirection = Vector3.Zero();
        canJump  = true;
        hasPeaked = false;
    });

    onMatchEnded((winnerId: string, winnerName: string) => {
        matchEnded = true;
        isDead     = true;
        if (winScreen) winScreen.style.display = "flex";

        const isWinner = winnerId === getMyId();
        const icon   = document.getElementById("match-result-icon");
        const title  = document.getElementById("match-result-title");
        const winner = document.getElementById("match-result-winner");
        if (icon)   icon.innerText   = isWinner ? "🏆" : "💀";
        if (title)  title.innerText  = isWinner ? "YOU WIN!" : "YOU LOSE!";
        if (winner) winner.innerText = `Winner: ${winnerName}`;
        if (!isMobile) document.exitPointerLock?.();
    });

    // ── Leaderboard ───────────────────────────────────────────────────────────
    onLeaderboard((entries: LeaderboardEntry[]) => {
        if (leaderboardEl) {
            leaderboardEl.innerHTML = entries.map((e, i) => {
                const isMe    = e.id === getMyId();
                const medal   = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                const display = isMe ? `YOU (${getLocalPlayerName()})` : e.name;
                return `
                <li class="lb-row${isMe ? " lb-me" : ""}">
                    <span class="lb-rank">${medal}</span>
                    <span class="lb-name">${display}</span>
                    <span class="lb-kills">${e.kills}/5K</span>
                    <span class="lb-pts">${e.points}pts</span>
                </li>`;
            }).join("");
        }

        if (deathWinnerList) {
            deathWinnerList.innerHTML = entries.slice(0, 3).map((e, i) => {
                const isMe    = e.id === getMyId();
                const medal   = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
                const place   = i === 0 ? "1ST" : i === 1 ? "2ND" : "3RD";
                const display = isMe ? `YOU (${getLocalPlayerName()})` : e.name;
                return `
                <div class="death-winner-row">
                    <div class="winner-position">${medal}</div>
                    <div class="winner-info">
                        <div class="winner-name">${display}</div>
                        <div class="winner-stats">${e.kills} Kills &nbsp;•&nbsp; ${e.points} Points</div>
                    </div>
                    <div class="winner-place">${place}</div>
                </div>`;
            }).join("");
        }
    });

    // ── Respawn button ────────────────────────────────────────────────────────
    if (respawnBtn) {
        respawnBtn.addEventListener("click", () => {
            if (matchEnded) return;
            sendRespawn();
            deathScreen.style.display = "none";
            currentHealth             = maxHealth;
            updateHealthUI();
            camera.position           = spawnPoint.clone();
            camera.cameraDirection    = Vector3.Zero();
            canJump  = true;
            hasPeaked = false;
            isDead   = false;
        });
    }

    // =========================================================================
    // JUMP
    // =========================================================================
    const JUMP_FORCE = 2;
    let canJump   = true;
    let hasPeaked = false;
    let prevY     = spawnPoint.y;

    // =========================================================================
    // MOBILE
    // =========================================================================
    setupMobileControls();

    // =========================================================================
    // PER-FRAME LOOP
    // =========================================================================
    const realPlayerPos = new Vector3();
    let   lastAnimPos   = new Vector3();

    // Track walk-anim state with our own boolean.
    // DO NOT rely on localWalkAnim.isPlaying — BabylonJS briefly sets it to
    // false between loop iterations which causes the animation to stutter / stop.
    let isWalkAnim = false;

    scene.onBeforeRenderObservable.add(() => {
        if (isDead) {
            if (isWalkAnim) {
                localWalkAnim?.stop();
                isWalkAnim = false;
            }
            return;
        }

        // ── Capture physics position ──────────────────────────────────────────
        realPlayerPos.copyFrom(camera.position);

        // ── Walk animation — natural right-then-left leg cycle ────────────────
        // We compare positions from the PREVIOUS frame so even slow movement
        // is detected. Threshold is kept tiny (1e-6) to avoid false-stops.
        const isMoving = Vector3.DistanceSquared(realPlayerPos, lastAnimPos) > 1e-6;
        lastAnimPos.copyFrom(realPlayerPos);

        if (localWalkAnim) {
            if (isMoving && !isWalkAnim) {
                // Start fresh — guarantees the loop restarts cleanly.
                // loop=true  speed=1.2  from=first-frame  to=last-frame
                localWalkAnim.start(true, 1.2, localWalkAnim.from, localWalkAnim.to);
                isWalkAnim = true;
            } else if (!isMoving && isWalkAnim) {
                // stop() fully resets the group; prevents it hanging mid-stride.
                localWalkAnim.stop();
                isWalkAnim = false;
            }
        }

        // ── Sync invisible character root with camera (for remote-player view) ─
        localPlayerRoot.position
            .copyFrom(realPlayerPos)
            .addInPlace(new Vector3(0, -0.9, 0));
        localPlayerRoot.rotation.y = camera.rotation.y;

        // ── Jump / fall detection ─────────────────────────────────────────────
        const currentY = realPlayerPos.y;
        const deltaY   = currentY - prevY;
        prevY          = currentY;

        if (!canJump) {
            if (!hasPeaked && deltaY < -0.02)   hasPeaked = true;
            if (hasPeaked  && deltaY >= -0.005) { canJump = true; hasPeaked = false; }
        }

        // Kill on falling off map
        if (realPlayerPos.y < -10) takeDamageLocal(100);

        // ── Mobile joystick & shoot ───────────────────────────────────────────
        if (isMobile) {
            const mob = getMobileInput();

            if (mob.lookDX !== 0 || mob.lookDY !== 0) {
                camera.rotation.y += mob.lookDX;
                camera.rotation.x  = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, camera.rotation.x + mob.lookDY));
            }

            if (mob.moveX !== 0 || mob.moveZ !== 0) {
                const yaw = camera.rotation.y;
                const spd = camera.speed;
                camera.cameraDirection.x += Math.sin(yaw) * mob.moveZ * spd + Math.cos(yaw) * mob.moveX * spd;
                camera.cameraDirection.z += Math.cos(yaw) * mob.moveZ * spd - Math.sin(yaw) * mob.moveX * spd;
            }

            if (mob.jumpPressed && canJump) {
                canJump  = false;
                hasPeaked = false;
                camera.cameraDirection.y = JUMP_FORCE;
            }

            if (mob.shootPressed) shoot(scene, canvas);

            resetFrameInput();
        }

        // ── Network position broadcast ────────────────────────────────────────
        sendMove(realPlayerPos.x, realPlayerPos.y, realPlayerPos.z, camera.rotation.y);
    });

    // =========================================================================
    // KEYBOARD (desktop)
    // =========================================================================
    window.addEventListener("keydown", (e) => {
        if (isDead) return;

        if (e.code === "Space" && canJump) {
            canJump   = false;
            hasPeaked  = false;
            camera.cameraDirection.y = JUMP_FORCE;
        }

        // Debug: H key → take 15 damage
        if (e.code === "KeyH") takeDamageLocal(15);
    });

    // =========================================================================
    // POINTER LOCK & SHOOT (desktop)
    // =========================================================================
    if (!isMobile) {
        canvas.addEventListener("click", () => {
            if (isDead) return;
            if (document.pointerLockElement !== canvas) {
                (canvas.requestPointerLock || (canvas as any).webkitRequestPointerLock)?.call(canvas);
            } else {
                shoot(scene, canvas);
            }
        });
    }

    return camera;
}

// =============================================================================
// RAYCAST SHOOTING
// =============================================================================
function shoot(scene: Scene, canvas: HTMLCanvasElement) {
    gunFireSound.currentTime = 0;
    gunFireSound.play().catch(err => console.error("Gun sound:", err));

    const pick = scene.pick(canvas.width / 2, canvas.height / 2);
    if (!pick.hit || !pick.pickedMesh) return;

    const meshName = pick.pickedMesh.name;
    console.log("Hit:", meshName);

    // Remote player hit
    const remoteId = getRemotePlayerIdFromMesh(meshName);
    if (remoteId) {
        sendHit(remoteId, 10);
        const dir = pick.ray?.direction;
        if (dir) sendShoot(dir.x, dir.y, dir.z);
        return;
    }

    // Crate flash
    if (meshName.startsWith("crate") && pick.pickedMesh.material) {
        const mat = pick.pickedMesh.material as StandardMaterial;
        const orig = mat.diffuseColor.clone();
        mat.diffuseColor = new Color3(1, 1, 1);
        setTimeout(() => { mat.diffuseColor = orig; }, 100);
    }

    const dir = pick.ray?.direction;
    if (dir) sendShoot(dir.x, dir.y, dir.z);
}