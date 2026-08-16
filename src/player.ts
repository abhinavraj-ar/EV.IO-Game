import { Scene, UniversalCamera, Vector3, MeshBuilder, StandardMaterial, Color3 ,} from "@babylonjs/core";
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
    _isMobile,
    isMobileDevice,
    setupMobileControls,
    getMobileInput,
    resetFrameInput,
} from "./mobile-controls";

// Expose the camera so network.ts can read position if needed
let _camera: UniversalCamera;


const gunFireSound = new Audio("/sounds/gun-fire.wav");
gunFireSound.volume = 0.7;



export function getCamera(): UniversalCamera { return _camera; }

export function setupPlayer(scene: Scene, canvas: HTMLCanvasElement) {
    
    const isMobile = isMobileDevice();

    

    //Setup Camera & Spawn Point
    const spawnPoint = new Vector3(0, 2, 0); // just above ground
    const camera = new UniversalCamera("playerCamera", spawnPoint.clone(), scene);



    

    camera.setTarget(new Vector3(0, 0, 10)); 
    camera.attachControl(canvas, true);
    _camera = camera;
    
    //Physics & Controls Setup
    camera.keysUp.push(87);    // W
    camera.keysDown.push(83);  // S
    camera.keysLeft.push(65);  // A
    camera.keysRight.push(68); // D
    camera.speed = 0.4;
    // Lower angular sensitivity on desktop; mobile look is manual
    camera.angularSensibility = isMobile ? 9999999 : 2500; // effectively disable built-in mouse look on mobile

    // applyGravity=true lets BabylonJS handle floor collision via scene.gravity.
    // We intercept the cameraDirection each frame to add our own jump arc on top.
    camera.applyGravity = true;
    camera.checkCollisions = true;

    //Create a tall, thin collision bubble
    camera.ellipsoid = new Vector3(0.5, 1, 0.5);
    camera.ellipsoidOffset = new Vector3(0, 1, 0);

    //The Gun Model
    const gun = MeshBuilder.CreateBox("gun", { width: 0.2, height: 0.2, depth: 1 }, scene);
    const gunMat = new StandardMaterial("gunMat", scene);
    gunMat.diffuseColor = new Color3(0.2, 0.8, 0.2); 
    gun.material = gunMat;
    gun.parent = camera; 
    gun.position = new Vector3(0.5, -0.4, 1);
    gun.isPickable = false; // Prevent shooting yourself

    //Health & Death System
    let maxHealth = 100;
    let currentHealth = maxHealth;
    let isDead = false; // Tracks if the player is currently waiting to respawn
    let matchEnded = false;

const healthFill = document.getElementById("health-fill") as HTMLDivElement;
const healthText = document.getElementById("health-text") as HTMLSpanElement;
const deathScreen = document.getElementById("death-screen") as HTMLDivElement;
const winScreen = document.getElementById("win-screen") as HTMLDivElement;
    const respawnBtn  = document.getElementById("respawn-btn")  as HTMLButtonElement;
    const leaderboardEl = document.getElementById("leaderboard-list") as HTMLOListElement;
    const deathWinnerList = document.getElementById("death-winner-list") as HTMLDivElement;

    function updateHealthUI() {
    const percentage = Math.max(0, (currentHealth / maxHealth) * 100);

    if (healthFill) {
        healthFill.style.width = percentage + "%";

        if (percentage > 60) {
            healthFill.style.backgroundColor = "green";
        } else if (percentage > 30) {
            healthFill.style.backgroundColor = "yellow";
        } else {
            healthFill.style.backgroundColor = "red";
        }
    }

    if (healthText) {
        healthText.textContent = Math.round(percentage) + "%";
    }
}
    

    // ── Called by network.ts when the server says we took damage ──────────────
    onDamaged((health: number, _attackerId: string) => {
        if (isDead) return;
        currentHealth = health;

        if (currentHealth <= 0) {
            currentHealth = 0;
            isDead = true;
            if (deathScreen) deathScreen.style.display = "flex";
            if (!isMobile) {
                document.exitPointerLock = document.exitPointerLock || (document as any).webkitExitPointerLock;
                if (document.exitPointerLock) document.exitPointerLock();
            }
        }
        updateHealthUI();
    });

    // ── Called by network.ts when the server confirms our death 
    onDied((_killerId: string) => {
        if (isDead) return;
        isDead = true;
        currentHealth = 0;
        updateHealthUI();
        if (deathScreen) deathScreen.style.display = "flex";
        if (!isMobile) {
            document.exitPointerLock = document.exitPointerLock || (document as any).webkitExitPointerLock;
            if (document.exitPointerLock) document.exitPointerLock();
        }
    });

//     onMatchEnded((winnerId: string, winnerName: string) => {
//     const myId = getMyId();

//     matchEnded = true;

//     if (winnerId === myId) {
//         if (winScreen) {
//             winScreen.style.display = "flex";
//             winScreen.innerText = "🏆 YOU WIN!";
//         }
//     } else {
//         if (winScreen) {
//             winScreen.style.display = "flex";
//             winScreen.innerText = `💀 ${winnerName} WINS!`;
//         }
//     }

//     isDead = true;

//     if (!isMobile) {
//         document.exitPointerLock?.();
//     }
// });



onMatchEnded((winnerId: string, winnerName: string) => {
    const myId = getMyId();

    matchEnded = true;
    isDead = true;

    const resultIcon = document.getElementById("match-result-icon");
    const resultTitle = document.getElementById("match-result-title");
    const resultWinner = document.getElementById("match-result-winner");

    if (winScreen) {
        winScreen.style.display = "flex";
    }

    if (winnerId === myId) {
        // 🏆 WE WON
        if (resultIcon) {
            resultIcon.innerText = "🏆";
        }

        if (resultTitle) {
            resultTitle.innerText = "YOU WIN!";
        }

        if (resultWinner) {
            resultWinner.innerText = `Winner: ${winnerName}`;
        }
    } else {
        // 💀 WE LOST
        if (resultIcon) {
            resultIcon.innerText = "💀";
        }

        if (resultTitle) {
            resultTitle.innerText = "YOU LOSE!";
        }

        if (resultWinner) {
            resultWinner.innerText = `Winner: ${winnerName}`;
        }
    }

    if (!isMobile) {
        document.exitPointerLock?.();
    }
});

    // ── Called by network.ts when the server respawns us ─────────────────────
    onRespawned((x: number, y: number, z: number) => {
        currentHealth = maxHealth;
        updateHealthUI();
        isDead = false;
        if (deathScreen) deathScreen.style.display = "none";
        camera.position = new Vector3(x, y, z);
        if (matchEnded) return;
        camera.cameraDirection = new Vector3(0, 0, 0);
        canJump   = true;
        hasPeaked = false;
    });

    // ── Called by network.ts when the leaderboard changes ───────────────────
    // ── Leaderboard ─────────────────────────────────────────────────────────
onLeaderboard((entries: LeaderboardEntry[]) => {

    // ============================================================
    // NORMAL GAME LEADERBOARD
    // ============================================================

    if (leaderboardEl) {

        leaderboardEl.innerHTML = entries.map((e, i) => {

            const isMe = e.id === getMyId();

            const medal =
                i === 0 ? "🥇" :
                i === 1 ? "🥈" :
                i === 2 ? "🥉" :
                `${i + 1}.`;

            const displayName =
                isMe
                    ? `YOU (${getLocalPlayerName()})`
                    : e.name;

            return `
                <li class="lb-row${isMe ? " lb-me" : ""}">

                    <span class="lb-rank">
                        ${medal}
                    </span>

                    <span class="lb-name">
                        ${displayName}
                    </span>

                    <span class="lb-kills">
                        ${e.kills}K
                    </span>

                    <span class="lb-pts">
                        ${e.points}pts
                    </span>

                </li>
            `;
        }).join("");
    }


    // ============================================================
    // WINNER LIST ON DEATH SCREEN
    // ============================================================

    if (deathWinnerList) {

        // Show only TOP 3 players
        const winners = entries.slice(0, 3);

        deathWinnerList.innerHTML = winners.map((e, i) => {

            const isMe = e.id === getMyId();

            const medal =
                i === 0 ? "🥇" :
                i === 1 ? "🥈" :
                "🥉";

            const position =
                i === 0 ? "1ST" :
                i === 1 ? "2ND" :
                "3RD";

            const displayName =
                isMe
                    ? `YOU (${getLocalPlayerName()})`
                    : e.name;

            return `
                <div class="death-winner-row">

                    <div class="winner-position">
                        ${medal}
                    </div>

                    <div class="winner-info">

                        <div class="winner-name">
                            ${displayName}
                        </div>

                        <div class="winner-stats">
                            ${e.kills} Kills
                            &nbsp; • &nbsp;
                            ${e.points} Points
                        </div>

                    </div>

                    <div class="winner-place">
                        ${position}
                    </div>

                </div>
            `;

        }).join("");
    }
});

    // Local damage (e.g. fall damage) — also tells the server via player:hit
    function takeDamageLocal(amount: number) {
        if (isDead) return;
        currentHealth -= amount;
        if (currentHealth < 0) currentHealth = 0;
        updateHealthUI();

        if (currentHealth <= 0) {
            isDead = true;
            if (deathScreen) deathScreen.style.display = "flex";
            if (!isMobile) {
                document.exitPointerLock = document.exitPointerLock || (document as any).webkitExitPointerLock;
                if (document.exitPointerLock) document.exitPointerLock();
            }
        }
    }

    //Respawn Button Logic
    if (respawnBtn) {
        respawnBtn.addEventListener("click", () => {
            if (matchEnded) return;
            // Tell the server to respawn us — it will reply with player:respawned
            sendRespawn();

            // Also handle local fallback (in case server is unreachable)
            deathScreen.style.display = "none";
            currentHealth = maxHealth;
            updateHealthUI();
            camera.position = spawnPoint.clone();
            camera.cameraDirection = new Vector3(0, 0, 0);
            canJump   = true;
            hasPeaked = false;
            isDead    = false;
        });
    }

   

    const JUMP_FORCE = 2; // single upward impulse injected into cameraDirection.y
    let canJump   = true;     // whether the player is allowed to jump
    let hasPeaked = false;    // true once the player has visibly started falling
    let prevY = spawnPoint.y;

    // ── Mobile setup ─────────────────────────────────────────────────────────
    setupMobileControls();

    scene.onBeforeRenderObservable.add(() => {
        if (isDead) return;

        const currentY = camera.position.y;
        const deltaY   = currentY - prevY;
        prevY = currentY;

        if (!canJump) {
            // Phase A: detect the falling portion of the arc
            if (!hasPeaked && deltaY < -0.02) {
                hasPeaked = true;
            }
            // Phase B: once genuinely falling, detect landing (fall stops)
            if (hasPeaked && deltaY >= -0.005) {
                canJump   = true;
                hasPeaked = false;
            }
        }

        // Fell off the map
        if (camera.position.y < -10) {
            takeDamageLocal(100);
        }

        // ── Mobile joystick movement ──────────────────────────────────────────
        if (isMobile) {
            const mob = getMobileInput();

            // Apply look rotation
            if (mob.lookDX !== 0 || mob.lookDY !== 0) {
                camera.rotation.y += mob.lookDX;
                camera.rotation.x += mob.lookDY;
                // Clamp vertical look
                camera.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, camera.rotation.x));
            }

            // Apply joystick movement (local-space, relative to camera yaw)
            if (mob.moveX !== 0 || mob.moveZ !== 0) {
                const yaw = camera.rotation.y;
                const speed = camera.speed;
                const fwdX  = Math.sin(yaw) * mob.moveZ * speed;
                const fwdZ  = Math.cos(yaw) * mob.moveZ * speed;
                const strX  = Math.cos(yaw) * mob.moveX * speed;
                const strZ  =-Math.sin(yaw) * mob.moveX * speed;
                camera.cameraDirection.x += fwdX + strX;
                camera.cameraDirection.z += fwdZ + strZ;
            }

            // Jump
            if (mob.jumpPressed && canJump) {
                canJump   = false;
                hasPeaked = false;
                camera.cameraDirection.y = JUMP_FORCE;
            }

            // Shoot
            if (mob.shootPressed) {
                shoot(scene, canvas);
            }

            resetFrameInput();
        }

        // ── Send position to server every frame (network.ts throttles to 20Hz) ──
        sendMove(
            camera.position.x,
            camera.position.y,
            camera.position.z,
            camera.rotation.y,
        );
    });

    // ── Desktop keyboard controls ─────────────────────────────────────────────
    window.addEventListener("keydown", (e) => {
        if (isDead) return;

        if (e.code === "Space" && canJump) {
            canJump   = false;
            hasPeaked = false;
            // Single impulse — BabylonJS gravity + inertia handles the rest
            camera.cameraDirection.y = JUMP_FORCE;
        }

        // Press 'H' to test local damage
        if (e.code === "KeyH") {
            takeDamageLocal(15);
        }
    });

    // ── Desktop Pointer Lock & Shooting ───────────────────────────────────────
    if (!isMobile) {
        canvas.addEventListener("click", () => {
            if (isDead) return; // Prevent shooting and locking mouse while dead

            if (document.pointerLockElement !== canvas) {
                canvas.requestPointerLock = canvas.requestPointerLock || (canvas as any).webkitRequestPointerLock;
                if (canvas.requestPointerLock) {
                    canvas.requestPointerLock();
                }
            } else {
                shoot(scene, canvas);
            }
        });
    }

    return camera;
}

//Raycast Shooting Mechanic
function shoot(scene: Scene, canvas: HTMLCanvasElement) {
    // playGunFireSound();

    gunFireSound.currentTime = 0;
    gunFireSound.play().catch((error) => {
        console.error("Gun sound error:", error);
    });


    

    const pickInfo = scene.pick(canvas.width / 2, canvas.height / 2);

    if (pickInfo.hit && pickInfo.pickedMesh) {
        const meshName = pickInfo.pickedMesh.name;
        console.log("Hit: " + meshName);

        // ── Hit a remote player ───────────────────────────────────────────────
        const remoteId = getRemotePlayerIdFromMesh(meshName);
        if (remoteId) {
            // 10 damage per shot — server validates and clamps
            sendHit(remoteId, 10);
            // Emit the shot direction for bullet-trail effects
            const dir = pickInfo.ray?.direction;
            if (dir) sendShoot(dir.x, dir.y, dir.z);
            return;
        }

        // ── Hit a crate ───────────────────────────────────────────────────────
        if (meshName.startsWith("crate") && pickInfo.pickedMesh.material) {
            const mat = pickInfo.pickedMesh.material as StandardMaterial;
            const originalColor = mat.diffuseColor;
            
            mat.diffuseColor = new Color3(1, 1, 1); 
            
            setTimeout(() => { 
                mat.diffuseColor = originalColor; 
            }, 100);
        }

        // Emit shot direction regardless of what was hit
        const dir = pickInfo.ray?.direction;
        if (dir) sendShoot(dir.x, dir.y, dir.z);
    }
}