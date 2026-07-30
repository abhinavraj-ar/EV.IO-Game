import { Engine, Scene, Vector3, HavokPlugin } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok"; // Import Havok
import { createEnvironment } from "./environment";
import { setupPlayer } from "./player";
import { initNetwork } from "./network";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

// Changed to async
const createScene = async () => {
    const scene = new Scene(engine);
    scene.gravity = new Vector3(0, -0.15, 0);
    scene.collisionsEnabled = true;

    // Initialize Havok Physics
    const havokInstance = await HavokPhysics();
    const hk = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), hk); // Earth gravity

    createEnvironment(scene);
    setupPlayer(scene, canvas);

    // Boot multiplayer networking — must be after setupPlayer so callbacks are registered
    initNetwork(scene);

    return scene;
};

// Use .then() because createScene is now async
createScene().then((scene) => {
    engine.runRenderLoop(() => {
        scene.render();
    });
});

window.addEventListener("resize", () => {
    engine.resize();
});