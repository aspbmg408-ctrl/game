const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDOM = document.getElementById('current-score');
const highScoreDOM = document.getElementById('high-score');
const overlay = document.getElementById('game-overlay');
const overlayText = document.getElementById('overlay-text');
const btnStart = document.getElementById('btn-start');

// --- THÔNG SỐ VẬT LÝ ---
let frames = 0;
let score = 0;
let highScore = localStorage.getItem('flappy_hs') || 0;
let isPlaying = false;
let animationId;

highScoreDOM.innerText = highScore;

// ĐỐI TƯỢNG BIRD
const bird = {
    x: 50, y: 150, width: 34, height: 24,
    velocity: 0, gravity: 0.2, jump: -4.5, 
    draw: function() {
        ctx.fillStyle = '#0ff'; 
        ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
        ctx.font = "bold 14px Courier New";
        ctx.fillText("</>", this.x + 4, this.y + 16);
    },
    update: function() {
        this.velocity += this.gravity;
        this.y += this.velocity;
        
        if (this.y + this.height >= canvas.height || this.y <= 0) {
            gameOver("LỖI: TRÀN BỘ NHỚ (CRASH)");
        }
    },
    flap: function() {
        this.velocity = this.jump;
        playSound('flap');
    }
};

// ĐỐI TƯỢNG PIPES (Tường lửa)
const pipes = {
    items: [],
    width: 50, 
    gap: 160, 
    dx: 2, 
    draw: function() {
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            ctx.fillStyle = '#ef4444'; 
            ctx.shadowBlur = 15; ctx.shadowColor = '#ef4444';
            
            ctx.fillRect(p.x, 0, this.width, p.top);
            ctx.fillRect(p.x, p.top + this.gap, this.width, canvas.height - p.top - this.gap);
            
            ctx.fillStyle = '#fca5a5'; ctx.shadowBlur = 0;
            ctx.fillRect(p.x - 2, p.top - 10, this.width + 4, 10); 
            ctx.fillRect(p.x - 2, p.top + this.gap, this.width + 4, 10); 
        }
    },
    update: function() {
        let spawnRate = Math.floor(240 / this.dx);
        if (frames % spawnRate === 0) {
            let minHeight = 50;
            let maxHeight = canvas.height - this.gap - minHeight;
            let topPipeHeight;

            // [VÁ LỖI BẤT KHẢ THI]: Ràng buộc độ dốc giữa 2 cột liên tiếp
            if (this.items.length === 0) {
                // Cột đầu tiên: Random tự do
                topPipeHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight);
            } else {
                // Các cột sau: Khống chế xê dịch tối đa 120px so với cột trước
                let lastHeight = this.items[this.items.length - 1].top;
                let maxDiff = 120; 
                
                let localMin = Math.max(minHeight, lastHeight - maxDiff);
                let localMax = Math.min(maxHeight, lastHeight + maxDiff);
                
                topPipeHeight = Math.floor(Math.random() * (localMax - localMin + 1) + localMin);
            }

            this.items.push({ x: canvas.width, top: topPipeHeight, passed: false });
        }
        
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx; 
            
            if (bird.x + bird.width > p.x && bird.x < p.x + this.width &&
                (bird.y < p.top || bird.y + bird.height > p.top + this.gap)) {
                gameOver("BỊ CHẶN BỞI TƯỜNG LỬA!");
            }
            
            if (p.x + this.width < bird.x && !p.passed) {
                score++; scoreDOM.innerText = score;
                p.passed = true;
                playSound('score');

                if (score % 3 === 0) {
                    if (this.dx < 4.5) this.dx += 0.3; 
                    if (this.gap > 110) this.gap -= 5; 
                }
            }
            
            if (p.x + this.width < 0) {
                this.items.shift(); i--;
            }
        }
    },
    reset: function() { 
        this.items = []; 
        this.dx = 2;       
        this.gap = 160;    
    }
};

// --- ÂM THANH ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'flap') { 
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'score') { 
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'crash') { 
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    }
}

// --- GAME LOOP ---
function initGame() {
    bird.y = 200; bird.velocity = 0;
    pipes.reset();
    score = 0; scoreDOM.innerText = score; frames = 0;
    isPlaying = true;
    overlay.style.display = 'none';
    if(animationId) cancelAnimationFrame(animationId);
    gameLoop();
}

function gameLoop() {
    if (!isPlaying) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    
    bird.update();
    pipes.update();
    
    pipes.draw();
    bird.draw();
    
    frames++;
    animationId = requestAnimationFrame(gameLoop); 
}

function gameOver(msg) {
    isPlaying = false; playSound('crash');
    cancelAnimationFrame(animationId);
    
    let crashes = parseInt(localStorage.getItem('flappy_crashes') || 0) + 1;
    localStorage.setItem('flappy_crashes', crashes);
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappy_hs', highScore);
        highScoreDOM.innerText = highScore;
        msg += "\n🎉 KỶ LỤC MỚI!";
    }
    overlayText.innerText = msg; btnStart.innerText = "CHẠY LẠI CHƯƠNG TRÌNH";
    overlay.style.display = 'flex';
}

// --- ĐIỀU KHIỂN ---
function triggerJump(e) {
    if (e && (e.code === 'Space' || e.code === 'ArrowUp')) e.preventDefault();
    if (isPlaying) bird.flap();
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') triggerJump(e);
});
canvas.addEventListener('mousedown', triggerJump);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); triggerJump(); }, {passive: false});

btnStart.addEventListener('click', initGame);

bird.draw();