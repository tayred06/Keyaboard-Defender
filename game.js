// ============================================
// KEYBOARD DEFENDER — Game Engine
// ============================================

(() => {
    // --- Constants ---
    const CORNER_COLORS = ['#e94560', '#00d4ff', '#00e676', '#ffd700'];
    const BG_COLOR = '#0f0f1a';
    const GRID_COLOR = 'rgba(255,255,255,0.03)';
    const BASE_RADIUS = 28;
    const ENEMY_RADIUS = 18;
    const HIT_DISTANCE = 36;
    const ENEMY_BASE_SPEED = 50;
    const ENEMY_SPEED_PER_WAVE = 4;
    const ENEMIES_BASE_COUNT = 4;
    const ENEMIES_PER_WAVE = 2;
    const SPAWN_INTERVAL_BASE = 1.4;
    const SPAWN_INTERVAL_MIN = 0.35;
    const SPAWN_INTERVAL_WAVE_REDUCTION = 0.08;
    const WAVE_PAUSE = 3;
    const MAX_LIVES = 5;
    const SCORE_PER_KILL = 10;
    const COMBO_WINDOW = 0.8;
    const COMBO_BONUS = 5;
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const KB_ROWS = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    ];

    // --- Canvas setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    let W, H, centerX, centerY;
    let dpr = window.devicePixelRatio || 1;

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        W = rect.width;
        H = rect.height;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        centerX = W / 2;
        centerY = H / 2;
    }

    // --- Game state ---
    const state = {
        enemies: [],
        particles: [],
        floatingTexts: [],
        score: 0,
        lives: MAX_LIVES,
        wave: 1,
        enemiesLeftInWave: 0,
        spawnTimer: 0,
        wavePauseTimer: 0,
        inWavePause: true,
        waveAnnounceTimer: 0,
        combo: 0,
        comboTimer: 0,
        shakeTimer: 0,
        shakeIntensity: 0,
        gameOver: false,
        running: false,
        lastTimestamp: 0,
        baseHitFlash: 0
    };

    // --- Enemy ---
    class Enemy {
        constructor(corner, letter, speed) {
            this.corner = corner;
            this.letter = letter;
            this.radius = ENEMY_RADIUS;
            this.color = CORNER_COLORS[corner];
            this.alive = true;
            this.opacity = 0;
            this.age = 0;

            const margin = 40;
            switch (corner) {
                case 0: this.x = -margin; this.y = -margin; break;
                case 1: this.x = W + margin; this.y = -margin; break;
                case 2: this.x = W + margin; this.y = H + margin; break;
                case 3: this.x = -margin; this.y = H + margin; break;
            }

            // Add slight random offset to avoid stacking
            this.x += (Math.random() - 0.5) * 60;
            this.y += (Math.random() - 0.5) * 60;

            const angle = Math.atan2(centerY - this.y, centerX - this.x);
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }

        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.age += dt;
            this.opacity = Math.min(1, this.age / 0.3);
        }

        distToCenter() {
            return Math.hypot(this.x - centerX, this.y - centerY);
        }

        draw(ctx) {
            ctx.globalAlpha = this.opacity;

            // Outer glow
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity * 0.15;
            ctx.fill();

            // Body
            ctx.globalAlpha = this.opacity;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = BG_COLOR;
            ctx.fill();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Letter
            ctx.fillStyle = this.color;
            ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.letter, this.x, this.y + 1);

            ctx.globalAlpha = 1;
        }
    }

    // --- Particle ---
    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 140;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.life = 0.4 + Math.random() * 0.4;
            this.maxLife = this.life;
            this.radius = 2 + Math.random() * 3;
            this.color = color;
        }

        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.vx *= 0.97;
            this.vy *= 0.97;
            this.life -= dt;
        }

        draw(ctx) {
            const alpha = Math.max(0, this.life / this.maxLife);
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * alpha, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // --- Floating Text ---
    class FloatingText {
        constructor(x, y, text, color) {
            this.x = x;
            this.y = y;
            this.text = text;
            this.color = color;
            this.life = 0.8;
            this.maxLife = 0.8;
        }

        update(dt) {
            this.y -= 40 * dt;
            this.life -= dt;
        }

        draw(ctx) {
            const alpha = Math.max(0, this.life / this.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.color;
            ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.text, this.x, this.y);
            ctx.globalAlpha = 1;
        }
    }

    // --- Spawning ---
    function getSpawnSpeed() {
        return ENEMY_BASE_SPEED + state.wave * ENEMY_SPEED_PER_WAVE;
    }

    function getSpawnInterval() {
        return Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - state.wave * SPAWN_INTERVAL_WAVE_REDUCTION);
    }

    function getEnemiesPerWave() {
        return ENEMIES_BASE_COUNT + state.wave * ENEMIES_PER_WAVE;
    }

    function randomLetter() {
        return LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }

    function startWave() {
        state.inWavePause = false;
        state.enemiesLeftInWave = getEnemiesPerWave();
        state.spawnTimer = 0;
    }

    function spawnEnemy() {
        const corner = Math.floor(Math.random() * 4);
        const letter = randomLetter();
        const speed = getSpawnSpeed();
        state.enemies.push(new Enemy(corner, letter, speed));
        state.enemiesLeftInWave--;
    }

    // --- Input ---
    function attackLetter(letter) {
        if (state.gameOver || !state.running) return;

        letter = letter.toUpperCase();
        if (letter.length !== 1 || letter < 'A' || letter > 'Z') return;

        // Find the closest enemy to center with this letter
        let closest = null;
        let closestDist = Infinity;

        for (const enemy of state.enemies) {
            if (enemy.letter === letter && enemy.alive) {
                const dist = enemy.distToCenter();
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = enemy;
                }
            }
        }

        if (closest) {
            killEnemy(closest);
        }
    }

    function killEnemy(enemy) {
        enemy.alive = false;

        // Particles
        for (let i = 0; i < 12; i++) {
            state.particles.push(new Particle(enemy.x, enemy.y, enemy.color));
        }

        // Combo
        if (state.comboTimer > 0) {
            state.combo++;
        } else {
            state.combo = 1;
        }
        state.comboTimer = COMBO_WINDOW;

        // Score
        const bonus = state.combo > 1 ? (state.combo - 1) * COMBO_BONUS : 0;
        const points = SCORE_PER_KILL + bonus;
        state.score += points;

        // Floating text
        let text = `+${points}`;
        if (state.combo > 1) text += ` x${state.combo}`;
        state.floatingTexts.push(new FloatingText(enemy.x, enemy.y - 20, text, enemy.color));
    }

    function enemyReachedBase(enemy) {
        state.lives--;
        state.shakeTimer = 0.3;
        state.shakeIntensity = 6;
        state.baseHitFlash = 0.3;

        // Red flash particles
        for (let i = 0; i < 8; i++) {
            state.particles.push(new Particle(centerX, centerY, '#ff0000'));
        }

        if (state.lives <= 0) {
            gameOver();
        }
    }

    // --- Update ---
    function update(dt) {
        if (state.gameOver) return;

        // Wave pause
        if (state.inWavePause) {
            state.wavePauseTimer -= dt;
            state.waveAnnounceTimer = state.wavePauseTimer;
            if (state.wavePauseTimer <= 0) {
                startWave();
            }
            // Still update particles and texts during pause
            updateParticles(dt);
            updateFloatingTexts(dt);
            return;
        }

        // Spawn enemies
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0 && state.enemiesLeftInWave > 0) {
            spawnEnemy();
            state.spawnTimer = getSpawnInterval();
        }

        // Update enemies
        for (const enemy of state.enemies) {
            if (!enemy.alive) continue;
            enemy.update(dt);

            if (enemy.distToCenter() < HIT_DISTANCE) {
                enemy.alive = false;
                enemyReachedBase(enemy);
            }
        }

        // Remove dead enemies
        state.enemies = state.enemies.filter(e => e.alive);

        // Check wave complete
        if (state.enemiesLeftInWave <= 0 && state.enemies.length === 0) {
            state.wave++;
            state.inWavePause = true;
            state.wavePauseTimer = WAVE_PAUSE;
        }

        // Combo timer
        if (state.comboTimer > 0) {
            state.comboTimer -= dt;
            if (state.comboTimer <= 0) state.combo = 0;
        }

        // Shake timer
        if (state.shakeTimer > 0) state.shakeTimer -= dt;
        if (state.baseHitFlash > 0) state.baseHitFlash -= dt;

        updateParticles(dt);
        updateFloatingTexts(dt);
    }

    function updateParticles(dt) {
        for (const p of state.particles) p.update(dt);
        state.particles = state.particles.filter(p => p.life > 0);
    }

    function updateFloatingTexts(dt) {
        for (const t of state.floatingTexts) t.update(dt);
        state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);
    }

    // --- Rendering ---
    function render() {
        ctx.save();

        // Screen shake
        if (state.shakeTimer > 0) {
            const shake = state.shakeIntensity * (state.shakeTimer / 0.3);
            ctx.translate(
                (Math.random() - 0.5) * shake * 2,
                (Math.random() - 0.5) * shake * 2
            );
        }

        // Background
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(-10, -10, W + 20, H + 20);

        // Grid
        drawGrid();

        // Corner indicators
        drawCornerIndicators();

        // Base
        drawBase();

        // Enemies
        for (const enemy of state.enemies) {
            if (enemy.alive) enemy.draw(ctx);
        }

        // Particles
        for (const p of state.particles) p.draw(ctx);

        // Floating texts
        for (const t of state.floatingTexts) t.draw(ctx);

        // HUD
        drawHUD();

        // Wave announcement
        if (state.inWavePause && state.running && !state.gameOver) {
            drawWaveAnnounce();
        }

        ctx.restore();
    }

    function drawGrid() {
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        const gridSize = 50;

        for (let x = gridSize; x < W; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = gridSize; y < H; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    function drawCornerIndicators() {
        const size = 60;
        const alpha = 0.08;
        const positions = [
            [0, 0], [W, 0], [W, H], [0, H]
        ];
        for (let i = 0; i < 4; i++) {
            const [px, py] = positions[i];
            const grad = ctx.createRadialGradient(px, py, 0, px, py, size);
            grad.addColorStop(0, CORNER_COLORS[i]);
            grad.addColorStop(1, 'transparent');
            ctx.globalAlpha = alpha;
            ctx.fillStyle = grad;
            ctx.fillRect(px - size, py - size, size * 2, size * 2);
        }
        ctx.globalAlpha = 1;
    }

    function drawBase() {
        // Outer glow
        const glowRadius = BASE_RADIUS + 20 + Math.sin(Date.now() / 500) * 4;
        const grad = ctx.createRadialGradient(centerX, centerY, BASE_RADIUS, centerX, centerY, glowRadius);
        grad.addColorStop(0, 'rgba(255,255,255,0.1)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Hit flash
        if (state.baseHitFlash > 0) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, BASE_RADIUS + 10, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 0, 0, ${state.baseHitFlash})`;
            ctx.fill();
        }

        // Base circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, BASE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner icon (shield shape)
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛊', centerX, centerY);
    }

    function drawHUD() {
        const pad = 16;

        // Score (top-left)
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score : ${state.score}`, pad, pad);

        // Wave (top-center)
        ctx.textAlign = 'center';
        ctx.fillText(`Vague ${state.wave}`, W / 2, pad);

        // Lives (top-right)
        ctx.textAlign = 'right';
        let livesText = '';
        for (let i = 0; i < MAX_LIVES; i++) {
            livesText += i < state.lives ? '♥' : '♡';
        }
        ctx.fillStyle = state.lives <= 1 ? '#e94560' : '#fff';
        ctx.fillText(livesText, W - pad, pad);

        // Combo indicator
        if (state.combo > 1 && state.comboTimer > 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            ctx.fillText(`Combo x${state.combo}`, W / 2, pad + 28);
        }
    }

    function drawWaveAnnounce() {
        const t = state.waveAnnounceTimer;
        if (t <= 0) return;

        const alpha = Math.min(1, t / (WAVE_PAUSE * 0.5));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Vague ${state.wave}`, centerX, centerY - 70);

        ctx.font = '18px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Préparez-vous...', centerX, centerY - 35);
        ctx.globalAlpha = 1;
    }

    // --- Game lifecycle ---
    function resetState() {
        state.enemies = [];
        state.particles = [];
        state.floatingTexts = [];
        state.score = 0;
        state.lives = MAX_LIVES;
        state.wave = 1;
        state.enemiesLeftInWave = 0;
        state.spawnTimer = 0;
        state.wavePauseTimer = WAVE_PAUSE;
        state.inWavePause = true;
        state.waveAnnounceTimer = WAVE_PAUSE;
        state.combo = 0;
        state.comboTimer = 0;
        state.shakeTimer = 0;
        state.shakeIntensity = 0;
        state.gameOver = false;
        state.running = true;
        state.baseHitFlash = 0;
        state.lastTimestamp = 0;
    }

    function gameOver() {
        state.gameOver = true;
        state.running = false;

        document.getElementById('final-score').textContent = state.score;
        document.getElementById('final-wave').textContent = state.wave;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    function startGame() {
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        resetState();
        requestAnimationFrame(gameLoop);
    }

    function gameLoop(timestamp) {
        if (!state.running && !state.gameOver) return;

        if (state.lastTimestamp === 0) state.lastTimestamp = timestamp;
        let dt = (timestamp - state.lastTimestamp) / 1000;
        state.lastTimestamp = timestamp;

        // Clamp dt to avoid jumps
        if (dt > 0.1) dt = 0.1;

        update(dt);
        render();

        if (!state.gameOver) {
            requestAnimationFrame(gameLoop);
        } else {
            // Render one final frame
            render();
        }
    }

    // --- Virtual Keyboard ---
    function createVirtualKeyboard() {
        const container = document.getElementById('virtual-keyboard');
        container.innerHTML = '';

        for (const row of KB_ROWS) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'kb-row';

            for (const key of row) {
                const btn = document.createElement('div');
                btn.className = 'kb-key';
                btn.textContent = key;
                btn.dataset.key = key;

                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    btn.classList.add('pressed');
                    attackLetter(key);
                });
                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    btn.classList.remove('pressed');
                });

                // Mouse fallback for testing on desktop
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    btn.classList.add('pressed');
                    attackLetter(key);
                });
                btn.addEventListener('mouseup', (e) => {
                    e.preventDefault();
                    btn.classList.remove('pressed');
                });
                btn.addEventListener('mouseleave', () => {
                    btn.classList.remove('pressed');
                });

                rowDiv.appendChild(btn);
            }

            container.appendChild(rowDiv);
        }
    }

    function detectMobile() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    function setupKeyboardVisibility() {
        if (detectMobile()) {
            document.body.classList.add('show-keyboard');
        }
    }

    // --- Event listeners ---
    function setupInputs() {
        // Physical keyboard
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const key = e.key.toUpperCase();
            if (key.length === 1 && key >= 'A' && key <= 'Z') {
                attackLetter(key);

                // Visual feedback on virtual keyboard if visible
                const btn = document.querySelector(`.kb-key[data-key="${key}"]`);
                if (btn) {
                    btn.classList.add('pressed');
                    setTimeout(() => btn.classList.remove('pressed'), 100);
                }
            }
        });

        // Start / Restart buttons
        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', startGame);

        // Prevent zoom on double-tap for mobile
        document.addEventListener('dblclick', (e) => e.preventDefault());
    }

    // --- Resize handling ---
    function handleResize() {
        resizeCanvas();
        // Re-center if game is not running — just render a frame
        if (!state.running) {
            centerX = W / 2;
            centerY = H / 2;
        }
    }

    // --- Init ---
    function init() {
        resizeCanvas();
        createVirtualKeyboard();
        setupKeyboardVisibility();
        setupInputs();
        window.addEventListener('resize', handleResize);

        // Render idle background
        render();
    }

    init();
})();
