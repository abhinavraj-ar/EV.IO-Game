import { Scene, Vector3, HemisphericLight, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";

export function createEnvironment(scene: Scene) {
    // 1. Basic lighting
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // 2. Create the Ground (Floor)
    const ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
    const groundMat = new StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new Color3(0.2, 0.2, 0.2); // Dark grey
    ground.material = groundMat;
    ground.checkCollisions = true;

    // 3. Create static walls
    for (let i = 0; i < 4; i++) {
        const wall = MeshBuilder.CreateBox("wall_" + i, { width: 8, height: 4, depth: 2 }, scene);
        wall.position = new Vector3((i * 10) - 15, 2, 10);
        wall.checkCollisions = true;
    }

    // 4. Create randomly scattered solid crates
    for (let i = 0; i < 20; i++) {
        const box = MeshBuilder.CreateBox("crate_" + i, { size: 2 }, scene);
        
        const randomX = (Math.random() - 0.5) * 80;
        const randomZ = (Math.random() - 0.5) * 80;
        
        box.position = new Vector3(randomX, 1, randomZ); 
        
        const boxMat = new StandardMaterial("boxMat", scene);
        boxMat.diffuseColor = new Color3(0.8, 0.2, 0.2); // Red crates
        box.material = boxMat;
        box.checkCollisions = true;
    }
}