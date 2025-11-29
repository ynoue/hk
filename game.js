const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let lives = 3;
let keys = {};
let currentSeed = 12345;

// Physics constants
const GRAVITY = 0.5;
const FRICTION = 0.8;
const JUMP_FORCE = -12;
const SPEED = 5;

// Camera
const camera = {
    x: 0,
    y: 0
};

// Entities
const player = {
    x: 50,
    y: 200,
    width: 30,
    height: 30,
    velX: 0,
    velY: 0,
    grounded: false,
    jumpCount: 0,
    maxJumps: 2,
    color: '#ff0000' // Red like Mario
};

let platforms = [];
let enemies = [];
let coins = [];
let levelWidth = 0;

// Pseudo-Random Number Generator (Linear Congruential Generator)
class Random {
    constructor(seed) {
        this.seed = seed;
    }

    // Returns a random number between 0 and 1
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    // Returns a random integer between min and max (inclusive)
    range(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// Procedural Level Generation
function generateLevel(seed) {
    const rng = new Random(seed);
    platforms = [];
    enemies = [];
    coins = [];

    // Starting platform (safe zone)
    platforms.push({ x: 0, y: 550, width: 800, height: 50, color: '#654321' });

    let currentX = 800;
    let currentY = 550;
    const levelLength = 100; // Number of "segments" to generate

    for (let i = 0; i < levelLength; i++) {
        // Decide what comes next: Platform, Gap, or Height Change
        const type = rng.next();
        const segmentWidth = rng.range(100, 300);

        if (type < 0.2) {
            // Gap (Pit)
            const gapSize = rng.range(50, 150);
            currentX += gapSize;
            // Add a platform after the gap
            platforms.push({ x: currentX, y: currentY, width: segmentWidth, height: 50, color: '#654321' });
        } else if (type < 0.5) {
            // Change Height
            const heightChange = rng.range(-100, 100);
            currentY += heightChange;
            // Clamp height to keep it playable
            if (currentY < 200) currentY = 200;
            if (currentY > 550) currentY = 550;

            platforms.push({ x: currentX, y: currentY, width: segmentWidth, height: 50, color: '#654321' });
        } else {
            // Flat continuation
            platforms.push({ x: currentX, y: currentY, width: segmentWidth, height: 50, color: '#654321' });
        }

        // Add Enemies?
        if (rng.next() < 0.4) {
            enemies.push({
                x: currentX + segmentWidth / 2,
                y: currentY - 30,
                width: 30,
                height: 30,
                velX: 2,
                type: 'goombox',
                color: '#8B4513',
                startX: currentX,
                endX: currentX + segmentWidth
            });
        }

        // Add Coins?
        if (rng.next() < 0.6) {
            const coinCount = rng.range(1, 3);
            for (let c = 0; c < coinCount; c++) {
                coins.push({
                    x: currentX + 50 + (c * 30),
                    y: currentY - 50 - (c * 10), // Arc or line
                    width: 20,
                    height: 20,
                    collected: false
                });
            }
        }

        currentX += segmentWidth;
    }

    // End Goal
    platforms.push({ x: currentX, y: currentY, width: 200, height: 50, color: '#FFD700' }); // Gold platform
    levelWidth = currentX + 200;

    // Reset Player
    player.x = 50;
    player.y = 200;
    player.velX = 0;
    player.velY = 0;
    player.jumpCount = 0;
}

// Input Handling
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        if (!gameRunning) {
            startGame();
        } else if (player.grounded || player.jumpCount < player.maxJumps) {
            player.velY = JUMP_FORCE;
            player.grounded = false;
            player.jumpCount++;
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Fullscreen
document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const container = document.getElementById('game-container');
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    } else {
        gameRunning = false;
        document.getElementById('final-score').innerText = score;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    function updateUI() {
        document.getElementById('score').innerText = `Puntos: ${score}`;
        document.getElementById('lives').innerText = `Vidas: ${lives}`;
    }

    function checkCollision(rect1, rect2) {
        return (rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y);
    }

    function update() {
        if (!gameRunning) return;

        // Player Movement
        if (keys['ArrowLeft']) {
            if (player.velX > -SPEED) player.velX--;
        }
        if (keys['ArrowRight']) {
            if (player.velX < SPEED) player.velX++;
        }

        player.velX *= FRICTION;
        player.velY += GRAVITY;

        player.x += player.velX;
        player.y += player.velY;

        player.grounded = false;

        // Platform Collisions
        platforms.forEach(platform => {
            if (checkCollision(player, platform)) {
                const prevY = player.y - player.velY;
                if (prevY + player.height <= platform.y) {
                    player.grounded = true;
                    player.jumpCount = 0;
                    player.velY = 0;
                    player.y = platform.y - player.height;
                } else if (prevY >= platform.y + platform.height) {
                    player.velY = 0;
                    player.y = platform.y + platform.height;
                } else {
                    if (player.velX > 0) {
                        player.x = platform.x - player.width;
                        player.velX = 0;
                    } else if (player.velX < 0) {
                        player.x = platform.x + platform.width;
                        player.velX = 0;
                    }
                }
            }
        });

        // Screen boundaries (Left only)
        if (player.x < 0) player.x = 0;

        // Death by falling
        if (player.y > 1000) { // Increased limit for lower platforms
            die();
        }

        // Camera Logic
        // Center player in X
        camera.x = player.x - canvas.width / 3;
        // Clamp camera
        if (camera.x < 0) camera.x = 0;
        if (camera.x > levelWidth - canvas.width) camera.x = levelWidth - canvas.width;

        // Enemies
        enemies.forEach(enemy => {
            // Only update enemies near camera to save performance
            if (enemy.x > camera.x - 100 && enemy.x < camera.x + canvas.width + 100) {
                enemy.x += enemy.velX;

                // Patrol logic
                if (enemy.startX && enemy.endX) {
                    if (enemy.x <= enemy.startX || enemy.x + enemy.width >= enemy.endX) {
                        enemy.velX *= -1;
                    }
                } else {
                    if (enemy.x <= 0) enemy.velX *= -1;
                }

                // Gravity for enemies
                let enemyGrounded = false;
                platforms.forEach(platform => {
                    if (checkCollision(enemy, platform)) {
                        if (enemy.y + enemy.height > platform.y && enemy.y + enemy.height < platform.y + 20) {
                            enemy.y = platform.y - enemy.height;
                            enemyGrounded = true;
                        }
                    }
                });
                if (!enemyGrounded) {
                    enemy.y += GRAVITY;
                }

                // Player vs Enemy
                if (checkCollision(player, enemy)) {
                    const hitFromAbove = player.velY > 0 && (player.y + player.height - player.velY) < enemy.y + enemy.height * 0.5;

                    if (hitFromAbove) {
                        enemy.dead = true;
                        player.velY = -8;
                        score += 100;
                        updateUI();
                    } else {
                        die();
                    }
                }
            }
        });

        enemies = enemies.filter(e => !e.dead);

        // Coins
        coins.forEach(coin => {
            if (!coin.collected && checkCollision(player, coin)) {
                coin.collected = true;
                score += 10;
                updateUI();
            }
        });
    }

    function die() {
        lives--;
        updateUI();
        if (lives > 0) {
            // Respawn at start (or could add checkpoints)
            player.x = 50;
            player.y = 200;
            player.velX = 0;
            player.velY = 0;
            // Reset camera
            camera.x = 0;
        } else {
            gameOver();
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = '#5c94fc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // Draw Platforms
        platforms.forEach(platform => {
            // Optimization: Only draw visible platforms
            if (platform.x + platform.width > camera.x && platform.x < camera.x + canvas.width) {
                ctx.fillStyle = platform.color;
                ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
                ctx.strokeStyle = '#000';
                ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
            }
        });

        // Draw Coins
        coins.forEach(coin => {
            if (!coin.collected && coin.x + coin.width > camera.x && coin.x < camera.x + canvas.width) {
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(coin.x + coin.width / 2, coin.y + coin.height / 2, coin.width / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#DAA520';
                ctx.stroke();
            }
        });

        // Draw Enemies
        enemies.forEach(enemy => {
            if (enemy.x + enemy.width > camera.x && enemy.x < camera.x + canvas.width) {
                ctx.fillStyle = enemy.color;
                ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);

                ctx.fillStyle = '#fff';
                ctx.fillRect(enemy.x + 5, enemy.y + 5, 8, 8);
                ctx.fillRect(enemy.x + 17, enemy.y + 5, 8, 8);
                ctx.fillStyle = '#000';
                ctx.fillRect(enemy.x + 7, enemy.y + 7, 4, 4);
                ctx.fillRect(enemy.x + 19, enemy.y + 7, 4, 4);
            }
        });

        // Draw Player
        if (gameRunning) {
            ctx.fillStyle = player.color;
            ctx.fillRect(player.x, player.y, player.width, player.height);
            ctx.fillStyle = '#FFDAB9';
            // Face direction
            if (player.velX >= 0) {
                ctx.fillRect(player.x + 15, player.y + 5, 10, 15);
            } else {
                ctx.fillRect(player.x + 5, player.y + 5, 10, 15);
            }
        }

        ctx.restore();
    }

    function loop() {
        if (gameRunning) {
            update();
            draw();
            requestAnimationFrame(loop);
        }
    }

    // Initial draw
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
