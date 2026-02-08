// ============================================
// KEYBOARD DEFENDER — Game Engine
// ============================================

(() => {
    // --- Constants ---
    const CORNER_COLORS = ['#ff0055', '#00f0ff', '#00ff88', '#aa44ff'];
    const BG_COLOR = '#050a14';
    const GRID_COLOR = 'rgba(0, 240, 255, 0.04)';
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
    const FONT = '"Orbitron", "Courier New", monospace';
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
    let gameTime = 0;

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

    // --- Hex helper ---
    function drawHexagon(cx, cy, r, rotation) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + (rotation || 0);
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
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
            this.rotation = Math.random() * Math.PI * 2;
            this.rotSpeed = (Math.random() - 0.5) * 2;

            const margin = 40;
            switch (corner) {
                case 0: this.x = -margin; this.y = -margin; break;
                case 1: this.x = W + margin; this.y = -margin; break;
                case 2: this.x = W + margin; this.y = H + margin; break;
                case 3: this.x = -margin; this.y = H + margin; break;
            }

            this.x += (Math.random() - 0.5) * 60;
            this.y += (Math.random() - 0.5) * 60;

            const angle = Math.atan2(centerY - this.y, centerX - this.x);
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;

            // Trail
            this.trail = [];
        }

        update(dt) {
            // Store trail positions
            this.trail.push({ x: this.x, y: this.y, age: 0 });
            if (this.trail.length > 6) this.trail.shift();
            for (const t of this.trail) t.age += dt;

            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.age += dt;
            this.opacity = Math.min(1, this.age / 0.3);
            this.rotation += this.rotSpeed * dt;
        }

        distToCenter() {
            return Math.hypot(this.x - centerX, this.y - centerY);
        }

        draw(ctx) {
            // Trail
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i];
                const alpha = (i / this.trail.length) * 0.12 * this.opacity;
                ctx.globalAlpha = alpha;
                drawHexagon(t.x, t.y, this.radius * 0.7, this.rotation);
                ctx.fillStyle = this.color;
                ctx.fill();
            }

            ctx.globalAlpha = this.opacity;

            // Outer glow
            drawHexagon(this.x, this.y, this.radius + 8, this.rotation);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.opacity * 0.08;
            ctx.fill();

            // Body
            ctx.globalAlpha = this.opacity;
            drawHexagon(this.x, this.y, this.radius, this.rotation);
            ctx.fillStyle = BG_COLOR;
            ctx.fill();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Inner hex decoration
            ctx.globalAlpha = this.opacity * 0.15;
            drawHexagon(this.x, this.y, this.radius * 0.7, -this.rotation);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Letter
            ctx.globalAlpha = this.opacity;
            ctx.fillStyle = this.color;
            ctx.font = `bold 15px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10;
            ctx.fillText(this.letter, this.x, this.y + 1);
            ctx.shadowBlur = 0;

            ctx.globalAlpha = 1;
        }
    }

    // --- Particle ---
    class Particle {
        constructor(x, y, color, type) {
            this.x = x;
            this.y = y;
            this.type = type || 'normal';
            const angle = Math.random() * Math.PI * 2;
            const speed = this.type === 'ring' ? 20 + Math.random() * 40 : 80 + Math.random() * 160;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.life = this.type === 'ring' ? 0.3 : 0.5 + Math.random() * 0.4;
            this.maxLife = this.life;
            this.radius = this.type === 'ring' ? 1 + Math.random() * 1.5 : 1.5 + Math.random() * 2.5;
            this.color = color;
        }

        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.vx *= 0.96;
            this.vy *= 0.96;
            this.life -= dt;
        }

        draw(ctx) {
            const alpha = Math.max(0, this.life / this.maxLife);
            ctx.globalAlpha = alpha;

            if (this.type === 'line') {
                // Draw a small line in direction of velocity
                const len = 4 * alpha;
                const norm = Math.hypot(this.vx, this.vy) || 1;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x - (this.vx / norm) * len, this.y - (this.vy / norm) * len);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.radius * alpha;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * alpha, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
            }

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
            ctx.font = `bold 13px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
            ctx.fillText(this.text, this.x, this.y);
            ctx.shadowBlur = 0;
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

        // Explosion particles — lines radiating out
        for (let i = 0; i < 10; i++) {
            state.particles.push(new Particle(enemy.x, enemy.y, enemy.color, 'line'));
        }
        // Dot particles
        for (let i = 0; i < 6; i++) {
            state.particles.push(new Particle(enemy.x, enemy.y, enemy.color, 'normal'));
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

        for (let i = 0; i < 8; i++) {
            state.particles.push(new Particle(centerX, centerY, '#ff0055', 'normal'));
        }

        if (state.lives <= 0) {
            gameOver();
        }
    }

    // --- Update ---
    function update(dt) {
        if (state.gameOver) return;

        gameTime += dt;

        if (state.inWavePause) {
            state.wavePauseTimer -= dt;
            state.waveAnnounceTimer = state.wavePauseTimer;
            if (state.wavePauseTimer <= 0) {
                startWave();
            }
            updateParticles(dt);
            updateFloatingTexts(dt);
            return;
        }

        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0 && state.enemiesLeftInWave > 0) {
            spawnEnemy();
            state.spawnTimer = getSpawnInterval();
        }

        for (const enemy of state.enemies) {
            if (!enemy.alive) continue;
            enemy.update(dt);

            if (enemy.distToCenter() < HIT_DISTANCE) {
                enemy.alive = false;
                enemyReachedBase(enemy);
            }
        }

        state.enemies = state.enemies.filter(e => e.alive);

        if (state.enemiesLeftInWave <= 0 && state.enemies.length === 0) {
            state.wave++;
            state.inWavePause = true;
            state.wavePauseTimer = WAVE_PAUSE;
        }

        if (state.comboTimer > 0) {
            state.comboTimer -= dt;
            if (state.comboTimer <= 0) state.combo = 0;
        }

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

        // Vignette
        drawVignette();

        // Grid
        drawGrid();

        // Corner indicators
        drawCornerIndicators();

        // Radial lines from center (subtle)
        drawRadialLines();

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

        // Scanlines
        drawScanlines();

        // HUD
        drawHUD();

        // Wave announcement
        if (state.inWavePause && state.running && !state.gameOver) {
            drawWaveAnnounce();
        }

        ctx.restore();
    }

    function drawVignette() {
        const maxDim = Math.max(W, H);
        const grad = ctx.createRadialGradient(centerX, centerY, maxDim * 0.2, centerX, centerY, maxDim * 0.8);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    function drawGrid() {
        const gridSize = 50;

        // Vertical lines
        ctx.lineWidth = 1;
        for (let x = gridSize; x < W; x += gridSize) {
            const distFromCenter = Math.abs(x - centerX) / (W / 2);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.05 * (1 - distFromCenter * 0.7)})`;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        // Horizontal lines
        for (let y = gridSize; y < H; y += gridSize) {
            const distFromCenter = Math.abs(y - centerY) / (H / 2);
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.05 * (1 - distFromCenter * 0.7)})`;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    function drawRadialLines() {
        const count = 8;
        ctx.lineWidth = 0.5;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const len = Math.max(W, H);
            ctx.globalAlpha = 0.03;
            ctx.strokeStyle = '#00f0ff';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(centerX + Math.cos(angle) * len, centerY + Math.sin(angle) * len);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawCornerIndicators() {
        const size = 80;
        const positions = [
            [0, 0], [W, 0], [W, H], [0, H]
        ];
        for (let i = 0; i < 4; i++) {
            const [px, py] = positions[i];
            const grad = ctx.createRadialGradient(px, py, 0, px, py, size);
            grad.addColorStop(0, CORNER_COLORS[i]);
            grad.addColorStop(1, 'transparent');
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = grad;
            ctx.fillRect(px - size, py - size, size * 2, size * 2);

            // Corner bracket decoration
            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = CORNER_COLORS[i];
            ctx.lineWidth = 1;
            const bLen = 18;
            const bOff = 6;
            const sx = px === 0 ? bOff : px - bOff;
            const sy = py === 0 ? bOff : py - bOff;
            const dx = px === 0 ? 1 : -1;
            const dy = py === 0 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(sx + dx * bLen, sy);
            ctx.lineTo(sx, sy);
            ctx.lineTo(sx, sy + dy * bLen);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawBase() {
        const pulse = Math.sin(gameTime * 3) * 0.15 + 0.85;
        const slowRot = gameTime * 0.3;

        // Outer rotating ring
        ctx.globalAlpha = 0.08;
        drawHexagon(centerX, centerY, BASE_RADIUS + 22, slowRot);
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Middle rotating ring (opposite direction)
        ctx.globalAlpha = 0.12;
        drawHexagon(centerX, centerY, BASE_RADIUS + 14, -slowRot * 1.5);
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Glow
        const glowR = BASE_RADIUS + 20;
        const grad = ctx.createRadialGradient(centerX, centerY, BASE_RADIUS * 0.5, centerX, centerY, glowR);
        grad.addColorStop(0, `rgba(0, 240, 255, ${0.08 * pulse})`);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Hit flash
        if (state.baseHitFlash > 0) {
            drawHexagon(centerX, centerY, BASE_RADIUS + 10, 0);
            ctx.fillStyle = `rgba(255, 0, 85, ${state.baseHitFlash})`;
            ctx.fill();
        }

        // Base hexagon
        drawHexagon(centerX, centerY, BASE_RADIUS, 0);
        ctx.fillStyle = BG_COLOR;
        ctx.fill();
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.5 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Inner hex
        drawHexagon(centerX, centerY, BASE_RADIUS * 0.5, slowRot);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.15 * pulse})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${0.6 * pulse})`;
        ctx.fill();
    }

    function drawScanlines() {
        ctx.globalAlpha = 0.03;
        ctx.fillStyle = '#000';
        for (let y = 0; y < H; y += 3) {
            ctx.fillRect(0, y, W, 1);
        }
        ctx.globalAlpha = 1;
    }

    function drawHUD() {
        const pad = 14;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 6;

        // Score (top-left)
        ctx.fillStyle = '#00f0ff';
        ctx.font = `bold 14px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`SCORE`, pad, pad);
        ctx.font = `bold 20px ${FONT}`;
        ctx.fillText(`${state.score}`, pad, pad + 18);

        // Wave (top-center)
        ctx.textAlign = 'center';
        ctx.font = `bold 11px ${FONT}`;
        ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
        ctx.fillText(`VAGUE`, W / 2, pad);
        ctx.font = `bold 18px ${FONT}`;
        ctx.fillStyle = '#00f0ff';
        ctx.fillText(`${state.wave}`, W / 2, pad + 16);

        // Lives (top-right)
        ctx.textAlign = 'right';
        ctx.font = `bold 11px ${FONT}`;
        ctx.fillStyle = state.lives <= 1 ? '#ff0055' : 'rgba(0, 240, 255, 0.5)';
        ctx.fillText(`SHIELD`, W - pad, pad);

        // Draw life bars
        const barW = 12;
        const barH = 4;
        const barGap = 3;
        const totalW = MAX_LIVES * (barW + barGap) - barGap;
        const barStartX = W - pad - totalW;
        const barY = pad + 18;
        for (let i = 0; i < MAX_LIVES; i++) {
            const bx = barStartX + i * (barW + barGap);
            if (i < state.lives) {
                ctx.fillStyle = state.lives <= 1 ? '#ff0055' : '#00f0ff';
                ctx.shadowColor = state.lives <= 1 ? '#ff0055' : '#00f0ff';
            } else {
                ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
                ctx.shadowColor = 'transparent';
            }
            ctx.fillRect(bx, barY, barW, barH);
        }

        ctx.shadowBlur = 0;

        // Combo indicator
        if (state.combo > 1 && state.comboTimer > 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#aa44ff';
            ctx.font = `bold 13px ${FONT}`;
            ctx.shadowColor = '#aa44ff';
            ctx.shadowBlur = 8;
            ctx.fillText(`COMBO x${state.combo}`, W / 2, pad + 38);
            ctx.shadowBlur = 0;
        }

        // HUD decorative lines
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 0.5;
        // Top line
        ctx.beginPath();
        ctx.moveTo(pad, pad + 42);
        ctx.lineTo(pad + 80, pad + 42);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W - pad, pad + 42);
        ctx.lineTo(W - pad - 80, pad + 42);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawWaveAnnounce() {
        const t = state.waveAnnounceTimer;
        if (t <= 0) return;

        const alpha = Math.min(1, t / (WAVE_PAUSE * 0.5));
        ctx.globalAlpha = alpha;

        // Horizontal lines flanking text
        const lineW = 60;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(centerX - lineW - 60, centerY - 65);
        ctx.lineTo(centerX - 60, centerY - 65);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX + 60, centerY - 65);
        ctx.lineTo(centerX + lineW + 60, centerY - 65);
        ctx.stroke();

        ctx.fillStyle = '#00f0ff';
        ctx.font = `900 30px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 20;
        ctx.fillText(`VAGUE ${state.wave}`, centerX, centerY - 65);
        ctx.shadowBlur = 0;

        ctx.font = `400 12px ${FONT}`;
        ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.fillText('INITIALISATION...', centerX, centerY - 35);
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
        gameTime = 0;
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

        if (dt > 0.1) dt = 0.1;

        update(dt);
        render();

        if (!state.gameOver) {
            requestAnimationFrame(gameLoop);
        } else {
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
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const key = e.key.toUpperCase();
            if (key.length === 1 && key >= 'A' && key <= 'Z') {
                attackLetter(key);

                const btn = document.querySelector(`.kb-key[data-key="${key}"]`);
                if (btn) {
                    btn.classList.add('pressed');
                    setTimeout(() => btn.classList.remove('pressed'), 100);
                }
            }
        });

        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', startGame);

        document.addEventListener('dblclick', (e) => e.preventDefault());
    }

    // --- Resize handling ---
    function handleResize() {
        resizeCanvas();
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

        render();
    }

    init();
})();
