/**
 * mobile-controls.ts — Virtual joystick + touch controls for mobile
 *
 * Provides:
 *  - Left joystick: movement (WASD equivalent)
 *  - Right pad: look / aim (replaces mouse on mobile)
 *  - Jump button
 *  - Shoot button
 */

export interface MobileInput {
    moveX: number;   // -1 to 1 (strafe)
    moveZ: number;   // -1 to 1 (forward/back)
    lookDX: number;  // delta rotation X this frame
    lookDY: number;  // delta rotation Y this frame
    jumpPressed: boolean;
    shootPressed: boolean;
}

const state: MobileInput = {
    moveX: 0,
    moveZ: 0,
    lookDX: 0,
    lookDY: 0,
    jumpPressed: false,
    shootPressed: false,
};

// ── Mobile detection — runs synchronously at module load time ─────────────────
// We use multiple signals so no single browser quirk can fool us.
function detectMobile(): boolean {
    // 1. Touch points available
    if (navigator.maxTouchPoints > 0) return true;
    // 2. Classic ontouchstart
    if ('ontouchstart' in window) return true;
    // 3. User-agent keywords (covers most mobile browsers)
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent)) return true;
    // 4. CSS pointer media (coarse = finger, not mouse)
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    return false;
}

export const _isMobile = detectMobile();

// ── Apply .is-mobile class IMMEDIATELY so CSS shows controls right away ───────
// This runs synchronously when the module is first imported (before any await).
if (_isMobile) {
    document.documentElement.classList.add('is-mobile'); // <html>
    document.body?.classList.add('is-mobile');           // <body> if available
    // Also apply once DOM is ready (in case body isn't available yet)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.add('is-mobile');
        });
    }
}

export function isMobileDevice(): boolean {
    return _isMobile;
}

export function getMobileInput(): MobileInput {
    return state;
}

export function resetFrameInput() {
    state.lookDX = 0;
    state.lookDY = 0;
    state.jumpPressed = false;
    state.shootPressed = false;
}

// Update landscape-small class on resize
function updateLandscapeClass() {
    const isSmall = window.innerHeight < 420;
    document.body.classList.toggle('landscape-small', isSmall);
}

export function setupMobileControls() {
    if (!_isMobile) return;

    // Ensure class is set (belt-and-suspenders in case body wasn't ready at import time)
    document.body.classList.add('is-mobile');
    updateLandscapeClass();
    window.addEventListener('resize', updateLandscapeClass);
    window.addEventListener('orientationchange', () => setTimeout(updateLandscapeClass, 150));

    // Larger crosshair on mobile
    const crosshair = document.getElementById('crosshair');
    if (crosshair) crosshair.classList.add('mobile-crosshair');

    // ── Left joystick ─────────────────────────────────────────────────────────
    const joyZone   = document.getElementById('joy-zone')   as HTMLDivElement;
    const joyBase   = document.getElementById('joy-base')   as HTMLDivElement;
    const joyHandle = document.getElementById('joy-handle') as HTMLDivElement;

    if (!joyZone || !joyBase || !joyHandle) {
        console.warn('[mobile] Joystick elements not found in DOM');
        return;
    }

    let joyTouchId: number | null = null;
    let joyOriginX = 0;
    let joyOriginY = 0;
    const JOY_RADIUS = 55; // px

    joyZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (joyTouchId !== null) return;
        const t = e.changedTouches[0];
        joyTouchId = t.identifier;
        const rect = joyZone.getBoundingClientRect();
        joyOriginX = rect.left + rect.width / 2;
        joyOriginY = rect.top  + rect.height / 2;
        joyBase.style.opacity = '1';
    }, { passive: false });

    joyZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier !== joyTouchId) continue;
            let dx = t.clientX - joyOriginX;
            let dy = t.clientY - joyOriginY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > JOY_RADIUS) {
                dx = (dx / dist) * JOY_RADIUS;
                dy = (dy / dist) * JOY_RADIUS;
            }
            joyHandle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            state.moveX =  dx / JOY_RADIUS;
            state.moveZ = -dy / JOY_RADIUS;  // negative because forward is -Z in BabylonJS
        }
    }, { passive: false });

    const joyEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                joyTouchId = null;
                state.moveX = 0;
                state.moveZ = 0;
                joyHandle.style.transform = 'translate(-50%, -50%)';
                joyBase.style.opacity = '0.5';
            }
        }
    };
    joyZone.addEventListener('touchend',    joyEnd, { passive: false });
    joyZone.addEventListener('touchcancel', joyEnd, { passive: false });

    // ── Right look pad ────────────────────────────────────────────────────────
    const lookPad = document.getElementById('look-pad') as HTMLDivElement;
    interface LookTouch { lastX: number; lastY: number; }
    const lookTouches: Map<number, LookTouch> = new Map();

    const LOOK_SENSITIVITY = 0.003;

    lookPad.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            lookTouches.set(t.identifier, { lastX: t.clientX, lastY: t.clientY });
        }
    }, { passive: false });

    lookPad.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const prev = lookTouches.get(t.identifier);
            if (!prev) continue;
            state.lookDX += (t.clientX - prev.lastX) * LOOK_SENSITIVITY;
            state.lookDY += (t.clientY - prev.lastY) * LOOK_SENSITIVITY;
            prev.lastX = t.clientX;
            prev.lastY = t.clientY;
        }
    }, { passive: false });

    const lookEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            lookTouches.delete(e.changedTouches[i].identifier);
        }
    };
    lookPad.addEventListener('touchend',    lookEnd, { passive: false });
    lookPad.addEventListener('touchcancel', lookEnd, { passive: false });

    // ── Jump button ───────────────────────────────────────────────────────────
    const jumpBtn = document.getElementById('btn-jump') as HTMLButtonElement;
    if (jumpBtn) {
        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            state.jumpPressed = true;
        }, { passive: false });
    }

    // ── Shoot button ──────────────────────────────────────────────────────────
    const shootBtn = document.getElementById('btn-shoot') as HTMLButtonElement;
    if (shootBtn) {
        shootBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            state.shootPressed = true;
        }, { passive: false });
    }
}
