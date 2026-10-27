const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDOM = document.getElementById('current-score');
const highScoreDOM = document.getElementById('high-score');
const overlay = document.getElementById('game-overlay');
const overlayText = document.getElementById('overlay-text');
const btnStart = document.getElementById('btn-start');

const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE; // Bàn cờ 20x20

let snake = [];
let dx = 0; let dy = 0; // Hướng đi
let food = { x: 10, y: 10 };
let score = 0;
let highScore = localStorage.getItem('snake_hs') || 0;
let gameLoopTimeout;
let isPlaying = false;
let speed = 120; // Tốc độ miligiây/frame (Số càng nhỏ càng nhanh)
let changingDirection = false; // Chống bug bấm 2 nút cùng lúc quay đầu tự cắn mình

highScoreDOM.innerText = highScore;

// m thanh Synthesizer Cyberpunk
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'eat') { // Tiếng thu thập Data
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'crash') { // Tiếng System Crash
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

function initGame() {
    snake = [ {x: 10, y: 10}, {x: 10, y: 11}, {x: 10, y: 12} ];
    dx = 0; dy = -1; // Rắn đi lên
    score = 0; speed = 120;
    scoreDOM.innerText = score;
    placeFood();
    isPlaying = true;
    overlay.style.display = 'none';
    if(gameLoopTimeout) clearTimeout(gameLoopTimeout);
    gameLoop();
}

function placeFood() {
    let valid = false;
    while(!valid) {
        food.x = Math.floor(Math.random() * TILE_COUNT);
        food.y = Math.floor(Math.random() * TILE_COUNT);
        valid = true;
        for(let part of snake) if(part.x === food.x && part.y === food.y) valid = false; // Không random đồ ăn đè lên người rắn
    }
}

function gameLoop() {
    if(!isPlaying) return;
    changingDirection = false; // Reset cờ khóa nút bấm mỗi frame
    
    // Tọa độ cái đầu mới
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    
    // XỬ LÝ CHẾT (Đâm tường bảo mật)
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        gameOver("CRASH: ĐỤNG TƯỜNG BẢO MẬT"); return;
    }
    // XỬ LÝ CHẾT (Tự cắn vào dây dữ liệu của mình)
    for (let i = 0; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            gameOver("CRASH: XUNG ĐỘT DỮ LIỆU"); return;
        }
    }

    snake.unshift(head); // Thêm đầu mới

    // ĂN GÓI TIN
    if (head.x === food.x && head.y === food.y) {
        playSound('eat');
        score += 10; scoreDOM.innerText = score;
        placeFood();
        // Cứ ăn được là tăng tốc độ chạy
        if(speed > 50) speed -= 2; 
    } else {
        snake.pop(); // Không ăn thì cắt đuôi để trườn đi
    }

    draw();
    gameLoopTimeout = setTimeout(gameLoop, speed);
}

function draw() {
    // Xóa khung hình cũ (Để lại lớp nền lưới CSS)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Vẽ Gói Tin (Food) màu Pink phát sáng
    ctx.fillStyle = '#f0f';
    ctx.shadowBlur = 15; ctx.shadowColor = '#f0f';
    ctx.fillRect(food.x * GRID_SIZE + 2, food.y * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);

    // Vẽ Rắn (Snake) màu Cyan phát sáng
    ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
    for (let i = 0; i < snake.length; i++) {
        // Cái đầu sáng màu Trắng, thân màu Cyan
        ctx.fillStyle = i === 0 ? '#fff' : '#0ff'; 
        ctx.fillRect(snake[i].x * GRID_SIZE + 1, snake[i].y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    }
    ctx.shadowBlur = 0; // Reset bóng cho vòng lặp sau
}

function gameOver(msg) {
    isPlaying = false; playSound('crash');
    
    // Lưu thống kê (Số lần hỏng hóc)
    let crashes = parseInt(localStorage.getItem('snake_crashes') || 0) + 1;
    localStorage.setItem('snake_crashes', crashes);
    
    // Check Kỷ lục mới
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('snake_hs', highScore);
        highScoreDOM.innerText = highScore;
        msg += "\n🎉 KỶ LỤC MỚI!";
    }

    overlayText.innerText = msg;
    btnStart.innerText = "TÁI KHỞI ĐỘNG LUỒNG";
    overlay.style.display = 'flex';
}

// Bắt sự kiện phím bấm
window.addEventListener('keydown', e => {
    if(!isPlaying || changingDirection) return;
    
    // Chặn hành vi scroll trang của phím mũi tên
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.key) > -1) e.preventDefault();

    switch(e.key) {
        case 'ArrowUp': case 'w': case 'W': 
            if(dy !== 1) { dx = 0; dy = -1; changingDirection = true; } break; // Không cho phép đang đi xuống mà quay ngược lên
        case 'ArrowDown': case 's': case 'S': 
            if(dy !== -1) { dx = 0; dy = 1; changingDirection = true; } break;
        case 'ArrowLeft': case 'a': case 'A': 
            if(dx !== 1) { dx = -1; dy = 0; changingDirection = true; } break;
        case 'ArrowRight': case 'd': case 'D': 
            if(dx !== -1) { dx = 1; dy = 0; changingDirection = true; } break;
    }
});

btnStart.addEventListener('click', initGame);
draw(); // Vẽ màn hình chờ