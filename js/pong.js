const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDOM = document.getElementById('current-score');
const highScoreDOM = document.getElementById('high-score');
const overlay = document.getElementById('game-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');

let score = 0;
let highScore = localStorage.getItem('pong_hs') || 0;
highScoreDOM.innerText = highScore;

let isPlaying = false;
let animationId;

// --- ÂM THANH ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'paddle') { // Tiếng Ping
        osc.type = 'square'; osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'wall') { // Tiếng Pong đập tường
        osc.type = 'sine'; osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'score') { // Tiếng ăn điểm bonus
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'lose') { // Tiếng game over
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
}

// --- ĐỐI TƯỢNG VẬT LÝ ---
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 12;
let initialBallSpeed = 4;

const player = { x: 20, y: canvas.height/2 - PADDLE_HEIGHT/2, w: PADDLE_WIDTH, h: PADDLE_HEIGHT, color: '#0ff', dy: 0, speed: 8 };
const ai = { x: canvas.width - 20 - PADDLE_WIDTH, y: canvas.height/2 - PADDLE_HEIGHT/2, w: PADDLE_WIDTH, h: PADDLE_HEIGHT, color: '#f0f', speed: 5 };
const ball = { x: canvas.width/2, y: canvas.height/2, size: BALL_SIZE, speed: initialBallSpeed, dx: 0, dy: 0, color: '#fff' };

// --- ĐIỀU KHIỂN ---
let keys = { w: false, s: false };
window.addEventListener('keydown', e => {
    if(e.code === 'KeyW' || e.code === 'ArrowUp') { keys.w = true; e.preventDefault(); }
    if(e.code === 'KeyS' || e.code === 'ArrowDown') { keys.s = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => {
    if(e.code === 'KeyW' || e.code === 'ArrowUp') keys.w = false;
    if(e.code === 'KeyS' || e.code === 'ArrowDown') keys.s = false;
});
canvas.addEventListener('mousemove', e => {
    let rect = canvas.getBoundingClientRect();
    let root = document.documentElement;
    let mouseY = e.clientY - rect.top - root.scrollTop;
    player.y = mouseY - player.h / 2;
});

function resetBall(direction) {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.speed = initialBallSpeed;
    ball.dx = direction * ball.speed;
    ball.dy = (Math.random() * 2 - 1) * ball.speed; 
}

function initGame() {
    score = 0; scoreDOM.innerText = score;
    player.y = canvas.height/2 - player.h/2;
    ai.y = canvas.height/2 - ai.h/2;
    
    // BẢN VÁ: Hạ tốc độ gốc của AI xuống để nó hơi "chậm chạp" lúc mới vào
    ai.speed = 3.5; 
    
    resetBall(1); 
    
    isPlaying = true;
    overlay.style.display = 'none';
    if(animationId) cancelAnimationFrame(animationId);
    gameLoop();
}

function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 15; ctx.shadowColor = color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
}

function drawNet() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for(let i = 0; i <= canvas.height; i += 30) { ctx.fillRect(canvas.width/2 - 1, i, 2, 15); }
}

function collision(b, p) {
    p.top = p.y; p.bottom = p.y + p.h; p.left = p.x; p.right = p.x + p.w;
    b.top = b.y - b.size/2; b.bottom = b.y + b.size/2; b.left = b.x - b.size/2; b.right = b.x + b.size/2;
    return p.left < b.right && p.top < b.bottom && p.right > b.left && p.bottom > b.top;
}

function gameLoop() {
    if(!isPlaying) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Vẽ lưới, paddle và bóng
    drawNet();
    drawRect(player.x, player.y, player.w, player.h, player.color);
    drawRect(ai.x, ai.y, ai.w, ai.h, ai.color);
    drawRect(ball.x - ball.size/2, ball.y - ball.size/2, ball.size, ball.size, ball.color);

    // Di chuyển Player bằng phím
    if(keys.w && player.y > 0) player.y -= player.speed;
    if(keys.s && player.y < canvas.height - player.h) player.y += player.speed;
    
    // Chặn Player tràn viền
    if(player.y < 0) player.y = 0;
    if(player.y > canvas.height - player.h) player.y = canvas.height - player.h;

    // AI di chuyển (Tự động đuổi theo bóng)
    let aiCenter = ai.y + ai.h/2;
    
    // BẢN VÁ LỖI LOGIC: AI chỉ thực sự "cảnh giác" khi bóng bay sang sân của nó (dx > 0)
    if (ball.dx > 0) {
        if(aiCenter < ball.y - 15) ai.y += ai.speed;
        else if(aiCenter > ball.y + 15) ai.y -= ai.speed;
    } else {
        // Khi bóng bay về phía người chơi, AI từ từ lùi về giữa sân dưỡng sức
        if(aiCenter < canvas.height/2 - 10) ai.y += 2;
        else if(aiCenter > canvas.height/2 + 10) ai.y -= 2;
    }

    // Bóng di chuyển
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Bóng nảy tường trên/dưới
    if(ball.y - ball.size/2 < 0 || ball.y + ball.size/2 > canvas.height) {
        ball.dy *= -1; playSound('wall');
    }

    // Xử lý va chạm với Paddle
    let hitPaddle = (ball.x < canvas.width/2) ? player : ai;
    if(collision(ball, hitPaddle)) {
        playSound('paddle');
        
        // Tính góc nảy dựa trên điểm chạm
        let collidePoint = (ball.y - (hitPaddle.y + hitPaddle.h/2));
        collidePoint = collidePoint / (hitPaddle.h/2); // Chuẩn hóa về [-1, 1]
        let angleRad = (Math.PI/4) * collidePoint; // Góc nảy tối đa 45 độ
        
        let direction = (ball.x + ball.size/2 < canvas.width/2) ? 1 : -1;
        ball.speed += 0.4; // Mỗi lần chạm bóng sẽ nhanh hơn một chút
        ball.dx = direction * ball.speed * Math.cos(angleRad);
        ball.dy = ball.speed * Math.sin(angleRad);
        
        if (hitPaddle === player) {
            score++; scoreDOM.innerText = score;
            
            // BẢN VÁ: Giảm tốc độ tiến hóa của AI (cộng 0.4 thay vì 0.8) và có mức trần
            if(score % 5 === 0 && ai.speed < 8.5) ai.speed += 0.4; 
        }
    }

    // Kiểm tra lọt lưới
   // Kiểm tra lọt lưới
    if(ball.x - ball.size/2 < 0) {
        // Player thua
        gameOver();
    } else if(ball.x + ball.size/2 > canvas.width) {
        // Player lừa được AI -> Thưởng lớn
        score += 5; scoreDOM.innerText = score;
        playSound('score');
        
        // BẢN VÁ: Đẩy bóng về phía AI ở lượt tiếp theo để người chơi kịp thở
        resetBall(1); 
    }

    animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    isPlaying = false; playSound('lose');
    cancelAnimationFrame(animationId);
    
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('pong_hs', highScore);
        highScoreDOM.innerText = highScore;
        overlayMsg.innerText = "TÍN HIỆU ĐÃ BỊ ĐỨT ĐOẠN!\n🎉 KỶ LỤC MỚI: " + highScore;
    } else {
        overlayMsg.innerText = "TÍN HIỆU ĐÃ BỊ ĐỨT ĐOẠN!";
    }
    
    overlayTitle.innerText = "CONNECTION LOST";
    document.getElementById('btn-start').innerText = "🔄 KẾT NỐI LẠI";
    overlay.style.display = 'flex';
}
