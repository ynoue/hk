// copyright 2025 avellaneda alejandro
// info@tudexnetworks.com


const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- AUDIO SYSTEM (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const sfx = {
    jump: () => playTone(150, 'square', 0.1, 300),
    coin: () => playTone(600, 'sine', 0.1, 1200),
    stomp: () => playTone(100, 'sawtooth', 0.1, 50),
    hit: () => playTone(100, 'sawtooth', 0.3, 50),
    powerup: () => playTone(300, 'sine', 0.3, 600, true),
    win: () => playMelody([{ f: 523, d: 0.1 }, { f: 659, d: 0.1 }, { f: 783, d: 0.1 }, { f: 1046, d: 0.4 }]),
    die: () => playMelody([{ f: 300, d: 0.1 }, { f: 200, d: 0.1 }, { f: 100, d: 0.4 }])
};

function playTone(freq, type, duration, endFreq = null, slide = false) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (endFreq) {
        if (slide) osc.frequency.linearRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
        else osc.frequency.setValueAtTime(endFreq, audioCtx.currentTime + duration * 0.8);
    }
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playMelody(notes) {
    let time = audioCtx.currentTime;
    notes.forEach(note => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(note.f, time);
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + note.d);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(time);
        osc.stop(time + note.d);
        time += note.d;
    });
}

// --- GAME STATE ---
let gameRunning = false;
let gamePaused = false;
let score = 0;
let lives = 3;
let keys = {};
let currentSeed = 12345;
let time = 0; // Global time for animations
let stamina = 15; // Max 15 seconds
const MAX_STAMINA = 15;

// Physics
const GRAVITY = 0.5;
const FRICTION = 0.8;
const JUMP_FORCE = -12;
const SPEED = 5;

// Camera
const camera = { x: 0, y: 0 };

// Entities
const player = {
    x: 50, y: 200, width: 30, height: 30,
    velX: 0, velY: 0,
    grounded: false, jumpCount: 0, maxJumps: 2,
    color: '#ff0000',
    isBig: false,
    invulnerable: false,
    facingRight: true,
    scaleX: 1, scaleY: 1 // Squash and stretch
};

let platforms = [];
let enemies = [];
let coins = [];
let powerups = [];
let particles = [];
let levelWidth = 0;
let clouds = [];
let mountains = []; // Parallax background
let knives = []; // Projectiles
let lastFpsTime = performance.now();
let frames = 0;

// --- PARTICLES ---
class Particle {
    constructor(x, y, color, speed, size, type = 'square') {
        this.x = x; this.y = y;
        this.color = color;
        this.size = size;
        this.velX = (Math.random() - 0.5) * speed;
        this.velY = (Math.random() - 0.5) * speed;
        this.life = 1.0;
        this.type = type;
    }
    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.life -= 0.03;
        this.velY += 0.1; // Gravity
    }
    draw(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        if (this.type === 'circle') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }
        ctx.globalAlpha = 1.0;
    }
}

class Knife {
    constructor(x, y, dir) {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 6;
        this.speed = 12;
        this.dir = dir; // 1 = right, -1 = left
    }
    update() {
        this.x += this.speed * this.dir;
    }
    draw(ctx) {
        ctx.fillStyle = '#00ffff'; // Cyan ninja color
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

function spawnParticles(x, y, color, count = 5, type = 'square') {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, 5, Math.random() * 4 + 2, type));
    }
}

// --- PROCEDURAL GENERATION ---
class Random {
    constructor(seed) { this.seed = seed; }
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
    range(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
}

function generateLevel(seed) {
    const rng = new Random(seed);
    platforms = []; enemies = []; coins = []; powerups = []; clouds = []; mountains = [];

    // Background Generation
    for (let i = 0; i < 20; i++) {
        mountains.push({
            x: rng.range(-500, 5000),
            y: 600,
            width: rng.range(300, 800),
            height: rng.range(200, 400),
            color: `hsl(${rng.range(200, 220)}, 30%, ${rng.range(20, 40)}%)`
        });
    }
    for (let i = 0; i < 50; i++) {
        clouds.push({
            x: rng.range(0, 5000),
            y: rng.range(50, 300),
            size: rng.range(30, 60),
            speed: rng.next() * 0.5 + 0.1
        });
    }

    // Level Generation
    platforms.push({ x: 0, y: 550, width: 800, height: 50, type: 'ground' });

    let currentX = 800;
    let currentY = 550;
    const levelLength = 100;

    for (let i = 0; i < levelLength; i++) {
        const type = rng.next();
        const segmentWidth = rng.range(100, 300);

        if (type < 0.2) { // Gap
            currentX += rng.range(50, 150);
            platforms.push({ x: currentX, y: currentY, width: segmentWidth, height: 50, type: 'ground' });
        } else if (type < 0.5) { // Height Change
            currentY += rng.range(-100, 100);
            if (currentY < 200) currentY = 200;
            if (currentY > 550) currentY = 550;
            platforms.push({ x: currentX, y: currentY, width: segmentWidth, height: 50, type: 'ground' });
        } else { // Flat
            platforms.push({ x: currentX, y: currentY, width: segmentWidth, height: 50, type: 'ground' });
        }

        if (rng.next() < 0.4) {
            enemies.push({
                x: currentX + segmentWidth / 2, y: currentY - 30,
                width: 30, height: 30, velX: 2,
                type: 'goombox', startX: currentX, endX: currentX + segmentWidth,
                offset: rng.next() * Math.PI * 2 // Animation offset
            });
        }

        if (rng.next() < 0.6) {
            const coinCount = rng.range(1, 3);
            for (let c = 0; c < coinCount; c++) {
                coins.push({
                    x: currentX + 50 + (c * 30),
                    y: currentY - 50 - (c * 10),
                    width: 20, height: 20, collected: false,
                    offset: c // Animation offset
                });
            }
        }

        if (rng.next() < 0.05) {
            powerups.push({
                x: currentX + segmentWidth / 2,
                y: currentY - 40,
                width: 30, height: 30,
                type: 'mushroom',
                collected: false
            });
        }

        currentX += segmentWidth;
    }

    platforms.push({ x: currentX, y: currentY, width: 100, height: 50, type: 'goal' });
    levelWidth = currentX + 100;

    player.x = 50; player.y = 200; player.velX = 0; player.velY = 0;
    player.jumpCount = 0; player.isBig = false; player.width = 30; player.height = 30;
}

// --- INPUT ---
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        if (!gameRunning) {
            startGame();
        } else if (gamePaused) {
            togglePause();
        } else if (player.grounded || player.jumpCount < player.maxJumps) {
            player.velY = JUMP_FORCE;
            player.grounded = false;
            player.jumpCount++;
            player.scaleX = 0.7; // Squash
            player.scaleY = 1.3; // Stretch
            sfx.jump();
            spawnParticles(player.x + player.width / 2, player.y + player.height, '#fff', 5, 'circle');
        }
    }
    if (e.code === 'KeyZ' && player.isBig) {
        const dir = player.facingRight ? 1 : -1;
        const knifeX = player.facingRight ? player.x + player.width : player.x - 20;
        const knifeY = player.y + player.height / 2 - 3;
        knives.push(new Knife(knifeX, knifeY, dir));
        sfx.powerup(); // Reuse powerup sound for shoot
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameRunning) togglePause();
    }
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

document.getElementById('start-btn')?.addEventListener('click', startGame);
// Botón para abrir el tutorial desde la pantalla de inicio
document.getElementById('tutorial-btn')?.addEventListener('click', () => {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('tutorial-screen').classList.remove('hidden');
});
// Botón de continuar desde el tutorial
document.getElementById('continue-tutorial-btn')?.addEventListener('click', () => {
    document.getElementById('tutorial-screen').classList.add('hidden');
    // Mostrar el contenedor del juego y ocultar la pantalla de inicio
    document.getElementById('game-container').classList.remove('hidden');
    startGame();
});
// Botón de volver al inicio desde el tutorial
document.getElementById('back-to-start-btn')?.addEventListener('click', () => {
    document.getElementById('tutorial-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
});

document.getElementById('restart-btn')?.addEventListener('click', startGame);
document.getElementById('restart-btn-pause')?.addEventListener('click', () => { togglePause(); startGame(); });
document.getElementById('resume-btn')?.addEventListener('click', togglePause);
document.getElementById('next-level-btn')?.addEventListener('click', startGame);
document.getElementById('pause-btn')?.addEventListener('click', togglePause);
document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
    const c = document.getElementById('game-container');
    !document.fullscreenElement ? c.requestFullscreen() : document.exitFullscreen();
});

function togglePause() {
    if (!gameRunning) return;
    gamePaused = !gamePaused;
    const pauseScreen = document.getElementById('pause-screen');
    gamePaused ? pauseScreen.classList.remove('hidden') : (pauseScreen.classList.add('hidden'), loop());
}

function startGame() {
    if (gameRunning && !gamePaused) return;
    gameRunning = true;
    gamePaused = false;
    const randomSeed = Math.floor(Math.random() * 1000000);
    currentSeed = randomSeed;
    console.log("🌱 SEMILLA:", currentSeed);
    score = 0; lives = 3; time = 0;
    updateUI();
    // Ocultar todas las pantallas y mostrar el contenedor del juego
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('game-container').classList.remove('hidden');
    generateLevel(currentSeed);
    loop();
}

function gameOver() {
    gameRunning = false;
    sfx.die();
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

function levelComplete() {
    gameRunning = false;
    sfx.win();
    document.getElementById('win-score').innerText = score;
    document.getElementById('win-screen').classList.remove('hidden');
}

function updateUI() {
    document.getElementById('score').innerText = `Puntos: ${score}`;
    document.getElementById('lives').innerText = `Vidas: ${lives}`;
}

function checkCollision(r1, r2) {
    return (r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height && r1.y + r1.height > r2.y);
}

function update() {
    if (!gameRunning) return;
    time++;

    // Movement
    let isSprinting = (keys['ShiftLeft'] || keys['ShiftRight']);

    // Stamina Logic
    if (isSprinting && stamina > 0) {
        stamina -= 1 / 60; // Decrease by 1 sec every 60 frames (approx)
    } else {
        isSprinting = false; // Cannot sprint if no stamina
        if (stamina < MAX_STAMINA) {
            stamina += 1 / 60; // Recharge
        }
    }
    // Clamp stamina
    if (stamina < 0) stamina = 0;
    if (stamina > MAX_STAMINA) stamina = MAX_STAMINA;

    // Update Stamina Bar
    const staminaBar = document.getElementById('stamina-bar');
    if (staminaBar) {
        staminaBar.style.width = `${(stamina / MAX_STAMINA) * 100}%`;
    }

    const accel = isSprinting ? 1.5 : 1;
    const currentMaxSpeed = isSprinting ? SPEED * 1.5 : SPEED;

    if (keys['ArrowLeft']) {
        if (player.velX > -currentMaxSpeed) player.velX -= accel;
        player.facingRight = false;
    }
    if (keys['ArrowRight']) {
        if (player.velX < currentMaxSpeed) player.velX += accel;
        player.facingRight = true;
    }

    player.velX *= FRICTION;
    player.velY += GRAVITY;
    player.x += player.velX;
    player.y += player.velY;
    player.grounded = false;

    // Squash & Stretch Recovery
    player.scaleX += (1 - player.scaleX) * 0.1;
    player.scaleY += (1 - player.scaleY) * 0.1;

    // Platforms
    platforms.forEach(platform => {
        if (checkCollision(player, platform)) {
            if (platform.type === 'goal') { levelComplete(); return; }
            const prevY = player.y - player.velY;
            if (prevY + player.height <= platform.y) {
                player.grounded = true;
                player.jumpCount = 0;
                player.velY = 0;
                player.y = platform.y - player.height;
                // Landing squash
                if (player.velY > 5) { player.scaleX = 1.3; player.scaleY = 0.7; }
            } else if (prevY >= platform.y + platform.height) {
                player.velY = 0; player.y = platform.y + platform.height;
            } else {
                if (player.velX > 0) { player.x = platform.x - player.width; player.velX = 0; }
                else if (player.velX < 0) { player.x = platform.x + platform.width; player.velX = 0; }
            }
        }
    });

    if (player.x < 0) player.x = 0;
    if (player.y > 1000) die();

    camera.x += (player.x - canvas.width / 3 - camera.x) * 0.1; // Smooth camera X
    if (camera.x < 0) camera.x = 0;
    if (camera.x > levelWidth - canvas.width) camera.x = levelWidth - canvas.width;

    // Camera Y (Vertical Follow)
    let targetY = player.y - canvas.height / 2;
    // Clamp Y to not show too much below ground (ground is approx at 550-600)
    if (targetY > 200) targetY = 200; // Limit bottom view
    if (targetY < -200) targetY = -200; // Limit top view (optional)
    camera.y += (targetY - camera.y) * 0.1;

    enemies.forEach(enemy => {
        if (enemy.x > camera.x - 100 && enemy.x < camera.x + canvas.width + 100) {
            enemy.x += enemy.velX;
            if (enemy.startX && enemy.endX) {
                if (enemy.x <= enemy.startX || enemy.x + enemy.width >= enemy.endX) enemy.velX *= -1;
            }
            let eg = false;
            platforms.forEach(p => {
                if (checkCollision(enemy, p)) {
                    if (enemy.y + enemy.height > p.y && enemy.y + enemy.height < p.y + 20) {
                        enemy.y = p.y - enemy.height; eg = true;
                    }
                }
            });
            if (!eg) enemy.y += GRAVITY;

            if (checkCollision(player, enemy)) {
                const hitFromAbove = player.velY > 0 && (player.y + player.height - player.velY) < enemy.y + enemy.height * 0.5;
                if (hitFromAbove) {
                    enemy.dead = true; player.velY = -8; score += 100; sfx.stomp();
                    spawnParticles(enemy.x, enemy.y, '#8B4513', 10); updateUI();
                } else { takeDamage(); }
            }
        }
    });
    enemies = enemies.filter(e => !e.dead);

    coins.forEach(coin => {
        if (!coin.collected && checkCollision(player, coin)) {
            coin.collected = true; score += 10; sfx.coin();
            spawnParticles(coin.x, coin.y, '#FFD700', 5, 'circle'); updateUI();
        }
    });

    powerups.forEach(p => {
        if (!p.collected && checkCollision(player, p)) {
            p.collected = true;
            if (p.type === 'mushroom') {
                player.isBig = true; player.width = 40; player.height = 50; player.y -= 20;
                sfx.powerup(); spawnParticles(player.x, player.y, '#ff0000', 20);
            }
        }
    });

    particles.forEach(p => p.update());
    particles = particles.filter(p => p.life > 0);

    // Knives logic
    knives.forEach(k => k.update());
    knives = knives.filter(k => k.x > camera.x - 100 && k.x < camera.x + canvas.width + 100);

    // Knife collisions
    enemies.forEach(enemy => {
        knives.forEach((k, ki) => {
            if (checkCollision(k, enemy)) {
                enemy.dead = true;
                knives.splice(ki, 1);
                score += 100;
                sfx.stomp();
                spawnParticles(enemy.x, enemy.y, '#8B4513', 10);
                updateUI();
            }
        });
    });
}

function takeDamage() {
    if (player.invulnerable) return;
    if (player.isBig) {
        player.isBig = false; player.width = 30; player.height = 30; player.invulnerable = true;
        sfx.hit(); setTimeout(() => player.invulnerable = false, 1000);
    } else { die(); }
}

function die() {
    lives--; updateUI();
    if (lives > 0) {
        player.x = 50; player.y = 200; player.velX = 0; player.velY = 0;
        player.isBig = false; player.width = 30; player.height = 30;
        camera.x = 0; sfx.die();
    } else { gameOver(); }
}

// --- RENDERING ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Sky Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#4facfe');
    gradient.addColorStop(1, '#00f2fe');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // 2. Parallax Background (Mountains)
    ctx.translate(-camera.x * 0.2, 0); // Move slower
    mountains.forEach(m => {
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + m.width / 2, m.y - m.height);
        ctx.lineTo(m.x + m.width, m.y);
        ctx.fill();
    });
    ctx.restore();

    ctx.save();
    // 3. Parallax Clouds
    ctx.translate(-camera.x * 0.5, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    clouds.forEach(c => {
        const x = (c.x - time * c.speed) % (levelWidth * 2); // Loop clouds
        ctx.beginPath();
        ctx.arc(x, c.y, c.size, 0, Math.PI * 2);
        ctx.arc(x + c.size * 0.8, c.y - c.size * 0.5, c.size * 0.9, 0, Math.PI * 2);
        ctx.arc(x + c.size * 1.6, c.y, c.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 4. Platforms with Grass
    platforms.forEach(p => {
        if (p.x + p.width > camera.x && p.x < camera.x + canvas.width) {
            if (p.type === 'goal') {
                ctx.shadowBlur = 20; ctx.shadowColor = '#FFD700';
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(p.x, p.y, p.width, p.height);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#000'; ctx.font = 'bold 20px Arial';
                ctx.fillText("META", p.x + 20, p.y + 30);
            } else {
                // Dirt
                ctx.fillStyle = '#654321';
                ctx.fillRect(p.x, p.y, p.width, p.height);
                // Grass Top
                ctx.fillStyle = '#32CD32';
                ctx.fillRect(p.x, p.y, p.width, 10);
                // Grass details
                ctx.fillStyle = '#228B22';
                for (let i = 0; i < p.width; i += 15) {
                    ctx.beginPath();
                    ctx.moveTo(p.x + i, p.y);
                    ctx.lineTo(p.x + i + 5, p.y + 5);
                    ctx.lineTo(p.x + i + 10, p.y);
                    ctx.fill();
                }
            }
        }
    });

    // 5. Coins with Glow and Bobbing
    coins.forEach(c => {
        if (!c.collected && c.x + c.width > camera.x && c.x < camera.x + canvas.width) {
            const bobY = Math.sin(time * 0.1 + c.offset) * 5;
            ctx.shadowBlur = 15; ctx.shadowColor = '#FFD700';
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(c.x + c.width / 2, c.y + c.height / 2 + bobY, c.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(c.x + c.width / 2 - 3, c.y + c.height / 2 + bobY - 3, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 6. Powerups
    powerups.forEach(p => {
        if (!p.collected && p.x + p.width > camera.x && p.x < camera.x + canvas.width) {
            ctx.shadowBlur = 10; ctx.shadowColor = '#ff0000';
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width / 2, 0, Math.PI, true);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.fillRect(p.x + 5, p.y + p.height / 2, 20, 15);
            ctx.beginPath(); ctx.arc(p.x + p.width / 2, p.y + 10, 5, 0, Math.PI * 2); ctx.fill();
        }
    });

    // 7. Enemies with Animation
    enemies.forEach(e => {
        if (e.x + e.width > camera.x && e.x < camera.x + canvas.width) {
            const squash = Math.sin(time * 0.2 + e.offset) * 2;
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(e.x - squash / 2, e.y + squash, e.width + squash, e.height - squash);
            ctx.fillStyle = '#fff'; // Eyes
            ctx.beginPath();
            if (e.velX > 0) {
                ctx.arc(e.x + 20, e.y + 10 + squash, 5, 0, Math.PI * 2);
                ctx.arc(e.x + 28, e.y + 10 + squash, 5, 0, Math.PI * 2);
            } else {
                ctx.arc(e.x + 2, e.y + 10 + squash, 5, 0, Math.PI * 2);
                ctx.arc(e.x + 10, e.y + 10 + squash, 5, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.fillStyle = '#000'; // Pupils
            if (e.velX > 0) {
                ctx.fillRect(e.x + 22, e.y + 10 + squash, 2, 2);
                ctx.fillRect(e.x + 30, e.y + 10 + squash, 2, 2);
            } else {
                ctx.fillRect(e.x + 4, e.y + 10 + squash, 2, 2);
                ctx.fillRect(e.x + 12, e.y + 10 + squash, 2, 2);
            }
        }
    });

    // Particles
    particles.forEach(p => p.draw(ctx));

    // Knives
    knives.forEach(k => k.draw(ctx));

    // 8. Player with Squash & Stretch
    if (gameRunning) {
        if (player.invulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            // Blink effect
        } else {
            const cx = player.x + player.width / 2;
            const cy = player.y + player.height;

            ctx.translate(cx, cy);
            ctx.scale(player.scaleX, player.scaleY);
            ctx.translate(-cx, -cy);

            // Body
            ctx.fillStyle = player.color;
            ctx.fillRect(player.x, player.y, player.width, player.height);
            // Overalls
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(player.x, player.y + player.height * 0.6, player.width, player.height * 0.4);
            // Buttons
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(player.x + 8, player.y + player.height * 0.7, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(player.x + player.width - 8, player.y + player.height * 0.7, 3, 0, Math.PI * 2); ctx.fill();

            // Face
            ctx.fillStyle = '#FFDAB9';
            if (player.facingRight) {
                ctx.fillRect(player.x + 10, player.y + 5, 18, 15);
                ctx.fillStyle = '#000'; // Eye
                ctx.fillRect(player.x + 20, player.y + 8, 4, 4);
                // Hat brim
                ctx.fillStyle = '#b22222';
                ctx.fillRect(player.x + 10, player.y, 25, 5);
            } else {
                ctx.fillRect(player.x + 2, player.y + 5, 18, 15);
                ctx.fillStyle = '#000'; // Eye
                ctx.fillRect(player.x + 6, player.y + 8, 4, 4);
                // Hat brim
                ctx.fillStyle = '#b22222';
                ctx.fillRect(player.x - 5, player.y, 25, 5);
            }

            // Reset transform
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    ctx.restore();
}

function loop() {
    if (gameRunning && !gamePaused) {
        update();
        draw();
        requestAnimationFrame(loop);

        // FPS Counter
        frames++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            const fpsEl = document.getElementById('fps');
            if (fpsEl) fpsEl.innerText = `FPS: ${frames}`;
            frames = 0;
            lastFpsTime = now;
        }
    } else if (gamePaused) {
        // Optional: Draw a "PAUSED" text overlay if needed, but we have the HTML screen
    }
}

// Initial draw
ctx.fillStyle = '#4facfe';
ctx.fillRect(0, 0, canvas.width, canvas.height);
