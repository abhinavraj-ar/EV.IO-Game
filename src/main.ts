// =====================================================
// START SCREEN / USERNAME
// =====================================================

const startScreen = document.getElementById("start-screen") as HTMLDivElement;
const usernameInput = document.getElementById("username-input") as HTMLInputElement;
const playButton = document.getElementById("play-btn") as HTMLButtonElement;
const usernameError = document.getElementById("username-error") as HTMLParagraphElement;

let playerUsername = "";

playButton.addEventListener("click", startGame);

usernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        startGame();
    }
});

function startGame() {

    const username = usernameInput.value.trim();

    if (username.length === 0) {
        usernameError.textContent = "Please enter a username";
        usernameInput.focus();
        return;
    }

    if (username.length < 2) {
        usernameError.textContent = "Username must be at least 2 characters";
        usernameInput.focus();
        return;
    }

   playerUsername = username;

// Save using the key that network.ts already uses
localStorage.setItem("ev_player_name", playerUsername);

startScreen.style.display = "none";

// Start the game
startGameEngine();
}


// =====================================================
// GAME IMPORTS
// =====================================================

import {
    Engine,
    Scene,
    Vector3,
    HavokPlugin
} from "@babylonjs/core";

import HavokPhysics from "@babylonjs/havok";

import { createEnvironment } from "./environment";
import { setupPlayer } from "./player";
import { initNetwork } from "./network";


// =====================================================
// ENGINE
// =====================================================

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

const engine = new Engine(canvas, true);


// =====================================================
// DEATH SCREEN
// =====================================================

const deathScreen =
    document.getElementById("death-screen") as HTMLDivElement;

if (deathScreen) {
    deathScreen.style.display = "none";
}


// =====================================================
// CREATE SCENE
// =====================================================

const createScene = async () => {

    const scene = new Scene(engine);

    scene.gravity = new Vector3(0, -0.15, 0);

    scene.collisionsEnabled = true;

    const havokInstance = await HavokPhysics();

    const hk = new HavokPlugin(
        true,
        havokInstance
    );

    scene.enablePhysics(
        new Vector3(0, -9.81, 0),
        hk
    );

    createEnvironment(scene);

    setupPlayer(scene, canvas);

    initNetwork(scene);

    return scene;
};


// =====================================================
// START GAME
// =====================================================

function startGameEngine() {

    createScene().then((scene) => {

        engine.runRenderLoop(() => {
            scene.render();
        });

        engine.resize();

    });

}


// =====================================================
// RESIZE
// =====================================================

window.addEventListener("resize", () => {
    engine.resize();
});

if (window.visualViewport) {

    window.visualViewport.addEventListener(
        "resize",
        () => {
            engine.resize();
        }
    );

}

window.addEventListener("orientationchange", () => {

    setTimeout(() => {
        engine.resize();
    }, 150);

});