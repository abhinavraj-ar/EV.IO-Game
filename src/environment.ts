import {
    Scene,
    Vector3,
    HemisphericLight,
    DirectionalLight,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    ShadowGenerator,
} from "@babylonjs/core";


// SCALE NOTE:  1 unit ≈ 3 m  



const C = {
    concrete:    new Color3(0.76, 0.72, 0.63),  
    concreteDk:  new Color3(0.62, 0.58, 0.50),  
    solar:       new Color3(0.22, 0.28, 0.35),  
    pinkBrick:   new Color3(0.75, 0.42, 0.38),   
    pinkRoof:    new Color3(0.68, 0.35, 0.30),   
    libraryRoof: new Color3(0.28, 0.45, 0.65),   
    tarmac:      new Color3(0.28, 0.28, 0.30),  
    grass:       new Color3(0.22, 0.32, 0.14),   
    grassLight:  new Color3(0.30, 0.42, 0.18),   
    trunk:       new Color3(0.32, 0.20, 0.09),
    canopyDk:    new Color3(0.12, 0.30, 0.10),
    canopyLt:    new Color3(0.20, 0.42, 0.15),
    hedge:       new Color3(0.20, 0.35, 0.12),
    fence:       new Color3(0.18, 0.18, 0.20),
    fountainWtr: new Color3(0.28, 0.55, 0.70),
    stone:       new Color3(0.55, 0.52, 0.48),
};

// --- HELPERS -------------------------------------------------------------------------------

/** Solid building block — walls + flat roof slab */
function building(
    name: string, scene: Scene,
    x: number, z: number,
    w: number, d: number, h: number,
    wallCol: Color3, roofCol: Color3,
    rotY = 0
): Mesh[] {
    const body = MeshBuilder.CreateBox(name + "_b", { width: w, height: h, depth: d }, scene);
    body.position.set(x, h / 2, z);
    body.rotation.y = rotY;
    body.checkCollisions = true;
    body.isPickable = false;
    const bm = new StandardMaterial(name + "_bm", scene);
    bm.diffuseColor = wallCol;
    body.material = bm;

    const roof = MeshBuilder.CreateBox(name + "_r", { width: w + 0.4, height: 0.35, depth: d + 0.4 }, scene);
    roof.position.set(x, h + 0.175, z);
    roof.rotation.y = rotY;
    roof.checkCollisions = false;
    roof.isPickable = false;
    const rm = new StandardMaterial(name + "_rm", scene);
    rm.diffuseColor = roofCol;
    roof.material = rm;

    return [body, roof];
}

/** Invisible solid barrier */
function barrier(name: string, scene: Scene, x: number, z: number, w: number, d: number, h = 12) {
    const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position.set(x, h / 2, z);
    b.checkCollisions = true;
    b.isPickable = false;
    b.isVisible = false;
}

/** Ground decal (road, path, courtyard) */
function decal(name: string, scene: Scene, x: number, z: number, w: number, d: number, col: Color3, y = 0.01) {
    const m = MeshBuilder.CreateGround(name, { width: w, height: d }, scene);
    m.position.set(x, y, z);
    m.isPickable = false;
    const mat = new StandardMaterial(name + "m", scene);
    mat.diffuseColor = col;
    m.material = mat;
    return m;
}

/** Arc building: boxes arranged in a curved line */
function arcBuilding(
    name: string, scene: Scene,
    cx: number, cz: number, radius: number,
    fromDeg: number, toDeg: number, segs: number,
    segW: number, segD: number, h: number,
    wallCol: Color3, roofCol: Color3
): Mesh[] {
    const all: Mesh[] = [];
    const f = (fromDeg * Math.PI) / 180;
    const t = (toDeg  * Math.PI) / 180;
    const step = (t - f) / segs;
    for (let i = 0; i < segs; i++) {
        const a = f + step * (i + 0.5);
        const sx = cx + radius * Math.cos(a);
        const sz = cz + radius * Math.sin(a);
        const n  = `${name}_${i}`;

        const body = MeshBuilder.CreateBox(n + "_b", { width: segW, height: h, depth: segD }, scene);
        body.position.set(sx, h / 2, sz);
        body.rotation.y = -(a - Math.PI / 2) + Math.PI / 2;
        body.checkCollisions = true;
        body.isPickable = false;
        const bm = new StandardMaterial(n + "_bm", scene);
        bm.diffuseColor = wallCol;
        body.material = bm;
        all.push(body);

        const roof = MeshBuilder.CreateBox(n + "_r", { width: segW + 0.3, height: 0.35, depth: segD + 0.3 }, scene);
        roof.position.set(sx, h + 0.175, sz);
        roof.rotation.y = body.rotation.y;
        roof.checkCollisions = false;
        roof.isPickable = false;
        const rm = new StandardMaterial(n + "_rm", scene);
        rm.diffuseColor = roofCol;
        roof.material = rm;
        all.push(roof);
    }
    return all;
}

/** Tree: trunk cylinder + sphere canopy */
function tree(name: string, scene: Scene, x: number, z: number, h = 4, canopyR = 2.5, palm = false) {
    const trunkH = palm ? h * 0.85 : h * 0.5;
    const trunk = MeshBuilder.CreateCylinder(name + "_t", {
        diameter: palm ? 0.3 : 0.55, height: trunkH, tessellation: 8
    }, scene);
    trunk.position.set(x, trunkH / 2, z);
    trunk.checkCollisions = false;
    trunk.isPickable = false;
    const tm = new StandardMaterial(name + "_tm", scene);
    tm.diffuseColor = C.trunk;
    trunk.material = tm;

    const canopy = MeshBuilder.CreateSphere(name + "_c", { diameter: canopyR * 2, segments: 6 }, scene);
    canopy.position.set(x, trunkH + canopyR * 0.7, z);
    canopy.checkCollisions = true;
    canopy.isPickable = false;
    const cm = new StandardMaterial(name + "_cm", scene);
    cm.diffuseColor = palm
        ? new Color3(0.15, 0.48, 0.12)
        : (Math.random() > 0.5 ? C.canopyDk : C.canopyLt);
    canopy.material = cm;

    return [trunk, canopy];
}

// ------------------------------------------------------------------------------------
export function createEnvironment(scene: Scene) {

    //  LIGHTING 
    const ambient = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
    ambient.intensity   = 0.60;
    ambient.diffuse     = new Color3(1.0, 0.97, 0.88);
    ambient.groundColor = new Color3(0.12, 0.10, 0.06);

    const sun = new DirectionalLight("sun", new Vector3(-0.6, -1.5, -1).normalize(), scene);
    sun.intensity = 1.15;
    sun.diffuse   = new Color3(1.0, 0.96, 0.82);

    const shadows = new ShadowGenerator(1024, sun);
    shadows.useBlurExponentialShadowMap = true;

    //  GROUND
    const ground = MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
    ground.checkCollisions  = true;
    ground.receiveShadows   = true;
    const gm = new StandardMaterial("gm", scene);
    gm.diffuseColor = C.grass;
    ground.material = gm;

    //MAP BOUNDARY 
    barrier("bN", scene,   0, -95, 200,  2);
    barrier("bS", scene,   0,  95, 200,  2);
    barrier("bW", scene, -95,   0,   2, 200);
    barrier("bE", scene,  95,   0,   2, 200);

    // MAIN CRESCENT / ARC BUILDING
    
    const ARC_CX = 0, ARC_CZ = -5;

    // Outer wing of crescent (main visible facade)
    arcBuilding(
        "arc_outer", scene,
        ARC_CX, ARC_CZ, 30,
        210, 330, 16,
        /* segW */ 12, /* segD */ 8, /* h */ 6,
        C.concrete, C.solar
    );
    // Inner corridor ring (slightly smaller radius, shorter)
    arcBuilding(
        "arc_inner", scene,
        ARC_CX, ARC_CZ, 22,
        215, 325, 12,
        10, 6, 5,
        C.concreteDk, C.solar
    );
    // West tip of crescent (straight wing sticking out)
    building("arc_wtip", scene, -30, -3, 8, 16, 6, C.concrete, C.solar);
    // East tip of crescent (straight wing sticking out)
    building("arc_etip", scene,  30, -3, 8, 16, 6, C.concrete, C.solar);

    
    // ACADEMIC BLOCKS 
    

    // LEFT ACADEMIC BLOCK (H-shaped)
    // Horizontal spine
    building("acL_spine",   scene, -14, -38, 32, 8, 7, C.concrete, C.solar);
    // North wing
    building("acL_north",   scene, -14, -52, 28, 7, 7, C.concrete, C.solar);
    // South stub
    building("acL_south",   scene, -14, -28, 20, 6, 6, C.concreteDk, C.solar);
    // Left arm
    building("acL_arm_W",   scene, -28, -42,  7, 20, 7, C.concrete, C.solar);
    // Right arm (towards centre)
    building("acL_arm_E",   scene,  -2, -42,  7, 20, 6, C.concreteDk, C.solar);

   //Academic
    building("acR_spine",   scene,  16, -38, 28,  8, 7, C.concrete, C.solar);
    building("acR_north",   scene,  16, -52, 24,  7, 7, C.concrete, C.solar);
    building("acR_south",   scene,  16, -28, 18,  6, 6, C.concreteDk, C.solar);
    building("acR_arm_E",   scene,  28, -42,  7, 20, 7, C.concrete, C.solar);
    building("acR_arm_W",   scene,   4, -42,  6, 18, 6, C.concreteDk, C.solar);

    // Connector bridge between left and right blocks
    building("ac_bridge",   scene,   1, -38, 6, 8, 5, C.stone, C.solar);

    
    //CENTRAL LIBRARY — north-west  (blue roof, distinctive pavilion)
   
    building("lib_main",    scene, -48, -38, 20, 14, 5, C.concrete, C.libraryRoof);
    building("lib_east",    scene, -38, -32, 10,  8, 4, C.concrete, C.libraryRoof);
    building("lib_pavil",   scene, -46, -28,  9,  9, 7, C.concrete, C.libraryRoof);
    // Low compound wall around library
    building("lib_wall_N",  scene, -48, -46, 22,  1, 2, C.stone,    C.stone);
    building("lib_wall_W",  scene, -60, -38,  1, 20, 2, C.stone,    C.stone);

    // MAIN GATE
    {
        const GATE_Z  = 70;   
        const GATE_GAP = 6;  
        const PILLAR_W = 3.5, PILLAR_D = 3.5, PILLAR_H = 7;
        const woodBrown  = new Color3(0.28, 0.16, 0.06); 
        const whiteBase  = new Color3(0.88, 0.88, 0.84);  

        //  Left pillar 
        // White concrete base
        const lpBase = MeshBuilder.CreateBox("gate_lpBase", { width: PILLAR_W + 0.4, height: 1.0, depth: PILLAR_D + 0.4 }, scene);
        lpBase.position.set(-(GATE_GAP + PILLAR_W / 2), 0.5, GATE_Z);
        lpBase.checkCollisions = true; lpBase.isPickable = false;
        const lpBm = new StandardMaterial("gate_lpBm", scene); lpBm.diffuseColor = whiteBase; lpBase.material = lpBm;

        // Wood body
        const lpBody = MeshBuilder.CreateBox("gate_lpBody", { width: PILLAR_W, height: PILLAR_H, depth: PILLAR_D }, scene);
        lpBody.position.set(-(GATE_GAP + PILLAR_W / 2), PILLAR_H / 2, GATE_Z);
        lpBody.checkCollisions = true; lpBody.isPickable = false;
        const lpWm = new StandardMaterial("gate_lpWm", scene); lpWm.diffuseColor = woodBrown; lpBody.material = lpWm;

        // White cap
        const lpCap = MeshBuilder.CreateBox("gate_lpCap", { width: PILLAR_W + 0.4, height: 0.5, depth: PILLAR_D + 0.4 }, scene);
        lpCap.position.set(-(GATE_GAP + PILLAR_W / 2), PILLAR_H + 0.25, GATE_Z);
        lpCap.checkCollisions = false; lpCap.isPickable = false;
        lpCap.material = lpBm;

        // Right pillar 
        const rpBase = MeshBuilder.CreateBox("gate_rpBase", { width: PILLAR_W + 0.4, height: 1.0, depth: PILLAR_D + 0.4 }, scene);
        rpBase.position.set( (GATE_GAP + PILLAR_W / 2), 0.5, GATE_Z);
        rpBase.checkCollisions = true; rpBase.isPickable = false; rpBase.material = lpBm;

        const rpBody = MeshBuilder.CreateBox("gate_rpBody", { width: PILLAR_W, height: PILLAR_H, depth: PILLAR_D }, scene);
        rpBody.position.set( (GATE_GAP + PILLAR_W / 2), PILLAR_H / 2, GATE_Z);
        rpBody.checkCollisions = true; rpBody.isPickable = false; rpBody.material = lpWm;

        const rpCap = MeshBuilder.CreateBox("gate_rpCap", { width: PILLAR_W + 0.4, height: 0.5, depth: PILLAR_D + 0.4 }, scene);
        rpCap.position.set( (GATE_GAP + PILLAR_W / 2), PILLAR_H + 0.25, GATE_Z);
        rpCap.checkCollisions = false; rpCap.isPickable = false; rpCap.material = lpBm;

        //  Overhead arch beam ("BIT SINDRI" signboard)
        // Beam starts at top of pillars and spans the full opening
        // Player height ≈ 2 units — beam bottom is at 7.5, well above player
        const beamSpan = (GATE_GAP + PILLAR_W / 2) * 2 + PILLAR_W; // full span pillar-to-pillar
        const beam = MeshBuilder.CreateBox("gate_beam", { width: beamSpan, height: 2.0, depth: PILLAR_D }, scene);
        beam.position.set(0, PILLAR_H + 1.25, GATE_Z);
        beam.checkCollisions = true; // solid sign board
        beam.isPickable = false;
        const beamMat = new StandardMaterial("gate_beamMat", scene);
        beamMat.diffuseColor = woodBrown;
        beam.material = beamMat;

        // White top capping strip on beam
        const beamCap = MeshBuilder.CreateBox("gate_beamCap", { width: beamSpan + 0.3, height: 0.35, depth: PILLAR_D + 0.3 }, scene);
        beamCap.position.set(0, PILLAR_H + 2.42, GATE_Z);
        beamCap.checkCollisions = false; beamCap.isPickable = false; beamCap.material = lpBm;

        //  Guard booth (cylindrical, left of gate) 
        const booth = MeshBuilder.CreateCylinder("gate_booth", { diameter: 2.4, height: 3.5, tessellation: 12 }, scene);
        booth.position.set(-(GATE_GAP + PILLAR_W + 3.5), 1.75, GATE_Z);
        booth.checkCollisions = true; booth.isPickable = false;
        const boothMat = new StandardMaterial("gate_boothMat", scene);
        boothMat.diffuseColor = woodBrown;
        booth.material = boothMat;
        // Booth roof
        const boothRoof = MeshBuilder.CreateCylinder("gate_boothRoof", { diameter: 2.8, height: 0.35, tessellation: 12 }, scene);
        boothRoof.position.set(-(GATE_GAP + PILLAR_W + 3.5), 3.67, GATE_Z);
        boothRoof.checkCollisions = false; boothRoof.isPickable = false;
        const brm = new StandardMaterial("gate_brm", scene); brm.diffuseColor = whiteBase; boothRoof.material = brm;

        // -- Iron fence panels -- stop at pillar edges, opening left clear --
        const fenceStartX = GATE_GAP + PILLAR_W + 0.5; // start outside the right pillar
        for (let fx = fenceStartX; fx <= 20; fx += 2) {
            const post = MeshBuilder.CreateBox(`gate_fence_R_${fx}`, { width: 0.22, height: 2.5, depth: 0.22 }, scene);
            post.position.set(fx, 1.25, GATE_Z);
            post.checkCollisions = true; post.isPickable = false;
            const fm = new StandardMaterial(`gate_fenceMat_R_${fx}`, scene);
            fm.diffuseColor = C.fence; post.material = fm;
            const rail = MeshBuilder.CreateBox(`gate_rail_R_${fx}`, { width: 2, height: 0.1, depth: 0.1 }, scene);
            rail.position.set(fx + 1, 1.8, GATE_Z);
            rail.checkCollisions = false; rail.isPickable = false; rail.material = fm;
        }
        for (let fx = -fenceStartX; fx >= -20; fx -= 2) {
            const post = MeshBuilder.CreateBox(`gate_fence_L_${Math.abs(fx)}`, { width: 0.22, height: 2.5, depth: 0.22 }, scene);
            post.position.set(fx, 1.25, GATE_Z);
            post.checkCollisions = true; post.isPickable = false;
            const fm = new StandardMaterial(`gate_fenceMat_L_${Math.abs(fx)}`, scene);
            fm.diffuseColor = C.fence; post.material = fm;
            const rail = MeshBuilder.CreateBox(`gate_rail_L_${Math.abs(fx)}`, { width: 2, height: 0.1, depth: 0.1 }, scene);
            rail.position.set(fx - 1, 1.8, GATE_Z);
            rail.checkCollisions = false; rail.isPickable = false; rail.material = fm;
        }
    }

    // Compound wall extending either side of gate
    building("cwall_L",     scene, -38, 70, 34, 1.2, 2.5, C.stone, C.stone);
    building("cwall_R",     scene,  38, 70, 34, 1.2, 2.5, C.stone, C.stone);

    // EAST SIDE — reddish auxiliary block (visible in aerial, right side)
   
    building("east_blk_A",  scene,  60, -10, 14, 26, 5, C.pinkBrick, C.pinkRoof);
    building("east_blk_B",  scene,  60,  16, 12, 14, 4, C.pinkBrick, C.pinkRoof);
    building("east_blk_C",  scene,  60, -28, 10, 12, 4, C.pinkBrick, C.pinkRoof);

    // ROADS & PAVED SURFACES
    
    // Long south spine road (from gate to fountain)
    decal("road_spine",    scene,  0,  40, 8,  50, C.tarmac);
    // Courtyard paving in front of arc building
    decal("courtyard",     scene,  0,  20, 50, 30, new Color3(0.52, 0.50, 0.46));
    // Internal campus road (east-west)
    decal("road_EW",       scene,  0,  -2, 70,  7, C.tarmac);
    // North campus road
    decal("road_N",        scene,  0, -22, 60,  6, C.tarmac);
    // Right wing service road
    decal("road_E",        scene, 44, -10,  6, 40, C.tarmac);
    // Library path
    decal("road_lib",      scene,-32, -26, 22,  4, C.tarmac);
    // Back road behind academic blocks
    decal("road_back",     scene,  0, -56, 50,  5, C.tarmac);
    // Circular driveway at entrance
    decal("drive_circle",  scene,  0,  50, 22, 22, new Color3(0.38, 0.36, 0.34));

    // FOUNTAIN COURTYARD  (between gate and arc opening)
    
    {
        const FCX = 0, FCZ = 18;

        // Outer ring (low stone wall)
        const outerRing = MeshBuilder.CreateTorus("fountain_ring", { diameter: 14, thickness: 1.0, tessellation: 32 }, scene);
        outerRing.position.set(FCX, 0.5, FCZ);
        outerRing.checkCollisions = true;
        outerRing.isPickable = false;
        const ringMat = new StandardMaterial("ringMat", scene);
        ringMat.diffuseColor = C.stone;
        outerRing.material = ringMat;

        // Water basin
        const basin = MeshBuilder.CreateCylinder("fountain_basin", { diameter: 13, height: 0.3, tessellation: 32 }, scene);
        basin.position.set(FCX, 0.15, FCZ);
        basin.checkCollisions = false;
        basin.isPickable = false;
        const basinMat = new StandardMaterial("basinMat", scene);
        basinMat.diffuseColor = C.fountainWtr;
        basin.material = basinMat;

        // Central fountain jet pillar
        const jet = MeshBuilder.CreateCylinder("fountain_jet", { diameter: 0.6, height: 3, tessellation: 10 }, scene);
        jet.position.set(FCX, 1.5, FCZ);
        jet.checkCollisions = false;
        jet.isPickable = false;
        const jetMat = new StandardMaterial("jetMat", scene);
        jetMat.diffuseColor = new Color3(0.85, 0.90, 0.95);
        jet.material = jetMat;

        // Decorative garden ring around the outer fountain wall
        const garden = MeshBuilder.CreateCylinder("garden_ring", { diameter: 18, height: 0.25, tessellation: 32 }, scene);
        garden.position.set(FCX, 0.12, FCZ);
        garden.checkCollisions = false;
        garden.isPickable = false;
        const gardenMat = new StandardMaterial("gardenMat", scene);
        gardenMat.diffuseColor = C.grassLight;
        garden.material = gardenMat;
    }
    // 11. PALM TREES — lining the entrance road
    const palmZRange = [46, 52, 58, 64];
    palmZRange.forEach((pz, i) => {
        tree(`palmL_${i}`, scene, -5, pz, 5, 1.8, true);
        tree(`palmR_${i}`, scene,  5, pz, 5, 1.8, true);
    });
    // REGULAR TREES — dense campus forest
    
    const treeDefs: [number, number, number, number][] = [
        
        // Courtyard flanks
        [-26,  18, 5, 3.0], [ 26,  18, 5, 3.0],
        [-30,  30, 4, 2.5], [ 30,  30, 4, 2.5],
        [-22,   8, 5, 2.8], [ 22,   8, 5, 2.8],
        // Between buildings
        [-20, -18, 5, 2.5], [ 20, -18, 5, 2.5],
        [ -8, -20, 4, 2.2], [  8, -20, 4, 2.2],
        // West campus
        [-50,  -8, 6, 3.5], [-50,  10, 6, 3.5],
        [-50,  28, 5, 3.0], [-50, -28, 5, 3.0],
        [-68,   0, 7, 4.0], [-68, -20, 7, 4.0],
        [-68,  20, 6, 3.5], [-70, -40, 7, 4.0],
        // East campus
        [ 72,  -8, 6, 3.5], [ 72,  10, 6, 3.0],
        [ 72,  28, 5, 3.0], [ 72, -28, 5, 3.0],
        [ 78,   0, 7, 4.0], [ 78,  40, 7, 4.0],
        // North back
        [-20, -64, 6, 3.5], [  0, -68, 7, 4.0],
        [ 20, -64, 6, 3.5], [-40, -60, 6, 3.5],
        [ 40, -60, 6, 3.5], [ 56, -52, 5, 3.0],
        // South sides
        [-40,  60, 5, 3.0], [ 40,  60, 5, 3.0],
        [-60,  55, 6, 3.5], [ 60,  55, 6, 3.5],
        // Corner forest clumps
        [-80, -70, 8, 5.0], [ 80, -70, 8, 5.0],
        [-80,  70, 8, 5.0], [ 80,  70, 8, 5.0],
        [-80,   0, 8, 4.5], [ 80,   0, 8, 4.5],
        // Library garden
        [-55, -22, 5, 3.0], [-60, -36, 6, 3.5],
        [-55, -50, 5, 3.0],
    ];
    treeDefs.forEach(([tx, tz, th, tr], i) => {
        tree(`tree_${i}`, scene, tx, tz, th, tr, false).forEach(m => {
            shadows.addShadowCaster(m);
        });
    });

    
    // LOW HEDGES / COMPOUND WALLS inside campus
    const hedgeDefs: [string, number, number, number, number][] = [
        ["hg_arc_W",   -36,   6, 2, 18],  // west of arc open arms
        ["hg_arc_E",    36,   6, 2, 18],  // east of arc
        ["hg_acL_S",   -14, -20, 30, 2],  // south face of left academic block
        ["hg_acR_S",    16, -20, 26, 2],  // south face of right academic block
        ["hg_lib_S",   -48, -22, 24, 2],  // south of library
    ];
    hedgeDefs.forEach(([n, hx, hz, hw, hd]) => {
        const h = MeshBuilder.CreateBox(n, { width: hw, height: 1.8, depth: hd }, scene);
        h.position.set(hx, 0.9, hz);
        h.checkCollisions = true;
        h.isPickable = false;
        const hm = new StandardMaterial(n + "m", scene);
        hm.diffuseColor = C.hedge;
        h.material = hm;
    });

  
    // SHADOW CASTERS

    scene.meshes.forEach(m => {
        if (m.name.endsWith("_b")) {
            shadows.addShadowCaster(m);
            m.receiveShadows = true;
        }
        if (m.name === "ground") m.receiveShadows = true;
    });
}