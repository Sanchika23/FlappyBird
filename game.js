const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const messageElement = document.getElementById('message');

// Polyfill for roundRect to ensure compatibility across older browsers and webviews
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radii) {
        let r = 0;
        if (typeof radii === 'number') {
            r = radii;
        } else if (Array.isArray(radii)) {
            r = radii[0] || 0;
        }
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + width - r, y);
        this.arcTo(x + width, y, x + width, y + r, r);
        this.lineTo(x + width, y + height - r);
        this.arcTo(x + width, y + height, x + width - r, y + height, r);
        this.lineTo(x + r, y + height);
        this.arcTo(x, y + height, x, y + height - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x, y, x + r, y, r);
        this.closePath();
        return this;
    };
}

// Set canvas to physical size
canvas.width = 800;
canvas.height = 450;

// Game constants (Tuned to be difficult: high gravity, fast falling, smaller steps)
const GRAVITY = 0.42;           // High gravity
const JUMP_STRENGTH = -10.5;    // Stronger, higher jump
const MOVE_SPEED = 4.6;         // Snappy horizontal speed
const PLATFORM_SPEED = 1.6;     // Faster scrolling platforms
const STEP_WIDTH = 95;          // Narrower platforms (difficult)
const STEP_HEIGHT = 16;
const PLAYER_WIDTH = 22;
const PLAYER_HEIGHT = 38;

// Web Audio API Synthesizer (Zero asset dependencies, instant local loading)
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        } catch (e) {
            console.warn("Web Audio API is not supported in this browser:", e);
            audioCtx = null;
        }
    }
}

function playSound(type) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    switch (type) {
        case 'jump': {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(450, now + 0.12);
            
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            
            osc.start(now);
            osc.stop(now + 0.13);
            break;
        }
        case 'coin': {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(950, now);
            osc.frequency.setValueAtTime(1420, now + 0.08); // arcade double chime
            
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
            
            osc.start(now);
            osc.stop(now + 0.23);
            break;
        }
        case 'slash': {
            const bufferSize = audioCtx.sampleRate * 0.1;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, now);
            filter.frequency.exponentialRampToValueAtTime(400, now + 0.1);
            
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            
            noise.start(now);
            break;
        }
        case 'hit': {
            // Blast sound
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
            
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            
            osc.start(now);
            osc.stop(now + 0.21);
            
            // Noise burst
            const bufferSize = audioCtx.sampleRate * 0.12;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noiseSource = audioCtx.createBufferSource();
            noiseSource.buffer = buffer;
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.08, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            noiseSource.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noiseSource.start(now);
            break;
        }
        case 'hurt': {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(90, now + 0.4);
            
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            
            osc.start(now);
            osc.stop(now + 0.41);
            break;
        }
    }
}

// Camera & Juice details
let camera = {
    x: 0,
    targetX: 0,
    y: 0,
    targetY: 0,
    shakeTimer: 0,
    shakeIntensity: 0
};

// Hit Freeze Frame details
let freezeTimer = 0;

// Player State
let player = {
    x: 150,
    y: 200,
    vx: 0,
    vy: 0,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    grounded: false,
    facingRight: true,
    walkCycle: 0,
    gender: 'boy',       
    colorTheme: '#e74c3c', 
    lives: 5,            
    invulnerable: 0,
    attackTimer: 0,
    // Game Feel Details
    coyoteCounter: 0,       // Coyote time (jump slightly after falling off ledges)
    jumpBufferCounter: 0    // Jump input buffering (inputs jump slightly before landing)
};

// Game lists
let steps = [];
let stars = [];
let nebulae = [];
let particles = [];
let floatingTexts = [];
let shootingStars = [];

// Game flow
let score = 0;
let highScore = localStorage.getItem('starryStepperHighScore') || 0;
let gameRunning = false;
let gameStarted = false;
let firstMoveMade = false; // Keeps platforms static until the player makes their first move

// Procedural generation trackers
let lastStepX = 0;
let lastStepY = 300;
let stairDirection = -1; 
let stepsInCurrentDirection = 0;

// Color Customization Options
const COLOR_OPTIONS = [
    { name: 'Red', hex: '#e74c3c' },
    { name: 'Blue', hex: '#3498db' },
    { name: 'Green', hex: '#2ecc71' },
    { name: 'Yellow', hex: '#f1c40f' },
    { name: 'Purple', hex: '#9b59b6' },
    { name: 'Pink', hex: '#fd79a8' },
    { name: 'Orange', hex: '#e67e22' },
    { name: 'Teal', hex: '#1abc9c' },
    { name: 'Neon Green', hex: '#00b894' },
    { name: 'Silver', hex: '#eceff1' }
];

// Controls
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    KeyW: false,
    KeyS: false,
    KeyZ: false,
    KeyX: false
};

// Initialize Background Elements
function initBackground() {
    stars = [];
    for (let i = 0; i < 120; i++) {
        stars.push({
            x: Math.random() * canvas.width * 2,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.8 + 0.4,
            alpha: Math.random(),
            twinkleSpeed: 0.01 + Math.random() * 0.02,
            layer: Math.random() < 0.3 ? 1 : (Math.random() < 0.6 ? 2 : 3)
        });
    }

    nebulae = [
        { x: 100, y: 100, r: 180, color: 'rgba(155, 89, 182, 0.15)' },
        { x: 600, y: 300, r: 220, color: 'rgba(52, 152, 219, 0.12)' },
        { x: 1100, y: 150, r: 200, color: 'rgba(26, 188, 156, 0.1)' }
    ];
}

// Trigger Screen Shake
function triggerScreenShake(duration, intensity) {
    camera.shakeTimer = duration;
    camera.shakeIntensity = intensity;
}

// Reset and Start Game
function resetGame() {
    player.x = 150;
    player.y = 200;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    player.walkCycle = 0;
    player.lives = 5;
    player.invulnerable = 0;
    player.attackTimer = 0;
    player.coyoteCounter = 0;
    player.jumpBufferCounter = 0;
    firstMoveMade = false;

    steps = [];
    particles = [];
    floatingTexts = [];
    shootingStars = [];
    score = 0;

    camera.x = player.x - canvas.width / 3;
    camera.targetX = camera.x;
    camera.y = player.y - canvas.height / 2;
    camera.targetY = camera.y;
    camera.shakeTimer = 0;

    lastStepX = 100;
    lastStepY = 280;
    stairDirection = -1;
    stepsInCurrentDirection = 0;

    // Spawn starting safety step under player
    steps.push({
        id: 0,
        x: 100,
        y: 280,
        width: STEP_WIDTH * 2,
        height: STEP_HEIGHT,
        type: 'normal',
        hasCoin: false,
        coinCollected: false,
        coinAnim: 0,
        opacity: 1,
        hasEnemy: false,
        enemyActive: false
    });

    // Populate initial staircase ahead
    for (let i = 0; i < 6; i++) {
        spawnNextStep();
    }

    updateScoreDisplay();
    messageElement.style.display = 'none';
    gameRunning = true;
}

function spawnNextStep() {
    let rand = Math.random();
    let type = 'normal';
    if (steps.length > 2) {
        if (rand < 0.18) {
            type = 'bouncy';
        } else if (rand < 0.38) {
            type = 'shifting';
        }
    }

    // Determine Y coordinate (stair steps flow)
    let stepYDiff = 40 + Math.random() * 45;
    let targetY = lastStepY + (stairDirection * stepYDiff);

    // Y bounds clamp
    if (targetY < player.y - 250) {
        stairDirection = 1;
        targetY = lastStepY + 40;
    } else if (targetY > player.y + 150) {
        stairDirection = -1;
        targetY = lastStepY - 40;
    } else {
        stepsInCurrentDirection++;
        let threshold = 3 + Math.floor(Math.random() * 5);
        if (stepsInCurrentDirection >= threshold) {
            stairDirection = Math.random() < 0.5 ? 1 : -1;
            stepsInCurrentDirection = 0;
        }
    }

    // Space out step horizontally (wider gaps for difficult platforming)
    let stepXDiff = STEP_WIDTH + 38 + Math.random() * 38;
    let targetX = lastStepX + stepXDiff;

    lastStepX = targetX;
    lastStepY = targetY;

    // Spiky enemy spawns disabled as requested
    let hasEnemy = false;
    
    steps.push({
        id: steps.length,
        x: targetX,
        y: targetY,
        width: STEP_WIDTH,
        height: STEP_HEIGHT,
        type: type,
        hasCoin: !hasEnemy, 
        coinCollected: false,
        coinAnim: Math.random() * Math.PI * 2,
        opacity: 1,
        startX: targetX,
        shiftRange: 35 + Math.random() * 35,
        shiftSpeed: 0.3 + Math.random() * 0.3,
        shiftDir: Math.random() < 0.5 ? -1 : 1,
        shiftTime: Math.random() * 100,
        hasEnemy: hasEnemy,
        enemyActive: hasEnemy,
        enemyAnim: Math.random() * Math.PI * 2
    });
}

// Restart level on life loss
function restartOnLifeLost() {
    player.x = 150;
    player.y = 200;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    player.attackTimer = 0;
    player.coyoteCounter = 0;
    player.jumpBufferCounter = 0;
    firstMoveMade = false;

    steps = [];
    particles = [];
    floatingTexts = [];
    shootingStars = [];

    camera.x = player.x - canvas.width / 3;
    camera.targetX = camera.x;
    camera.y = player.y - canvas.height / 2;
    camera.targetY = camera.y;

    lastStepX = 100;
    lastStepY = 280;
    stairDirection = -1;
    stepsInCurrentDirection = 0;

    steps.push({
        id: 0,
        x: 100,
        y: 280,
        width: STEP_WIDTH * 2,
        height: STEP_HEIGHT,
        type: 'normal',
        hasCoin: false,
        coinCollected: false,
        coinAnim: 0,
        opacity: 1,
        hasEnemy: false,
        enemyActive: false
    });

    for (let i = 0; i < 6; i++) {
        spawnNextStep();
    }

    player.invulnerable = 90; 
    playSound('jump');
    triggerScreenShake(15, 5); 
    spawnParticles(150, 200, '#3498db', 20, 1.2);
    triggerFloatingText(150, 150, 'SAFE RESPAWN! ✨', '#f1c40f');
}

function updateScoreDisplay() {
    let hearts = '❤️'.repeat(player.lives);
    scoreElement.innerHTML = `Coins: ${score}<br>Best: ${highScore}<br>Lives: ${hearts || '💀'}`;
}

function startGame() {
    initAudio();
    if (!gameStarted) {
        gameStarted = true;
        resetGame();
    } else if (!gameRunning) {
        resetGame();
    }
}

// Display Interactive Character Customizer Start Screen
function showCustomizerScreen(isGameOver = false) {
    let colorButtonsHTML = COLOR_OPTIONS.map(opt => `
        <button class="color-btn ${player.colorTheme === opt.hex ? 'active' : ''}" 
                data-color="${opt.hex}" 
                title="${opt.name}"
                style="background-color: ${opt.hex};"></button>
    `).join('');

    messageElement.innerHTML = `
        ${isGameOver ? `<div style="font-size: 20px; font-weight: 800; color: #e74c3c; margin-bottom: 4px;">Game Over!</div>
        <div style="font-size: 15px; color: #f1c40f; font-weight: bold; margin-bottom: 12px;">Collected: ${score} coins</div>` : `🌟 STARRY STEPPER 🌟`}
        
        <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 12px;">Jump on unexpected steps to collect coins!</div>
        
        <div class="customizer-section">
            <h3>Customize Explorer</h3>
            <div class="customizer-row">
                <span>Style:</span>
                <div class="btn-group" id="gender-select">
                    <button class="custom-btn ${player.gender === 'boy' ? 'active' : ''}" data-gender="boy">Boy</button>
                    <button class="custom-btn ${player.gender === 'girl' ? 'active' : ''}" data-gender="girl">Girl</button>
                </div>
            </div>
            <div class="customizer-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                <span>Color Suit:</span>
                <div class="color-picker" id="color-select">
                    ${colorButtonsHTML}
                </div>
            </div>
        </div>
        
        <button id="start-btn">Start Adventure</button>
        <div class="controls-hint">(Z = Jump  |  X = Attack  |  Arrows = Move)</div>
    `;

    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startGame();
        });
    }

    const genderButtons = document.querySelectorAll('#gender-select .custom-btn');
    genderButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            genderButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            player.gender = btn.getAttribute('data-gender');
            btn.blur();
            initAudio();
        });
    });

    const colorButtons = document.querySelectorAll('#color-select .color-btn');
    colorButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            colorButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            player.colorTheme = btn.getAttribute('data-color');
            btn.blur();
            initAudio();
        });
    });

    messageElement.style.display = 'block';
}

// Keyboard controls
window.addEventListener('keydown', (e) => {
    initAudio();

    // Prevent default browser scrolling/actions for game control keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyZ', 'KeyX', 'Space'].includes(e.code)) {
        e.preventDefault();
    }

    if (e.code === 'KeyZ' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        keys.KeyZ = true;
        keys.ArrowUp = true;
        keys.KeyW = true;
        if (!gameRunning) {
            startGame();
        } else {
            player.jumpBufferCounter = 6; // Buffers jump input for 6 frames
        }
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        keys.ArrowDown = true;
        keys.KeyS = true;
        if (!gameRunning) {
            startGame();
        }
    }
    if (e.code === 'KeyX') {
        keys.KeyX = true;
        if (!gameRunning) {
            startGame();
        } else if (player.attackTimer <= 0) {
            player.attackTimer = 16;
            playSound('slash');
            spawnParticles(player.x + (player.facingRight ? player.width + 10 : -10), player.y + player.height / 2, '#5dade2', 6, 0.8);
        }
    }
    if (e.code in keys) {
        keys[e.code] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyZ' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        keys.KeyZ = false;
        keys.ArrowUp = false;
        keys.KeyW = false;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        keys.ArrowDown = false;
        keys.KeyS = false;
    }
    if (e.code in keys) {
        keys[e.code] = false;
    }
});

// Canvas touch/click (fallback)
canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    initAudio();
    if (!gameRunning) {
        startGame();
    } else if (player.grounded) {
        player.vy = JUMP_STRENGTH;
        player.grounded = false;
        playSound('jump');
        spawnJumpParticles(player.x + player.width / 2, player.y + player.height);
    }
});

// Helper to check touch device
function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// Touch Device setup
if (isTouchDevice()) {
    const container = document.getElementById('game-container');
    if (container) {
        container.classList.add('touch-device');
    }
    
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const btnJump = document.getElementById('btn-jump');
    const btnAttack = document.getElementById('btn-attack');
    
    if (btnLeft) {
        btnLeft.addEventListener('touchstart', (e) => {
            e.preventDefault();
            initAudio();
            keys.ArrowLeft = true;
            if (!gameRunning) startGame();
        });
        btnLeft.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys.ArrowLeft = false;
        });
        btnLeft.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys.ArrowLeft = false;
        });
    }
    
    if (btnRight) {
        btnRight.addEventListener('touchstart', (e) => {
            e.preventDefault();
            initAudio();
            keys.ArrowRight = true;
            if (!gameRunning) startGame();
        });
        btnRight.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys.ArrowRight = false;
        });
        btnRight.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys.ArrowRight = false;
        });
    }

    if (btnUp) {
        btnUp.addEventListener('touchstart', (e) => {
            e.preventDefault();
            initAudio();
            keys.ArrowUp = true;
            keys.KeyW = true;
            if (!gameRunning) {
                startGame();
            } else {
                player.jumpBufferCounter = 6;
            }
        });
        btnUp.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys.ArrowUp = false;
            keys.KeyW = false;
        });
        btnUp.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys.ArrowUp = false;
            keys.KeyW = false;
        });
    }

    if (btnDown) {
        btnDown.addEventListener('touchstart', (e) => {
            e.preventDefault();
            initAudio();
            keys.ArrowDown = true;
            keys.KeyS = true;
            if (!gameRunning) startGame();
        });
        btnDown.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys.ArrowDown = false;
            keys.KeyS = false;
        });
        btnDown.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys.ArrowDown = false;
            keys.KeyS = false;
        });
    }
    
    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            initAudio();
            keys.KeyZ = true;
            if (!gameRunning) {
                startGame();
            } else {
                player.jumpBufferCounter = 6;
            }
        });
        btnJump.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys.KeyZ = false;
        });
        btnJump.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys.KeyZ = false;
        });
    }

    if (btnAttack) {
        btnAttack.addEventListener('touchstart', (e) => {
            e.preventDefault();
            initAudio();
            keys.KeyX = true;
            if (!gameRunning) {
                startGame();
            } else if (player.attackTimer <= 0) {
                player.attackTimer = 16;
                playSound('slash');
                spawnParticles(player.x + (player.facingRight ? player.width + 10 : -10), player.y + player.height / 2, '#5dade2', 6, 0.8);
            }
        });
        btnAttack.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys.KeyX = false;
        });
        btnAttack.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys.KeyX = false;
        });
    }

    // Window-wide backup to release controls immediately on any finger lift
    window.addEventListener('touchend', () => {
        keys.ArrowLeft = false;
        keys.ArrowRight = false;
        keys.ArrowUp = false;
        keys.ArrowDown = false;
        keys.KeyW = false;
        keys.KeyS = false;
        keys.KeyZ = false;
        keys.KeyX = false;
    });
    window.addEventListener('touchcancel', () => {
        keys.ArrowLeft = false;
        keys.ArrowRight = false;
        keys.ArrowUp = false;
        keys.ArrowDown = false;
        keys.KeyW = false;
        keys.KeyS = false;
        keys.KeyZ = false;
        keys.KeyX = false;
    });
}

// Particles
function spawnParticles(x, y, color, count = 10, speedMultiplier = 1) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 5 * speedMultiplier,
            vy: (Math.random() - 0.5) * 5 * speedMultiplier - 1,
            radius: Math.random() * 3 + 1,
            color: color,
            alpha: 1,
            decay: 0.02 + Math.random() * 0.03
        });
    }
}

function spawnJumpParticles(x, y) {
    for (let i = 0; i < 6; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 16,
            y: y,
            vx: (Math.random() - 0.5) * 3,
            vy: -Math.random() * 1.5,
            radius: Math.random() * 4 + 2,
            color: 'rgba(236, 240, 241, 0.4)',
            alpha: 0.8,
            decay: 0.04
        });
    }
}

function triggerFloatingText(x, y, text, color) {
    floatingTexts.push({
        x: x,
        y: y,
        text: text,
        color: color,
        vy: -0.8,
        alpha: 1,
        life: 45
    });
}

function update() {
    if (!gameRunning) return;

    // Detect first input to start scrolling
    if (!firstMoveMade && (
        keys.ArrowLeft || keys.ArrowRight || 
        keys.ArrowUp || keys.ArrowDown || 
        keys.KeyW || keys.KeyS || 
        keys.KeyZ || keys.KeyX || 
        player.jumpBufferCounter > 0
    )) {
        firstMoveMade = true;
    }

    // Handle hit freeze frames (stops physics update but allows drawing)
    if (freezeTimer > 0) {
        freezeTimer--;
        return;
    }

    if (player.invulnerable > 0) {
        player.invulnerable--;
    }

    if (player.attackTimer > 0) {
        player.attackTimer--;
    }

    // coyote time and jump buffer counters
    if (player.coyoteCounter > 0) {
        player.coyoteCounter--;
    }
    if (player.jumpBufferCounter > 0) {
        player.jumpBufferCounter--;
    }

    // Horizontal controls
    let moveX = 0;
    if (keys.ArrowLeft) {
        moveX -= MOVE_SPEED;
        player.facingRight = false;
    }
    if (keys.ArrowRight) {
        moveX += MOVE_SPEED;
        player.facingRight = true;
    }
    player.vx = moveX;
    player.x += player.vx;

    // Keep player from going off-screen to the left
    if (player.x < camera.x) {
        player.x = camera.x;
    }

    if (player.vx !== 0) {
        player.walkCycle += 0.18;
    } else {
        player.walkCycle = 0;
    }

    // Apply gravity
    player.vy += GRAVITY;
    player.y += player.vy;

    // Process Jump with Coyote Time & Jump Buffering
    if (player.grounded) {
        player.coyoteCounter = 6; // 6 frames of grace period off edge
    }

    if (player.jumpBufferCounter > 0 && (player.grounded || player.coyoteCounter > 0)) {
        player.vy = JUMP_STRENGTH;
        player.grounded = false;
        player.coyoteCounter = 0;
        player.jumpBufferCounter = 0;
        playSound('jump');
        spawnJumpParticles(player.x + player.width / 2, player.y + player.height);
    }

    // Camera tracking & screen shake decay
    camera.targetX = player.x - canvas.width / 3;
    camera.x += (camera.targetX - camera.x) * 0.08;

    camera.targetY = player.y - canvas.height / 2;
    camera.y += (camera.targetY - camera.y) * 0.08;

    if (camera.shakeTimer > 0) {
        camera.shakeTimer--;
    }

    // Platform logic
    let onAnyPlatform = false;

    steps.forEach(p => {

        // Shifting platform logic
        if (p.type === 'shifting') {
            p.shiftTime += 0.025;
            let offset = Math.sin(p.shiftTime) * p.shiftRange;
            let oldX = p.x;
            p.x = p.startX + offset;

            if (player.grounded && player.y + player.height === p.y && player.x + player.width > oldX && player.x < oldX + p.width) {
                player.x += (p.x - oldX);
            }
        }

        // Platform landing check
        let isDropping = keys.ArrowDown || keys.KeyS;
        if (!isDropping && player.x + player.width > p.x && player.x < p.x + p.width) {
            if (
                player.y + player.height >= p.y &&
                player.y + player.height - player.vy <= p.y + 10 &&
                player.vy >= 0 &&
                p.opacity > 0.1
            ) {
                player.y = p.y - player.height;
                player.vy = 0;
                player.grounded = true;
                onAnyPlatform = true;

                if (p.type === 'bouncy') {
                    player.vy = JUMP_STRENGTH * 1.55;
                    player.grounded = false;
                    playSound('jump');
                    spawnParticles(p.x + p.width / 2, p.y, '#2ecc71', 12, 1.5);
                    triggerFloatingText(p.x + p.width / 2, p.y - 20, 'BOOST!', '#2ecc71');
                }
            }
        }

        // Spiky cosmic enemy logic
        if (p.hasEnemy && p.enemyActive) {
            p.enemyAnim += 0.05;
            let enemyX = p.x + p.width / 2;
            let enemyY = p.y - 25 + Math.sin(p.enemyAnim * 1.5) * 4;
            let enemyRadius = 13;

            // Check if player attacks the enemy
            if (player.attackTimer > 0) {
                let attackX = player.x + (player.facingRight ? player.width : -40);
                let attackW = 40;
                let attackY = player.y - 5;
                let attackH = player.height + 10;

                if (
                    enemyX + enemyRadius > attackX &&
                    enemyX - enemyRadius < attackX + attackW &&
                    enemyY + enemyRadius > attackY &&
                    enemyY - enemyRadius < attackY + attackH
                ) {
                    p.enemyActive = false; 
                    score += 5; 
                    playSound('hit');
                    freezeTimer = 4; // 4-frame satisfying hit freeze
                    triggerScreenShake(8, 3.5); // Subtle camera shake on hit
                    spawnParticles(enemyX, enemyY, '#e74c3c', 16, 1.3);
                    spawnParticles(enemyX, enemyY, '#f1c40f', 8, 1.0);
                    triggerFloatingText(enemyX, enemyY - 20, 'KILLED! +5', '#5dade2');
                    updateScoreDisplay();
                }
            }

            // Check if enemy hits player
            if (p.enemyActive && player.invulnerable === 0) {
                let px = player.x + player.width / 2;
                let py = player.y + player.height / 2;
                let distToPlayer = Math.hypot(px - enemyX, py - enemyY);

                if (distToPlayer < enemyRadius + 15) {
                    if (player.lives > 1) {
                        player.lives--;
                        updateScoreDisplay();
                        restartOnLifeLost();
                    } else {
                        player.lives = 0;
                        updateScoreDisplay();
                        gameOver();
                    }
                }
            }
        }

        // Coin collection check
        if (p.hasCoin && !p.coinCollected) {
            let coinX = p.x + p.width / 2;
            let coinY = p.y - 26;

            let px = player.x + player.width / 2;
            let py = player.y + player.height / 2;
            let dist = Math.hypot(px - coinX, py - coinY);

            if (dist < 26) {
                p.coinCollected = true;
                score++;
                playSound('coin');
                spawnParticles(coinX, coinY, '#f1c40f', 12);
                triggerFloatingText(coinX, coinY - 10, '+1 Coin', '#f1c40f');
                updateScoreDisplay();
            }
        }
    });

    if (!onAnyPlatform) {
        player.grounded = false;
    }

    // Spawn new steps on scroll
    while (lastStepX < camera.x + canvas.width + 200) {
        spawnNextStep();
    }

    // Filter out steps scrolled off-screen
    steps = steps.filter(p => p.x + p.width > camera.x - 200);

    // Particles/Stars update
    for (let i = particles.length - 1; i >= 0; i--) {
        let pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.alpha -= pt.decay;
        if (pt.alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y += ft.vy;
        ft.alpha -= 0.02;
        ft.life--;
        if (ft.life <= 0 || ft.alpha <= 0) {
            floatingTexts.splice(i, 1);
        }
    }

    if (Math.random() < 0.008 && shootingStars.length < 2) {
        shootingStars.push({
            x: Math.random() * canvas.width * 1.5,
            y: camera.y - Math.random() * 200,
            vx: -8 - Math.random() * 6,
            vy: 4 + Math.random() * 4,
            length: 40 + Math.random() * 40,
            alpha: 1
        });
    }

    for (let i = shootingStars.length - 1; i >= 0; i--) {
        let ss = shootingStars[i];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.alpha -= 0.025;
        if (ss.alpha <= 0) {
            shootingStars.splice(i, 1);
        }
    }

    stars.forEach(star => {
        star.alpha += star.twinkleSpeed;
        if (star.alpha > 1 || star.alpha < 0.1) {
            star.twinkleSpeed = -star.twinkleSpeed;
        }
    });

    // Check fall off condition
    if (player.y > camera.y + canvas.height + 150) {
        // Safe respawn - no life loss or game over
        restartOnLifeLost();
    }
}

function gameOver() {
    gameRunning = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('starryStepperHighScore', highScore);
    }
    updateScoreDisplay();
    showCustomizerScreen(true);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Space Sky Background
    let skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGradient.addColorStop(0, '#04020a');
    skyGradient.addColorStop(0.5, '#0a091d');
    skyGradient.addColorStop(1, '#1b122c');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Nebulae
    nebulae.forEach(n => {
        let px = n.x - camera.x * 0.15;
        let py = n.y - camera.y * 0.15;
        let nebulaGrad = ctx.createRadialGradient(px, py, 10, px, py, n.r);
        nebulaGrad.addColorStop(0, n.color);
        nebulaGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nebulaGrad;
        ctx.beginPath();
        ctx.arc(px, py, n.r, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Starfield
    stars.forEach(star => {
        let factor = 0.05 * star.layer;
        let px = (star.x - camera.x * factor) % (canvas.width * 2);
        let py = (star.y - camera.y * factor) % (canvas.height * 2);

        if (px < 0) px += canvas.width * 2;
        if (py < 0) py += canvas.height * 2;

        if (px < canvas.width && py < canvas.height) {
            ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
            ctx.beginPath();
            ctx.arc(px, py, star.size, 0, Math.PI * 2);
            ctx.fill();

            if (star.size > 1.3) {
                ctx.fillStyle = star.layer === 1 ? 'rgba(52, 152, 219, 0.2)' : 'rgba(241, 196, 15, 0.15)';
                ctx.beginPath();
                ctx.arc(px, py, star.size * 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });

    // Draw Crescent Moon
    let moonX = 680 - camera.x * 0.03;
    let moonY = 80 - camera.y * 0.03;
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 230, 0.25)';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ffffe6';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 32, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#04020a';
    ctx.beginPath();
    ctx.arc(moonX - 12, moonY - 8, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Shooting Stars
    shootingStars.forEach(ss => {
        let px = ss.x - camera.x;
        let py = ss.y - camera.y;
        let grad = ctx.createLinearGradient(px, py, px - ss.vx, py - ss.vy);
        grad.addColorStop(0, `rgba(255, 255, 255, ${ss.alpha})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - ss.vx * 1.5, py - ss.vy * 1.5);
        ctx.stroke();
    });

    // 2. Draw Game Objects relative to Camera Offset (incorporates screen shake)
    ctx.save();
    
    let shakeX = 0;
    let shakeY = 0;
    if (camera.shakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * camera.shakeIntensity;
        shakeY = (Math.random() - 0.5) * camera.shakeIntensity;
    }
    ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

    // Draw Steps
    steps.forEach(p => {
        if (p.opacity <= 0) return;

        ctx.save();
        ctx.globalAlpha = p.opacity;

        let topColor = '#4a90e2';
        let bottomColor = '#1b2a47';
        let outlineColor = 'rgba(74, 144, 226, 0.7)';

        if (p.type === 'bouncy') {
            topColor = '#2ecc71';
            bottomColor = '#145a32';
            outlineColor = 'rgba(46, 204, 113, 0.85)';
        } else if (p.type === 'shifting') {
            topColor = '#f39c12';
            bottomColor = '#784212';
            outlineColor = 'rgba(243, 156, 18, 0.85)';
        }

        let stepGradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.height);
        stepGradient.addColorStop(0, topColor);
        stepGradient.addColorStop(1, bottomColor);
        ctx.fillStyle = stepGradient;

        ctx.beginPath();
        ctx.roundRect(p.x, p.y, p.width, p.height, 5);
        ctx.fill();

        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        if (p.type === 'bouncy') {
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(p.x + 15, p.y - 4, 8, 4);
            ctx.fillRect(p.x + p.width - 23, p.y - 4, 8, 4);
        } else if (p.type === 'shifting') {
            ctx.fillStyle = '#f1c40f';
            ctx.font = '8px sans-serif';
            ctx.fillText('◀', p.x + 4, p.y + 11);
            ctx.fillText('▶', p.x + p.width - 12, p.y + 11);
        }

        // Draw Spiky Enemy
        if (p.hasEnemy && p.enemyActive) {
            let enemyX = p.x + p.width / 2;
            let enemyY = p.y - 25 + Math.sin(p.enemyAnim * 1.5) * 4;
            
            ctx.save();
            ctx.translate(enemyX, enemyY);
            ctx.rotate(p.enemyAnim);

            ctx.fillStyle = '#e74c3c'; 
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                ctx.rotate(Math.PI / 4);
                ctx.lineTo(0, -12); 
                ctx.lineTo(3, -6);  
            }
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-1, -1, 1.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // Draw Coin
        if (p.hasCoin && !p.coinCollected) {
            p.coinAnim += 0.08;
            let coinX = p.x + p.width / 2;
            let coinY = p.y - 26 + Math.sin(p.coinAnim * 1.5) * 3;
            let scaleX = Math.abs(Math.sin(p.coinAnim));

            ctx.save();
            ctx.translate(coinX, coinY);
            ctx.scale(scaleX, 1);
            ctx.shadowColor = '#f1c40f';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(0, 0, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', 0, 0);
            ctx.restore();
        }

        ctx.restore();
    });

    // Draw Particles
    particles.forEach(pt => {
        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Floating Text
    floatingTexts.forEach(ft => {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 12px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    });

    // Draw Character
    if (player.invulnerable === 0 || Math.floor(player.invulnerable / 6) % 2 === 0) {
        ctx.save();
        ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
        if (!player.facingRight) {
            ctx.scale(-1, 1);
        }

        let legCycle = Math.sin(player.walkCycle) * 7;
        let time = Date.now();

        // 1. Shoes
        ctx.fillStyle = '#1e272e';
        ctx.beginPath();
        ctx.roundRect(-8 - (player.vx !== 0 ? legCycle : 0), 14, 6, 5, 1.5);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(2 + (player.vx !== 0 ? legCycle : 0), 14, 6, 5, 1.5);
        ctx.fill();

        // 2. Legs
        ctx.strokeStyle = '#34495e';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-5, 5);
        ctx.lineTo(-5 - (player.vx !== 0 ? legCycle : 0), 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(4, 5);
        ctx.lineTo(4 + (player.vx !== 0 ? legCycle : 0), 15);
        ctx.stroke();

        // 3. Torso
        ctx.fillStyle = player.colorTheme;
        ctx.beginPath();
        ctx.roundRect(-9, -9, 18, 16, 4.5);
        ctx.fill();

        ctx.strokeStyle = '#eceff1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(1.5, -9);
        ctx.lineTo(1.5, 7);
        ctx.stroke();

        // Backpack
        ctx.fillStyle = '#57606f';
        ctx.beginPath();
        ctx.roundRect(-13, -7, 4.5, 12, 1.5);
        ctx.fill();
        ctx.fillStyle = player.grounded ? '#2ecc71' : '#f1c40f';
        ctx.beginPath();
        ctx.arc(-11, -3, 1, 0, Math.PI * 2);
        ctx.fill();

        // 4. Head & Face
        ctx.fillStyle = '#ffe0bd';
        ctx.beginPath();
        ctx.arc(0, -15, 7.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(235, 77, 75, 0.4)';
        ctx.beginPath();
        ctx.arc(3.5, -12, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(4, -15, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(4.4, -15.4, 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(3, -11, 2, 0, Math.PI * 0.85);
        ctx.stroke();

        // 5. Hair/Hat Customizations
        if (player.gender === 'girl') {
            ctx.fillStyle = '#e67e22'; 
            let swayAngle = Math.sin(time / 160 + player.walkCycle) * 0.28;
            if (player.vy < -0.5) swayAngle = 0.45;
            else if (player.vy > 0.5) swayAngle = -0.3;
            
            ctx.save();
            ctx.translate(-7, -13);
            ctx.rotate(-swayAngle);
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-3, 4, 3, 5, Math.PI/6, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(7, -13);
            ctx.rotate(swayAngle);
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(3, 4, 3, 5, -Math.PI/6, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();

            ctx.beginPath();
            ctx.arc(0, -17.5, 8, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(-8, -17, 3.5, 6);
            ctx.fillRect(4.5, -17, 3.5, 6);
            
            ctx.fillStyle = '#ff7675';
            ctx.beginPath();
            ctx.moveTo(-3, -21);
            ctx.lineTo(3, -21);
            ctx.lineTo(0, -18.5);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillStyle = '#2d3436';
            ctx.beginPath();
            ctx.arc(0, -17.5, 8, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(-8, -17, 12, 2.5);

            ctx.strokeStyle = player.colorTheme;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, -16.5, 9, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();

            ctx.fillStyle = player.colorTheme;
            ctx.beginPath();
            ctx.roundRect(-9, -15, 3.5, 6, 1.5);
            ctx.fill();
        }

        // 6. Arms & Sword Swing
        ctx.strokeStyle = player.colorTheme;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        let armX = -9;
        let armY = 1;
        if (player.vy < -1) {
            armX = -11;
            armY = -15;
        } else {
            armX = -9;
            armY = 1 + (player.vx !== 0 ? legCycle * 0.4 : 0);
        }
        ctx.lineTo(armX, armY);
        ctx.stroke();
        ctx.fillStyle = '#eceff1';
        ctx.beginPath();
        ctx.arc(armX, armY, 2.5, 0, Math.PI*2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(6, -6);
        let armX2 = 9;
        let armY2 = 1;
        
        if (player.attackTimer > 0) {
            armX2 = 15;
            armY2 = -3;
        } else if (player.vy < -1) {
            armX2 = 11;
            armY2 = -15;
        } else {
            armX2 = 9;
            armY2 = 1 - (player.vx !== 0 ? legCycle * 0.4 : 0);
        }
        ctx.lineTo(armX2, armY2);
        ctx.stroke();
        ctx.fillStyle = '#eceff1';
        ctx.beginPath();
        ctx.arc(armX2, armY2, 2.5, 0, Math.PI*2);
        ctx.fill();

        if (player.attackTimer > 0) {
            ctx.save();
            ctx.translate(armX2, armY2);
            ctx.rotate(-Math.PI / 4 + (16 - player.attackTimer) * 0.1); 
            
            ctx.shadowColor = '#5dade2';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#ebf5fb';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(18, -18);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#f1c40f'; 
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-4, -4);
            ctx.lineTo(4, 4);
            ctx.stroke();

            ctx.restore();
        }

        ctx.restore();
    }

    ctx.restore();

    // Draw Attack Slash Arc
    if (player.attackTimer > 0 && gameRunning) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.globalAlpha = player.attackTimer / 16;
        ctx.strokeStyle = 'rgba(93, 173, 226, 0.7)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        
        let slashX = player.x + player.width / 2;
        let slashY = player.y + player.height / 2;
        
        if (player.facingRight) {
            ctx.arc(slashX, slashY, 38, -Math.PI / 3, Math.PI / 3);
        } else {
            ctx.arc(slashX, slashY, 38, Math.PI * (2/3), Math.PI * (4/3));
        }
        ctx.stroke();
        ctx.restore();
    }

    // Onscreen Instructions Panel (only on desktop)
    if (!isTouchDevice()) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(15, canvas.height - 48, 335, 34, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '600 11px "Outfit", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🎮 CONTROLS:', 25, canvas.height - 28);
        ctx.fillStyle = '#f1c40f';
        ctx.font = '400 11px "Outfit", sans-serif';
        ctx.fillText('◀/▶ (Move)  |  Z (Jump)  |  X (Sword Attack)', 108, canvas.height - 28);
    }

    requestAnimationFrame(() => {
        update();
        draw();
    });
}

// Set up background objects and initial layout
initBackground();
resetGame();
gameRunning = false; 
gameStarted = false;
showCustomizerScreen(); 

// Begin draw loop
draw();
