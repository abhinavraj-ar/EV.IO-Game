import {
    Scene,
    SceneLoader,
    AssetContainer,
    TransformNode,
    AbstractMesh,
    AnimationGroup,
    Mesh,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

let characterContainer: AssetContainer | null = null;
let gunContainer:       AssetContainer | null = null;

export interface CharacterInstance {
    root:            TransformNode;
    meshes:          AbstractMesh[];
    animationGroups: AnimationGroup[];
    walkAnim:        AnimationGroup | null;
    weaponBone:      TransformNode | null;
    charScale:       number;
}

export interface GunInstance {
    root:   TransformNode;
    meshes: AbstractMesh[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Preload
// ─────────────────────────────────────────────────────────────────────────────
export async function loadGameAssets(scene: Scene): Promise<void> {
    console.log("[ASSETS] Loading character.glb and gun.glb …");
    try {
        const [charCont, gCont] = await Promise.all([
            SceneLoader.LoadAssetContainerAsync("", "/character.glb", scene),
            SceneLoader.LoadAssetContainerAsync("", "/gun.glb", scene),
        ]);
        characterContainer = charCont;
        gunContainer       = gCont;
        console.log("[ASSETS] character.glb + gun.glb loaded ✔");
    } catch (err) {
        console.error("[ASSETS] Failed to load GLB assets:", err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bone search (recursive, multi-keyword)
// ─────────────────────────────────────────────────────────────────────────────
function findBoneNode(
    root: TransformNode,
    keywords: string[],
    logAll = false,
): TransformNode | null {
    const nodes = root.getChildTransformNodes(false /*not only direct*/);

    if (logAll) {
        console.log(
            `[ASSETS] Transform nodes in "${root.name}":\n  ` +
            nodes.map(n => n.name).join("\n  "),
        );
    }

    for (const node of nodes) {
        const lower = node.name.toLowerCase();
        for (const kw of keywords) {
            if (lower.includes(kw.toLowerCase())) return node;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Character instance
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Clones the character GLB from the AssetContainer into the live scene.
 *
 * WHY clone instead of instantiate?
 *   `instantiateModelsToScene` creates InstancedMesh objects whose source mesh
 *   lives inside the AssetContainer (off-scene). BabylonJS does NOT render an
 *   InstancedMesh whose source is not part of the active scene — so all
 *   instances appear invisible.  Cloning produces fully independent Mesh
 *   objects that are always visible.
 */
export function createCharacterInstance(
    scene: Scene,
    instanceName = "character",
): CharacterInstance {
    if (!characterContainer) {
        throw new Error("[ASSETS] characterContainer not loaded — call loadGameAssets first.");
    }

    // ── Clone the whole container into the scene ──────────────────────────────
    // `cloneIncrementallyAsync` is not always available; use synchronous clone.
    const cloned = characterContainer.instantiateModelsToScene(
        (name) => `${instanceName}_${name}`,
        false,                           // doNotInstantiate = false → create real Mesh clones
        { doNotInstantiate: true },      // force Mesh.clone instead of InstancedMesh
    );

    // Wrap everything under a single pivot node
    const wrapper = new TransformNode(`${instanceName}_wrapper`, scene);
    cloned.rootNodes.forEach((node) => { node.parent = wrapper; });

    // ── Make every mesh a proper scene member ─────────────────────────────────
    const meshes: AbstractMesh[] = [];
    wrapper.getChildMeshes(false).forEach((m) => {
        // Convert InstancedMesh → standalone Mesh so it renders without its
        // source being in the active scene.
        // If the mesh is already a regular Mesh, makeGeometryUnique just clones
        // the geometry (which is what we want for independent instances).
        if ((m as any).makeGeometryUnique) (m as Mesh).makeGeometryUnique();

        m.isPickable      = false;
        m.checkCollisions = false;
        m.isVisible       = true;   // explicit — guarantee rendering
        meshes.push(m);
    });

    // ── Enable the hierarchy ──────────────────────────────────────────────────
    wrapper.setEnabled(true);

    // ── Auto-scale to TARGET_HEIGHT metres ───────────────────────────────────
    const TARGET_HEIGHT = 1.8;
    let charScale = 0.01; // safe fallback (cm-scale GLBs)

    if (meshes.length > 0) {
        try {
            meshes.forEach(m => m.refreshBoundingInfo({}));
            let minY =  Infinity;
            let maxY = -Infinity;
            meshes.forEach(m => {
                const bb = m.getBoundingInfo().boundingBox;
                minY = Math.min(minY, bb.minimumWorld.y);
                maxY = Math.max(maxY, bb.maximumWorld.y);
            });
            const h = maxY - minY;
            if (h > 0.001) charScale = TARGET_HEIGHT / h;
        } catch {
            charScale = 0.01;
        }
    }

    wrapper.scaling.setAll(charScale);
    console.log(`[ASSETS] ${instanceName}: charScale=${charScale.toFixed(5)}`);

    // ── Walk / locomotion animation ───────────────────────────────────────────
    console.log(
        `[ASSETS] ${instanceName}: animations →`,
        cloned.animationGroups.map(a => `"${a.name}"`).join(", ") || "(none)",
    );

    const WALK_KW = ["walk", "walking", "locomotion", "run", "move", "stride"];
    let walkAnim: AnimationGroup | null = null;

    cloned.animationGroups.forEach(ag => {
        ag.stop();
        if (!walkAnim) {
            const lower = ag.name.toLowerCase();
            if (WALK_KW.some(kw => lower.includes(kw))) walkAnim = ag;
        }
    });

    // Fallback: take the first group
    if (!walkAnim && cloned.animationGroups.length > 0) {
        walkAnim = cloned.animationGroups[0];
        console.warn(`[ASSETS] ${instanceName}: no walk anim matched — using "${(walkAnim as AnimationGroup).name}"`);
    }

    if (walkAnim) console.log(`[ASSETS] ${instanceName}: walk → "${(walkAnim as AnimationGroup).name}"`);

    // ── Find right-hand weapon bone ───────────────────────────────────────────
    const HAND_KW = [
        "weapon_r", "weapon_right", "weaponright",
        "hand_r", "handr", "hand.r",
        "righthand", "right_hand", "r_hand",
        "mixamorig:righthand",
        "bip001 r hand",
        "gun_attach", "weaponhand",
    ];
    const isLocal  = instanceName.includes("local_player");
    const weaponBone = findBoneNode(wrapper, HAND_KW, isLocal);

    if (weaponBone) {
        console.log(`[ASSETS] ${instanceName}: weapon bone → "${weaponBone.name}"`);
    } else {
        console.warn(
            `[ASSETS] ${instanceName}: no weapon bone found. ` +
            `Check the transform-node log above for the correct bone name.`,
        );
    }

    return {
        root: wrapper,
        meshes,
        animationGroups: cloned.animationGroups,
        walkAnim,
        weaponBone,
        charScale,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gun instance
// ─────────────────────────────────────────────────────────────────────────────
export function createGunInstance(scene: Scene, instanceName = "gun"): GunInstance {
    if (!gunContainer) {
        throw new Error("[ASSETS] gunContainer not loaded — call loadGameAssets first.");
    }

    const cloned = gunContainer.instantiateModelsToScene(
        (name) => `${instanceName}_${name}`,
        false,
        { doNotInstantiate: true },
    );

    const wrapper = new TransformNode(`${instanceName}_wrapper`, scene);
    cloned.rootNodes.forEach((node) => { node.parent = wrapper; });

    const meshes: AbstractMesh[] = [];
    wrapper.getChildMeshes(false).forEach((m) => {
        if ((m as any).makeGeometryUnique) (m as Mesh).makeGeometryUnique();
        m.isPickable      = false;
        m.checkCollisions = false;
        m.isVisible       = true;
        meshes.push(m);
    });

    wrapper.setEnabled(true);

    return { root: wrapper, meshes };
}
