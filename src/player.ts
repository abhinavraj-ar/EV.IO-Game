import { Scene, UniversalCamera, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";

export function setupPlayer(scene: Scene, canvas: HTMLCanvasElement) {
    //Setup Camera & Spawn Point
    const spawnPoint = new Vector3(0, 10, 0); 
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
    
    camera.applyGravity = true; 
    camera.checkCollisions = true;
    
    //Create a tall, thin collision bubble
    camera.ellipsoid = new Vector3(0.5, 1, 0.5);
    camera.ellipsoidOffset = new Vector3(0, 1, 0);
    
    // The Gravity Fix
    (camera as any)._needMoveForGravity = false; 

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
            
            // Teleport back to spawn
            camera.position = spawnPoint.clone();
            camera.cameraDirection = new Vector3(0, 0, 0);
            
            isDead = false;
        });
    }

    // 5. Jump & Falling Logic
    let isJumping = false;
    
    scene.onBeforeRenderObservable.add(() => {
        if (isDead) return; // Freeze game logic while dead
        
        if (camera.position.y <= 1.1) {
            isJumping = false;
        }
        
        // Falling off the map
        if (camera.position.y < -10) {
            takeDamage(100); 
        }
    });

    window.addEventListener("keydown", (e) => {
        if (isDead) return; // Prevent jumping/testing damage while dead

        if (e.code === "Space" && !isJumping) {
            isJumping = true;
            camera.cameraDirection.y += 2; 
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