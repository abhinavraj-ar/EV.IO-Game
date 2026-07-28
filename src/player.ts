import { Scene, UniversalCamera, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";

export function setupPlayer(scene: Scene, canvas: HTMLCanvasElement) {
    //Setup Camera & Spawn Point
    const spawnPoint = new Vector3(0, 2, 0); // just above ground
    const camera = new UniversalCamera("playerCamera", spawnPoint.clone(), scene);
    camera.setTarget(new Vector3(0, 0, 10)); 
    camera.attachControl(canvas, true);
    
    //Physics & Controls Setup
    camera.keysUp.push(87);    // W
    camera.keysDown.push(83);  // S
    camera.keysLeft.push(65);  // A
    camera.keysRight.push(68); // D
    camera.speed = 0.4;
    camera.angularSensibility = 2500;

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

    const healthFill = document.getElementById("health-fill") as HTMLDivElement;
    const deathScreen = document.getElementById("death-screen") as HTMLDivElement;
    const respawnBtn = document.getElementById("respawn-btn") as HTMLButtonElement;

    function updateHealthUI() {
        if (healthFill) {
            const percentage = Math.max(0, (currentHealth / maxHealth) * 100);
            healthFill.style.width = percentage + "%";
        }
    }

    function takeDamage(amount: number) {
        if (isDead) return; // Prevent taking damage while already dead

        currentHealth -= amount;
        
        if (currentHealth <= 0) {
            currentHealth = 0;
            isDead = true;
            
            // 1. Show the death screen
            if (deathScreen) deathScreen.style.display = "flex";
            
            // 2. Unlock the mouse so the player can click the button
            document.exitPointerLock = document.exitPointerLock || (document as any).webkitExitPointerLock;
            if (document.exitPointerLock) document.exitPointerLock();
        }
        updateHealthUI();
    }

    //Respawn Button Logic
    if (respawnBtn) {
        respawnBtn.addEventListener("click", () => {
            // Hide the death screen
            deathScreen.style.display = "none";
            
            // Reset health
            currentHealth = maxHealth;
            updateHealthUI();
            
            // Teleport back to spawn and reset vertical physics
            camera.position = spawnPoint.clone();
            camera.cameraDirection = new Vector3(0, 0, 0);
            canJump = true;
            hasPeaked = false;

            isDead = false;
        });
    }

    // Jump & Landing Detection
    //
    // How it works:
    //   1. On Space, we do ONE single set: camera.cameraDirection.y = JUMP_FORCE.
    //      BabylonJS inertia + scene.gravity naturally arcs the player up then back down.
    //      We never touch cameraDirection.y again until the next jump.
    //
    //   2. Landing uses a two-phase check so the apex (deltaY ≈ 0) can't fool it:
    //      Phase A — hasPeaked: wait until the player is genuinely falling (deltaY < -0.02).
    //      Phase B — once hasPeaked, landing is when the fall stops (deltaY >= -0.005).
    //      Only after both phases do we set canJump = true again.

    const JUMP_FORCE = 2; // single upward impulse injected into cameraDirection.y
    let canJump  = true;     // whether the player is allowed to jump
    let hasPeaked = false;   // true once the player has visibly started falling
    let prevY = spawnPoint.y;

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
            takeDamage(100);
        }
    });

    window.addEventListener("keydown", (e) => {
        if (isDead) return;

        if (e.code === "Space" && canJump) {
            canJump   = false;
            hasPeaked = false;
            // Single impulse — BabylonJS gravity + inertia handles the rest
            camera.cameraDirection.y = JUMP_FORCE;
        }

        // Press 'H' to test damage
        if (e.code === "KeyH") {
            takeDamage(15);
        }
    });

    //Pointer Lock & Shooting
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

    return camera;
}

//Raycast Shooting Mechanic
function shoot(scene: Scene, canvas: HTMLCanvasElement) {
    const pickInfo = scene.pick(canvas.width / 2, canvas.height / 2);

    if (pickInfo.hit && pickInfo.pickedMesh) {
        console.log("Hit: " + pickInfo.pickedMesh.name);
        
        if (pickInfo.pickedMesh.name.startsWith("crate") && pickInfo.pickedMesh.material) {
            const mat = pickInfo.pickedMesh.material as StandardMaterial;
            const originalColor = mat.diffuseColor;
            
            mat.diffuseColor = new Color3(1, 1, 1); 
            
            setTimeout(() => { 
                mat.diffuseColor = originalColor; 
            }, 100);
        }
    }
}