const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDOM = document.getElementById('current-score');
const highScoreDOM = document.getElementById('high-score');
const livesDOM = document.getElementById('lives-display');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');

let isPlaying = false;
let animationId = null;
let score = 0;
let lives = 3;
let highScore = localStorage.getItem('invaders_hs') || 0;
highScoreDOM.innerText = highScore;

// --- PHÍM ĐIỀU KHIỂN ---
const keys = { Left: false, Right: false, Space: false };

window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.Left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.Right = true;
    if (e.code === 'Space') {
        if (!keys.Space && isPlaying) player.shoot();
        keys.Space = true;
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.Left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.Right = false;
    if (e.code === 'Space') keys.Space = false;
});

// --- ÂM THANH SYNTHESIZER ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'playerHit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    }
}

// --- ĐỐI TƯỢNG PHI THUYỀN (PLAYER) ---
const player = {
    x: 275, y: 540, width: 50, height: 24, speed: 5,
    lastShot: 0,
    draw: function() {
        ctx.fillStyle = '#38bdf8';
        ctx.shadowBlur = 10; ctx.shadowColor = '#38bdf8';
        // Thân phi thuyền
        ctx.fillRect(this.x + 5, this.y + 10, this.width - 10, this.height - 10);
        ctx.fillRect(this.x + 20, this.y, 10, 10);
        ctx.shadowBlur = 0;
    },
    update: function() {
        if (keys.Left && this.x > 10) this.x -= this.speed;
        if (keys.Right && this.x < canvas.width - this.width - 10) this.x += this.speed;
    },
    shoot: function() {
        const now = Date.now();
        if (now - this.lastShot > 250) { // Giới hạn tốc độ bắn
            playerBullets.push({ x: this.x + this.width / 2 - 2, y: this.y, width: 4, height: 12, speed: 8 });
            playSound('shoot');
            this.lastShot = now;
        }
    }
};

// --- QUẢN LÝ ĐẠN & QUÁI VẬT ---
let playerBullets = [];
let alienBullets = [];
let aliens = [];
let bunkers = [];
let alienDirection = 1;
let alienStepTimer = 0;
let alienStepInterval = 30; // Số frame để dịch chuyển 1 bước

function createAliens() {
    aliens = [];
    const rows = 5; const cols = 10;
    const colors = ['#f43f5e', '#a855f7', '#a855f7', '#22c55e', '#22c55e'];
    const points = [30, 20, 20, 10, 10];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            aliens.push({
                x: 40 + c * 50,
                y: 50 + r * 40,
                width: 32,
                height: 24,
                color: colors[r],
                pts: points[r],
                alive: true
            });
        }
    }
}

function createBunkers() {
    bunkers = [];
    const bunkerCount = 4;
    const spacing = canvas.width / (bunkerCount + 1);
    
    for (let i = 1; i <= bunkerCount; i++) {
        const startX = spacing * i - 30;
        const startY = 440;
        // Mỗi khiên bảo vệ là một lưới các ô pixel nhỏ 10x10
        let blocks = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 6; c++) {
                if (r === 3 && (c === 2 || c === 3)) continue; // Chừa cổng ở giữa
                blocks.push({ x: startX + c * 10, y: startY + r * 10, hp: 3 });
            }
        }
        bunkers.push(blocks);
    }
}

// --- GAME LOOP ---
function initGame() {
    score = 0;
    lives = 3;
    playerBullets = [];
    alienBullets = [];
    alienDirection = 1;
    alienStepInterval = 30;
    player.x = 275;
    
    scoreDOM.innerText = score;
    livesDOM.innerText = '❤️'.repeat(lives);
    overlay.style.display = 'none';

    createAliens();
    createBunkers();

    isPlaying = true;
    if (animationId) cancelAnimationFrame(animationId);
    gameLoop();
}

function gameLoop() {
    if (!isPlaying) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Cập nhật & Vẽ Player
    player.update();
    player.draw();

    // 2. Di chuyển Quân đoàn Aliens
    alienStepTimer++;
    const activeAliens = aliens.filter(a => a.alive);
    
    if (activeAliens.length === 0) {
        // Thắng màn -> Tái sinh với tốc độ nhanh hơn
        createAliens();
        alienStepInterval = Math.max(10, alienStepInterval - 5);
    }

    // Tăng tốc di chuyển dựa trên số lượng quái còn sống
    const currentInterval = Math.max(2, Math.floor(alienStepInterval * (activeAliens.length / 50)));

    if (alienStepTimer >= currentInterval) {
        alienStepTimer = 0;
        let hitEdge = false;

        activeAliens.forEach(a => {
            if ((alienDirection === 1 && a.x + a.width >= canvas.width - 15) ||
                (alienDirection === -1 && a.x <= 15)) {
                hitEdge = true;
            }
        });

        if (hitEdge) {
            alienDirection *= -1;
            activeAliens.forEach(a => {
                a.y += 15;
                if (a.y + a.height >= player.y) {
                    gameOver("QUÂN ĐOÀN ĐÃ XÂM CHIẾM TRÁI ĐẤT!");
                }
            });
        } else {
            activeAliens.forEach(a => a.x += alienDirection * 8);
        }
    }

    // Vẽ Aliens
    activeAliens.forEach(a => {
        ctx.fillStyle = a.color;
        ctx.shadowBlur = 8; ctx.shadowColor = a.color;
        // Hình quái pixel đơn giản
        ctx.fillRect(a.x, a.y, a.width, a.height);
        ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
        ctx.fillRect(a.x + 6, a.y + 6, 6, 6);
        ctx.fillRect(a.x + 20, a.y + 6, 6, 6);
    });

    // 3. Quái bắn đạn ngẫu nhiên
    if (Math.random() < 0.025 && activeAliens.length > 0) {
        const shooter = activeAliens[Math.floor(Math.random() * activeAliens.length)];
        alienBullets.push({ x: shooter.x + shooter.width / 2, y: shooter.y + shooter.height, width: 4, height: 10, speed: 4 });
    }

    // 4. Xử lý Đạn Player
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        let b = playerBullets[i];
        b.y -= b.speed;
        ctx.fillStyle = '#0ff';
        ctx.shadowBlur = 8; ctx.shadowColor = '#0ff';
        ctx.fillRect(b.x, b.y, b.width, b.height);

        // Va chạm Đạn Player -> Aliens
        for (let a of activeAliens) {
            if (b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y) {
                a.alive = false;
                playerBullets.splice(i, 1);
                score += a.pts;
                scoreDOM.innerText = score;
                playSound('hit');
                break;
            }
        }

        if (b && b.y < 0) playerBullets.splice(i, 1);
    }

    // 5. Xử lý Đạn Aliens
    for (let i = alienBullets.length - 1; i >= 0; i--) {
        let b = alienBullets[i];
        b.y += b.speed;
        ctx.fillStyle = '#ef4444';
        ctx.shadowBlur = 8; ctx.shadowColor = '#ef4444';
        ctx.fillRect(b.x, b.y, b.width, b.height);

        // Va chạm Đạn Alien -> Player
        if (b.x < player.x + player.width && b.x + b.width > player.x && b.y < player.y + player.height && b.y + b.height > player.y) {
            alienBullets.splice(i, 1);
            lives--;
            livesDOM.innerText = '❤️'.repeat(Math.max(0, lives));
            playSound('playerHit');

            if (lives <= 0) {
                gameOver("PHI THUYỀN BỊ TIÊU DIỆT!");
                return;
            }
        }

        if (b && b.y > canvas.height) alienBullets.splice(i, 1);
    }

    // 6. Vẽ & Xử lý Va chạm Khiên Bảo Vệ (Bunkers)
    bunkers.forEach(blockArray => {
        for (let i = blockArray.length - 1; i >= 0; i--) {
            let block = blockArray[i];
            ctx.fillStyle = block.hp === 3 ? '#22c55e' : (block.hp === 2 ? '#86efac' : '#bbf7d0');
            ctx.shadowBlur = 0;
            ctx.fillRect(block.x, block.y, 10, 10);

            // Kiểm tra va chạm với đạn Player
            playerBullets.forEach((b, bIdx) => {
                if (b.x < block.x + 10 && b.x + b.width > block.x && b.y < block.y + 10 && b.y + b.height > block.y) {
                    playerBullets.splice(bIdx, 1);
                    block.hp--;
                    if (block.hp <= 0) blockArray.splice(i, 1);
                }
            });

            // Kiểm tra va chạm với đạn Alien
            alienBullets.forEach((b, bIdx) => {
                if (b.x < block.x + 10 && b.x + b.width > block.x && b.y < block.y + 10 && b.y + b.height > block.y) {
                    alienBullets.splice(bIdx, 1);
                    block.hp--;
                    if (block.hp <= 0) blockArray.splice(i, 1);
                }
            });
        }
    });

    animationId = requestAnimationFrame(gameLoop);
}

function gameOver(msg) {
    isPlaying = false;
    cancelAnimationFrame(animationId);

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('invaders_hs', highScore);
        highScoreDOM.innerText = highScore;
        msg += "\n🎉 KỶ LỤC MỚI!";
    }

    overlayTitle.innerText = "GAME OVER";
    overlayMsg.innerText = msg;
    document.getElementById('btn-start').innerText = "🔄 THỬ LẠI";
    overlay.style.display = 'flex';
}