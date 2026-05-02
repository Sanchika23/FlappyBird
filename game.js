const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const messageElement = document.getElementById('message');

canvas.width = 800;
canvas.height = 450;

// Game constants
const GRAVITY = 0.25;
const FLAP_STRENGTH = -5;
const INITIAL_PIPE_SPEED = 3.5;
const INITIAL_PIPE_GAP = 170;
const MIN_PIPE_GAP = 110;
const PIPE_SPAWN_RATE = 90;
const BIRD_RADIUS = 15;
const PIPE_WIDTH = 60;

let bird = {
    x: 100,
    y: canvas.height / 2,
    velocity: 0,
    radius: BIRD_RADIUS
};

let pipes = [];
let score = 0;
let highScore = localStorage.getItem('flappyHighScore') || 0;
let frameCount = 0;
let gameRunning = false;
let gameStarted = false;
let currentPipeGap = INITIAL_PIPE_GAP;
let currentPipeSpeed = INITIAL_PIPE_SPEED;

function resetGame() {
    bird.y = canvas.height / 2;
    bird.velocity = 0;
    pipes = [];
    score = 0;
    frameCount = 0;
    currentPipeGap = INITIAL_PIPE_GAP;
    currentPipeSpeed = INITIAL_PIPE_SPEED;
    updateScoreDisplay();
    messageElement.style.display = 'none';
    gameRunning = true;
}

function updateScoreDisplay() {
    scoreElement.innerHTML = `Score: ${score}<br>Best: ${highScore}`;
}

function flap() {
    if (!gameStarted) {
        gameStarted = true;
        resetGame();
    } else if (gameRunning) {
        bird.velocity = FLAP_STRENGTH;
    } else {
        resetGame();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') flap();
});

canvas.addEventListener('mousedown', flap);

function createPipe() {
    const margin = 50; 
    const availableSpace = canvas.height - currentPipeGap - (2 * margin);
    const topHeight = Math.floor(Math.random() * availableSpace) + margin;
    
    pipes.push({
        x: canvas.width,
        top: topHeight,
        bottom: canvas.height - topHeight - currentPipeGap,
        passed: false
    });
}

function drawRoundedRect(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
}

function update() {
    if (!gameRunning) return;

    bird.velocity += GRAVITY;
    bird.y += bird.velocity;

    if (frameCount % PIPE_SPAWN_RATE === 0) {
        createPipe();
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= currentPipeSpeed;

        // Collision detection
        if (
            bird.x + bird.radius > pipes[i].x &&
            bird.x - bird.radius < pipes[i].x + PIPE_WIDTH
        ) {
            if (bird.y - bird.radius < pipes[i].top || bird.y + bird.radius > canvas.height - pipes[i].bottom) {
                gameOver();
            }
        }

        // Score update
        if (!pipes[i].passed && pipes[i].x + PIPE_WIDTH < bird.x) {
            score++;
            
            // Difficulty increase every 15 points
            if (score % 15 === 0) {
                currentPipeGap = Math.max(MIN_PIPE_GAP, currentPipeGap - 15);
                currentPipeSpeed += 0.2;
            }
            
            updateScoreDisplay();
            pipes[i].passed = true;
        }

        if (pipes[i].x + PIPE_WIDTH < 0) {
            pipes.splice(i, 1);
        }
    }

    if (bird.y + bird.radius > canvas.height || bird.y - bird.radius < 0) {
        gameOver();
    }

    frameCount++;
}

function gameOver() {
    gameRunning = false;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappyHighScore', highScore);
    }
    updateScoreDisplay();
    messageElement.innerText = 'Game Over! Press Space/Click to Restart';
    messageElement.style.display = 'block';
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Bird
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Pipes
    pipes.forEach(pipe => {
        drawRoundedRect(pipe.x, 0, PIPE_WIDTH, pipe.top, 10, '#2ecc71');
        drawRoundedRect(pipe.x, canvas.height - pipe.bottom, PIPE_WIDTH, pipe.bottom, 10, '#2ecc71');
    });

    requestAnimationFrame(() => {
        update();
        draw();
    });
}

draw();
