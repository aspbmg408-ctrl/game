const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const trays = [document.getElementById('tray-1'), document.getElementById('tray-2'), document.getElementById('tray-3')];
const trayCtxs = trays.map(t => t.getContext('2d'));

const scoreDOM = document.getElementById('current-score');
const highScoreDOM = document.getElementById('high-score');
const modeSelector = document.getElementById('game-mode');
const overlay = document.getElementById('game-overlay');
const sideTitle = document.getElementById('side-title');
const controlsHint = document.getElementById('controls-hint');

// Hình dạng Tetromino chuẩn và Màu Neon
const SHAPES = {
    'I': { matrix: [[1,1,1,1]], color: '#0ff' },
    'J': { matrix: [[1,0,0],[1,1,1]], color: '#00f' },
    'L': { matrix: [[0,0,1],[1,1,1]], color: '#f90' },
    'O': { matrix: [[1,1],[1,1]], color: '#ff0' },
    'S': { matrix: [[0,1,1],[1,1,0]], color: '#0f0' },
    'T': { matrix: [[0,1,0],[1,1,1]], color: '#f0f' },
    'Z': { matrix: [[1,1,0],[0,1,1]], color: '#f00' }
};
const SHAPE_KEYS = Object.keys(SHAPES);

let mode = 'CLASSIC'; // 'CLASSIC' hoặc 'TRAY'
let COLS = 10, ROWS = 20, BLOCK_SIZE = 30;
let grid = [];
let score = 0;
let highScore = localStorage.getItem('tetris_hs') || 0;
highScoreDOM.innerText = highScore;

// Biến cho chế độ CLASSIC
let currentPiece = null;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let animationId;
let isPlaying = false;

// Biến cho chế độ TRAY (1010)
let trayPieces = [null, null, null];
let isDragging = false;
let draggedPieceIdx = -1;
let dragX = 0, dragY = 0;

// --- m Thanh Web Audio API ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'move') { // Tiếng cạch nhẹ
        osc.type = 'square'; osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'drop') { // Tiếng bùm chốt khối
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'clear') { // Tiếng xoẹt điện khi ăn hàng
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// ----------------------------------------------------
// THUẬT TOÁN AI CẤP KHỐI THÔNG MINH (TRÁNH GÓC CHẾT)
// ----------------------------------------------------
function getSmartPiece() {
    let weights = { 'I': 10, 'J': 10, 'L': 10, 'O': 10, 'S': 10, 'T': 10, 'Z': 10 };
    
    // Đọc địa hình bề mặt hiện tại
    let colHeights = Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            if (grid[r][c] !== 0) { colHeights[c] = ROWS - r; break; }
        }
    }
    
    let maxH = Math.max(...colHeights);
    
    // Tìm các cái hố sâu (Giếng - Well)
    let maxWellDepth = 0;
    for (let c = 0; c < COLS; c++) {
        let leftH = c === 0 ? maxH : colHeights[c-1];
        let rightH = c === COLS-1 ? maxH : colHeights[c+1];
        let well = Math.min(leftH, rightH) - colHeights[c];
        if (well > maxWellDepth) maxWellDepth = well;
    }

    // AI Quyết định:
    // 1. Nếu có hố rất sâu (>= 3 block), người chơi cực kỳ cần thanh dài (I)
    if (maxWellDepth >= 3) { weights['I'] += 60; }
    
    // 2. Nếu bàn cờ đã dâng lên quá cao (Nguy hiểm), hạn chế cấp khối vuông (O) và Z/S vì rất khó nhét
    if (maxH > ROWS - 6) {
        weights['O'] = 0; weights['S'] = 2; weights['Z'] = 2;
        weights['I'] += 20; weights['T'] += 20; // T rất dễ chui góc
    }

    // 3. Nếu là chế độ KHAY ĐẶT, ưu tiên khối nhỏ, hạn chế thanh dài liên tục
    if (mode === 'TRAY') {
        let emptyCount = 0;
        grid.forEach(row => row.forEach(val => { if(val === 0) emptyCount++; }));
        if (emptyCount < (ROWS * COLS) / 2) {
            // Sắp hết chỗ, ưu tiên O (gọn) hoặc I
            weights['O'] += 20; weights['I'] += 20;
        }
    }

    // Tiến hành quay Xổ số có trọng số
    let totalWeight = 0;
    for (let k in weights) totalWeight += weights[k];
    let randomNum = Math.random() * totalWeight;
    
    for (let k in weights) {
        if (randomNum < weights[k]) return createPiece(k);
        randomNum -= weights[k];
    }
    return createPiece('T'); // Backup
}

function createPiece(type) {
    return { type: type, matrix: JSON.parse(JSON.stringify(SHAPES[type].matrix)), color: SHAPES[type].color, x: Math.floor(COLS/2)-1, y: 0 };
}

// ----------------------------------------------------
// VẬN HÀNH CHUNG
// ----------------------------------------------------
function changeMode() {
    mode = modeSelector.value;
    initGame();
}

function initGame() {
    if(animationId) cancelAnimationFrame(animationId);
    
    // [VÁ LỖI]: Xác định kích thước trước
    if (mode === 'CLASSIC') {
        COLS = 10; ROWS = 20; BLOCK_SIZE = 30; canvas.height = 600;
    } else {
        COLS = 10; ROWS = 10; BLOCK_SIZE = 30; canvas.height = 300;
    }

    // [VÁ LỖI QUAN TRỌNG]: Khởi tạo lưới rỗng NGAY BÂY GIỜ để AI không bị lỗi khi đọc địa hình
    grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));

    // Sau khi có lưới mới bắt đầu cấp khối và thay đổi giao diện
    if (mode === 'CLASSIC') {
        trays[0].style.display = 'block'; trays[1].style.display = 'none'; trays[2].style.display = 'none';
        sideTitle.innerText = "KHỐI TIẾP THEO";
        controlsHint.innerHTML = "[W/Mũi tên lên]: Xoay<br>[A/D]: Di chuyển<br>[S]: Rơi nhanh<br>[SPACE]: Rơi chốt hạ";
        
        trayPieces[0] = getSmartPiece(); // Khối Next
        currentPiece = getSmartPiece();
    } else {
        trays[0].style.display = 'block'; trays[1].style.display = 'block'; trays[2].style.display = 'block';
        sideTitle.innerText = "KHAY CHỨA KÉO THẢ";
        controlsHint.innerHTML = "👆 Dùng chuột / Cảm ứng để kéo khối từ Khay đặt vào Bàn cờ.<br>Xóa Hàng ngang và Dọc.";
        
        fillTray(); // Gọi hàm này AI sẽ không bị crash nữa
    }

    score = 0; scoreDOM.innerText = score; dropInterval = 1000;
    isPlaying = true; overlay.style.display = 'none';
    
    drawBoard();
    if(mode === 'CLASSIC') { lastTime = performance.now(); updateClassic(); }
}

function drawBlock(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 10; ctx.shadowColor = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    // Viền sáng bóng
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 0;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Vẽ khối đã cố định
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if(grid[r][c] !== 0) drawBlock(ctx, c, r, BLOCK_SIZE, grid[r][c]);
        }
    }
    // Vẽ khối đang rơi (Classic)
    if (mode === 'CLASSIC' && currentPiece) {
        currentPiece.matrix.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val !== 0) drawBlock(ctx, currentPiece.x + c, currentPiece.y + r, BLOCK_SIZE, currentPiece.color);
            });
        });
    }
    
    // Vẽ Khay
    if(mode === 'CLASSIC') drawTrayPiece(0, trayPieces[0]);
    else { drawTrayPiece(0, trayPieces[0]); drawTrayPiece(1, trayPieces[1]); drawTrayPiece(2, trayPieces[2]); }
}

function drawTrayPiece(idx, piece) {
    let tCtx = trayCtxs[idx];
    tCtx.clearRect(0, 0, 100, 100);
    if(!piece) return;
    
    let pSize = 20; // Size thu nhỏ trong khay
    let pRows = piece.matrix.length; let pCols = piece.matrix[0].length;
    let offsetX = (100 - pCols * pSize) / 2 / pSize; // Căn giữa
    let offsetY = (100 - pRows * pSize) / 2 / pSize;
    
    piece.matrix.forEach((row, r) => {
        row.forEach((val, c) => {
            if (val !== 0) drawBlock(tCtx, offsetX + c, offsetY + r, pSize, piece.color);
        });
    });
}

function checkCollision(piece, tarX, tarY) {
    for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c] !== 0) {
                let newX = tarX + c; let newY = tarY + r;
                if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && grid[newY][newX] !== 0)) {
                    return true; // Đụng
                }
            }
        }
    }
    return false;
}

function solidify(piece, pX, pY) {
    piece.matrix.forEach((row, r) => {
        row.forEach((val, c) => {
            if (val !== 0) grid[pY + r][pX + c] = piece.color;
        });
    });
    playSound('drop');
    clearLines();
}

function clearLines() {
    let linesCleared = 0;
    
    if (mode === 'CLASSIC') {
        for (let r = ROWS - 1; r >= 0; r--) {
            let isFull = true;
            for (let c = 0; c < COLS; c++) { if (grid[r][c] === 0) { isFull = false; break; } }
            if (isFull) {
                grid.splice(r, 1);
                grid.unshift(Array(COLS).fill(0));
                linesCleared++; r++; // Kiểm tra lại hàng hiện tại sau khi dồn xuống
            }
        }
    } else {
        // TRAY MODE: Ăn cả hàng ngang và hàng dọc giống trò 1010
        let rowsToClear = []; let colsToClear = [];
        for (let r = 0; r < ROWS; r++) {
            if (grid[r].every(val => val !== 0)) rowsToClear.push(r);
        }
        for (let c = 0; c < COLS; c++) {
            let isColFull = true;
            for (let r = 0; r < ROWS; r++) if(grid[r][c] === 0) isColFull = false;
            if(isColFull) colsToClear.push(c);
        }
        
        rowsToClear.forEach(r => { for(let c=0; c<COLS; c++) grid[r][c] = 0; });
        colsToClear.forEach(c => { for(let r=0; r<ROWS; r++) grid[r][c] = 0; });
        linesCleared = rowsToClear.length + colsToClear.length;
    }

    if (linesCleared > 0) {
        playSound('clear');
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 200);
        
        score += [0, 100, 300, 500, 800][linesCleared] || 1000;
        scoreDOM.innerText = score;
        if(mode === 'CLASSIC' && dropInterval > 200) dropInterval -= 20; // Tăng tốc
    }
}

function gameOver() {
    isPlaying = false;
    if(score > highScore) { highScore = score; localStorage.setItem('tetris_hs', highScore); highScoreDOM.innerText = highScore; }
    overlayText.innerText = "LỖI HỆ THỐNG (GAME OVER)";
    overlay.style.display = 'flex';
}

// ----------------------------------------------------
// CHẾ ĐỘ 1: CLASSIC (RƠI TỪ TRÊN XUỐNG)
// ----------------------------------------------------
function updateClassic(time = 0) {
    if(!isPlaying || mode !== 'CLASSIC') return;
    let deltaTime = time - lastTime;
    
    if (deltaTime > dropInterval) {
        if (!checkCollision(currentPiece, currentPiece.x, currentPiece.y + 1)) {
            currentPiece.y++;
        } else {
            if (currentPiece.y <= 0) { gameOver(); return; } // Chết nắp trần
            solidify(currentPiece, currentPiece.x, currentPiece.y);
            currentPiece = trayPieces[0];
            trayPieces[0] = getSmartPiece();
        }
        lastTime = time;
    }
    drawBoard();
    animationId = requestAnimationFrame(updateClassic);
}

document.addEventListener('keydown', e => {
    if(!isPlaying || mode !== 'CLASSIC') return;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].indexOf(e.code) > -1) e.preventDefault();
    
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (!checkCollision(currentPiece, currentPiece.x - 1, currentPiece.y)) { currentPiece.x--; playSound('move'); }
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (!checkCollision(currentPiece, currentPiece.x + 1, currentPiece.y)) { currentPiece.x++; playSound('move'); }
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        if (!checkCollision(currentPiece, currentPiece.x, currentPiece.y + 1)) { currentPiece.y++; score+=1; }
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        // Xoay ma trận
        let rotated = [];
        for (let i = 0; i < currentPiece.matrix[0].length; i++) {
            let row = currentPiece.matrix.map(e => e[i]).reverse();
            rotated.push(row);
        }
        let oldMatrix = currentPiece.matrix;
        currentPiece.matrix = rotated;
        if (checkCollision(currentPiece, currentPiece.x, currentPiece.y)) {
            currentPiece.matrix = oldMatrix; // Kẹt vách thì k cho xoay
        } else playSound('move');
    } else if (e.code === 'Space') {
        while(!checkCollision(currentPiece, currentPiece.x, currentPiece.y + 1)) { currentPiece.y++; score+=2; }
        solidify(currentPiece, currentPiece.x, currentPiece.y);
        currentPiece = trayPieces[0]; trayPieces[0] = getSmartPiece();
        lastTime = performance.now(); // Reset bộ đếm rơi
    }
    drawBoard();
});

// ----------------------------------------------------
// CHẾ ĐỘ 2: TRAY (KÉO THẢ 1010)
// ----------------------------------------------------
function fillTray() {
    if (trayPieces.every(p => p === null)) {
        trayPieces = [getSmartPiece(), getSmartPiece(), getSmartPiece()];
        drawBoard();
        checkTrayGameOver();
    }
}

function checkTrayGameOver() {
    // Nếu tất cả các mảnh trong khay ĐỀU không thể nhét vào bất cứ đâu trên bàn cờ -> Thua
    let canPlaceAny = false;
    for (let p of trayPieces) {
        if (!p) continue;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (!checkCollision(p, c, r)) { canPlaceAny = true; break; }
            }
            if(canPlaceAny) break;
        }
        if(canPlaceAny) break;
    }
    if (!canPlaceAny) gameOver();
}

// Xử lý kéo thả từ Canvas Tray vào Canvas Board
trays.forEach((trayDom, idx) => {
    trayDom.addEventListener('mousedown', (e) => startDrag(idx, e));
    trayDom.addEventListener('touchstart', (e) => startDrag(idx, e.touches[0]), {passive: false});
});

function startDrag(idx, e) {
    if (!isPlaying || mode !== 'TRAY' || !trayPieces[idx]) return;
    isDragging = true; draggedPieceIdx = idx;
    playSound('move');
}

window.addEventListener('mousemove', (e) => handleDrag(e));
window.addEventListener('touchmove', (e) => handleDrag(e.touches[0]), {passive: false});

function handleDrag(e) {
    if (!isDragging) return;
    // Để nguyên không vẽ khối đu theo chuột ở JS vì Canvas drag hơi giật.
    // Thay vào đó ta tính toán tọa độ khi thả.
}

window.addEventListener('mouseup', (e) => endDrag(e));
window.addEventListener('touchend', (e) => endDrag(e.changedTouches[0]));

function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    
    // Tính toán xem chuột có đang nằm trong phạm vi Bàn cờ (gameCanvas) không
    let rect = canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    let mouseY = e.clientY - rect.top;
    
    if (mouseX >= 0 && mouseX <= canvas.width && mouseY >= 0 && mouseY <= canvas.height) {
        let gridX = Math.floor(mouseX / BLOCK_SIZE);
        let gridY = Math.floor(mouseY / BLOCK_SIZE);
        
        let p = trayPieces[draggedPieceIdx];
        
        // Điều chỉnh tâm kéo (Giả sử chuột nắm ở giữa khối)
        let pCols = p.matrix[0].length;
        let pRows = p.matrix.length;
        let adjX = gridX - Math.floor(pCols/2);
        let adjY = gridY - Math.floor(pRows/2);
        
        if (!checkCollision(p, adjX, adjY)) {
            solidify(p, adjX, adjY);
            trayPieces[draggedPieceIdx] = null; // Dùng xong
            score += pRows * pCols * 10;
            fillTray(); // Cấp 3 khối mới nếu đã dùng hết
            drawBoard();
        } else {
            playSound('move'); // Kêu báo lỗi k thả được
        }
    }
    draggedPieceIdx = -1;
}

// Khởi chạy chờ tương tác
drawBoard();