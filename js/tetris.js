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

const SHAPES = {
    'I': { matrix: [[1,1,1,1]], color: '#0ff' },
    'J': { matrix: [[1,0,0],[1,1,1]], color: '#00f' },
    'L': { matrix: [[0,0,1],[1,1,1]], color: '#f90' },
    'O': { matrix: [[1,1],[1,1]], color: '#ff0' },
    'S': { matrix: [[0,1,1],[1,1,0]], color: '#0f0' },
    'T': { matrix: [[0,1,0],[1,1,1]], color: '#f0f' },
    'Z': { matrix: [[1,1,0],[0,1,1]], color: '#f00' }
};

let mode = 'CLASSIC'; 
let COLS = 10, ROWS = 20, BLOCK_SIZE = 30;
let grid = [];
let score = 0;
let highScore = localStorage.getItem('tetris_hs') || 0;
highScoreDOM.innerText = highScore;

let currentPiece = null;
let dropInterval = 1000;
let lastTime = 0;
let animationId;
let isPlaying = false;

// Biến cho chế độ TRAY
let trayPieces = [null, null, null];
let draggedPiece = null;
let draggedIndex = -1;
let ghostCanvas = null; // Khối hình trôi nổi bám theo chuột
let hoverX = null, hoverY = null;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'move') {
        osc.type = 'square'; osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'drop') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.2);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'clear') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// Thuật toán AI cấp khối thông minh
// Thuật toán AI cấp khối thông minh (Đã tách biệt 2 chế độ)
function getSmartPiece() {
    let weights = { 'I': 10, 'J': 10, 'L': 10, 'O': 10, 'S': 10, 'T': 10, 'Z': 10 };
    
    if (mode === 'CLASSIC') {
        // AI CHẾ ĐỘ RƠI: Phân tích giếng sâu để cứu nguy
        let colHeights = Array(COLS).fill(0);
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
                if (grid[r][c] !== 0) { colHeights[c] = ROWS - r; break; }
            }
        }
        let maxH = Math.max(...colHeights);
        let maxWellDepth = 0;
        for (let c = 0; c < COLS; c++) {
            let leftH = c === 0 ? maxH : colHeights[c-1];
            let rightH = c === COLS-1 ? maxH : colHeights[c+1];
            let well = Math.min(leftH, rightH) - colHeights[c];
            if (well > maxWellDepth) maxWellDepth = well;
        }

        if (maxWellDepth >= 3) { weights['I'] += 60; }
        if (maxH > ROWS - 6) {
            weights['O'] = 0; weights['S'] = 2; weights['Z'] = 2;
            weights['I'] += 20; weights['T'] += 20;
        }
    } else {
        // AI CHẾ ĐỘ KHAY (1010): Phân phối ngẫu nhiên đa dạng hơn
        let emptyCount = 0;
        grid.forEach(row => row.forEach(val => { if(val === 0) emptyCount++; }));
        
        // Khi bàn cờ bắt đầu chật (còn dưới 45 ô trống)
        if (emptyCount < 45) { 
            weights['O'] += 40; // Ưu tiên khối vuông nhỏ để dễ nhét
            weights['I'] += 10;
            weights['S'] = 2;   // Giảm thiểu các khối dích dắc khó chịu
            weights['Z'] = 2;
        }
    }

    let totalWeight = 0;
    for (let k in weights) totalWeight += weights[k];
    let randomNum = Math.random() * totalWeight;
    for (let k in weights) {
        if (randomNum < weights[k]) return createPiece(k);
        randomNum -= weights[k];
    }
    return createPiece('O'); // Dự phòng khối vuông
}

function createPiece(type) {
    return { type: type, matrix: JSON.parse(JSON.stringify(SHAPES[type].matrix)), color: SHAPES[type].color, x: Math.floor(COLS/2)-1, y: 0 };
}

function changeMode() {
    mode = modeSelector.value;
    initGame();
}

function initGame() {
    if(animationId) cancelAnimationFrame(animationId);
    
    // Tìm thẻ khung bao bọc bàn cờ để xử lý giao diện
    const boardContainer = document.querySelector('.board-container');

    // 1. Tự động CO GIÃN KHUNG BẢN ĐỒ cho vừa khít
    if (mode === 'CLASSIC') {
        COLS = 10; ROWS = 20; BLOCK_SIZE = 30; 
        canvas.height = 600;
        if(boardContainer) boardContainer.style.height = '606px'; // Vừa 20 hàng + 6px viền
    } else {
        COLS = 10; ROWS = 10; BLOCK_SIZE = 30; 
        canvas.height = 300;
        if(boardContainer) boardContainer.style.height = '306px'; // Co ngắn lại khít 10 hàng
    }

    // 2. Khởi tạo lưới NGAY LẬP TỨC để AI có bản đồ mà đọc
    grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));

    // 3. Bây giờ mới cho AI sinh khối và đổi chữ hiển thị
    if (mode === 'CLASSIC') {
        trays[0].style.display = 'block'; trays[1].style.display = 'none'; trays[2].style.display = 'none';
        sideTitle.innerText = "KHỐI TIẾP THEO";
        controlsHint.innerHTML = "[W/Mũi tên lên]: Xoay<br>[A/D]: Di chuyển<br>[S]: Rơi nhanh<br>[SPACE]: Rơi chốt hạ";
        trayPieces[0] = getSmartPiece();
        currentPiece = getSmartPiece();
    } else {
        trays[0].style.display = 'block'; trays[1].style.display = 'block'; trays[2].style.display = 'block';
        sideTitle.innerText = "KHAY CHỨA KÉO THẢ";
        controlsHint.innerHTML = "👆 <b>Click & Giữ chuột</b> vào khối ở khay, kéo rê vào Bàn cờ rồi thả ra.<br>Xóa Hàng ngang và Dọc.";
        fillTray();
    }

    score = 0; scoreDOM.innerText = score; dropInterval = 1000;
    isPlaying = true; overlay.style.display = 'none'; 
    draggedPiece = null; draggedIndex = -1; removeGhost();
    
    drawBoard();
    if(mode === 'CLASSIC') { lastTime = performance.now(); updateClassic(); }
}

function drawBlock(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.shadowBlur = 10; ctx.shadowColor = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 0;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if(grid[r][c] !== 0) drawBlock(ctx, c, r, BLOCK_SIZE, grid[r][c]);
        }
    }
    if (mode === 'CLASSIC' && currentPiece) {
        currentPiece.matrix.forEach((row, r) => {
            row.forEach((val, c) => {
                if (val !== 0) drawBlock(ctx, currentPiece.x + c, currentPiece.y + r, BLOCK_SIZE, currentPiece.color);
            });
        });
    }
    
    if(mode === 'CLASSIC') {
        drawTrayPiece(0, trayPieces[0]);
    } else {
        drawTrayPiece(0, trayPieces[0] === draggedPiece ? null : trayPieces[0]);
        drawTrayPiece(1, trayPieces[1] === draggedPiece ? null : trayPieces[1]);
        drawTrayPiece(2, trayPieces[2] === draggedPiece ? null : trayPieces[2]);
    }

    // Hiệu ứng Đổ Bóng Mờ khi rê chuột lên Bàn cờ
    if (mode === 'TRAY' && draggedPiece && hoverX !== null && hoverY !== null) {
        let rect = canvas.getBoundingClientRect();
        let mX = hoverX - rect.left;
        let mY = hoverY - rect.top;
        if (mX >= 0 && mX <= canvas.width && mY >= 0 && mY <= canvas.height) {
            let pCols = draggedPiece.matrix[0].length;
            let pRows = draggedPiece.matrix.length;
            let targetC = Math.floor(mX / BLOCK_SIZE) - Math.floor(pCols / 2);
            let targetR = Math.floor(mY / BLOCK_SIZE) - Math.floor(pRows / 2);
            
            let isValid = !checkCollision(draggedPiece, targetC, targetR);
            draggedPiece.matrix.forEach((row, r) => {
                row.forEach((val, c) => {
                    if (val !== 0) {
                        let drawX = targetC + c; let drawY = targetR + r;
                        // Chỉ vẽ bóng nếu mảnh nằm lọt trong bản đồ để tránh văng lỗi
                        if (drawX >= 0 && drawX < COLS && drawY >= 0 && drawY < ROWS) {
                            drawBlock(ctx, drawX, drawY, BLOCK_SIZE, isValid ? 'rgba(255,255,255,0.4)' : 'rgba(255,0,0,0.5)');
                        }
                    }
                });
            });
        }
    }
}

function drawTrayPiece(idx, piece) {
    let tCtx = trayCtxs[idx];
    tCtx.clearRect(0, 0, 100, 100);
    if(!piece) return;
    
    let pSize = 20; 
    let pRows = piece.matrix.length; let pCols = piece.matrix[0].length;
    let offsetX = (100 - pCols * pSize) / 2 / pSize; 
    let offsetY = (100 - pRows * pSize) / 2 / pSize;
    
    piece.matrix.forEach((row, r) => {
        row.forEach((val, c) => {
            if (val !== 0) drawBlock(tCtx, offsetX + c, offsetY + r, pSize, piece.color);
        });
    });
}

// BẢN VÁ: Tách bạch điều kiện để chống lỗi "Cannot read properties of undefined"
function checkCollision(piece, tarX, tarY) {
    for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[r].length; c++) {
            if (piece.matrix[r][c] !== 0) {
                let newX = tarX + c; let newY = tarY + r;
                if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) return true;
                if (grid[newY][newX] !== 0) return true;
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
                linesCleared++; r++;
            }
        }
    } else {
        let rowsToClear = []; let colsToClear = [];
        for (let r = 0; r < ROWS; r++) { if (grid[r].every(val => val !== 0)) rowsToClear.push(r); }
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
        if(mode === 'CLASSIC' && dropInterval > 200) dropInterval -= 20;
    }
}

function gameOver() {
    isPlaying = false;
    if(score > highScore) { highScore = score; localStorage.setItem('tetris_hs', highScore); highScoreDOM.innerText = highScore; }
    overlayText.innerText = "LỖI HỆ THỐNG (GAME OVER)";
    overlay.style.display = 'flex';
}

function updateClassic(time = 0) {
    if(!isPlaying || mode !== 'CLASSIC') return;
    let deltaTime = time - lastTime;
    if (deltaTime > dropInterval) {
        if (!checkCollision(currentPiece, currentPiece.x, currentPiece.y + 1)) {
            currentPiece.y++;
        } else {
            if (currentPiece.y <= 0) { gameOver(); return; }
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
        let rotated = [];
        for (let i = 0; i < currentPiece.matrix[0].length; i++) {
            let row = currentPiece.matrix.map(el => el[i]).reverse();
            rotated.push(row);
        }
        let oldMatrix = currentPiece.matrix;
        currentPiece.matrix = rotated;
        if (checkCollision(currentPiece, currentPiece.x, currentPiece.y)) { currentPiece.matrix = oldMatrix; }
        else playSound('move');
    } else if (e.code === 'Space') {
        while(!checkCollision(currentPiece, currentPiece.x, currentPiece.y + 1)) { currentPiece.y++; score+=2; }
        solidify(currentPiece, currentPiece.x, currentPiece.y);
        currentPiece = trayPieces[0]; trayPieces[0] = getSmartPiece();
        lastTime = performance.now();
    }
    drawBoard();
});

function fillTray() {
    if (trayPieces.every(p => p === null)) {
        trayPieces = [getSmartPiece(), getSmartPiece(), getSmartPiece()];
        drawBoard();
        checkTrayGameOver();
    }
}

function checkTrayGameOver() {
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

// =================================================================
// BẢN VÁ: TẠO KHỐI TRÔI NỔI (GHOST CANVAS) ĐỂ BÁM CHUỘT
// =================================================================
function createGhost(piece, clientX, clientY) {
    ghostCanvas = document.createElement('canvas');
    let pRows = piece.matrix.length; let pCols = piece.matrix[0].length;
    ghostCanvas.width = pCols * BLOCK_SIZE;
    ghostCanvas.height = pRows * BLOCK_SIZE;
    
    // Thuộc tính thần thánh giúp nó nổi trên mọi thành phần
    ghostCanvas.style.position = 'fixed';
    ghostCanvas.style.pointerEvents = 'none'; 
    ghostCanvas.style.zIndex = '9999';
    ghostCanvas.style.transform = 'translate(-50%, -50%)'; 
    document.body.appendChild(ghostCanvas);

    let gCtx = ghostCanvas.getContext('2d');
    piece.matrix.forEach((row, r) => {
        row.forEach((val, c) => {
            if (val !== 0) drawBlock(gCtx, c, r, BLOCK_SIZE, piece.color);
        });
    });
    updateGhostPos(clientX, clientY);
}

function updateGhostPos(x, y) {
    if(ghostCanvas) {
        ghostCanvas.style.left = x + 'px';
        ghostCanvas.style.top = y + 'px';
    }
}

function removeGhost() {
    if(ghostCanvas && ghostCanvas.parentNode) ghostCanvas.parentNode.removeChild(ghostCanvas);
    ghostCanvas = null;
}

function handleDragStart(idx, clientX, clientY) {
    if (!isPlaying || mode !== 'TRAY' || !trayPieces[idx]) return;
    draggedPiece = trayPieces[idx];
    draggedIndex = idx;
    playSound('move');
    createGhost(draggedPiece, clientX, clientY); // Đẻ ra khối bay
    drawBoard(); // Xóa khối ở khay
}

function handleDragMove(clientX, clientY) {
    if (!draggedPiece) return;
    updateGhostPos(clientX, clientY);
    hoverX = clientX; hoverY = clientY;
    drawBoard();
}

function handleDragEnd(clientX, clientY) {
    if (!draggedPiece) return;
    removeGhost();
    
    let rect = canvas.getBoundingClientRect();
    let mX = clientX - rect.left;
    let mY = clientY - rect.top;
    
    if (mX >= 0 && mX <= canvas.width && mY >= 0 && mY <= canvas.height) {
        let pCols = draggedPiece.matrix[0].length;
        let pRows = draggedPiece.matrix.length;
        let targetC = Math.floor(mX / BLOCK_SIZE) - Math.floor(pCols / 2);
        let targetR = Math.floor(mY / BLOCK_SIZE) - Math.floor(pRows / 2);
        
        if (!checkCollision(draggedPiece, targetC, targetR)) {
            solidify(draggedPiece, targetC, targetR);
            trayPieces[draggedIndex] = null;
            score += pRows * pCols * 10;
            scoreDOM.innerText = score;
            
            // [VÁ LỖI GAME OVER]: Kiểm tra sau MỖI LẦN đặt khối thành công
            if (trayPieces.every(p => p === null)) {
                fillTray(); // Dùng hết 3 khối -> Cấp mới (bên trong đã có check)
            } else {
                checkTrayGameOver(); // Còn khối trong khay -> Phải tự quét kiểm tra
            }
        } else {
            playSound('move'); // Báo lỗi đè khối
        }
    }
    
    draggedPiece = null; draggedIndex = -1; hoverX = null; hoverY = null;
    drawBoard();
}

// Bắt sự kiện Click lên từng Khay
trays.forEach((trayDom, idx) => {
    trayDom.addEventListener('mousedown', (e) => handleDragStart(idx, e.clientX, e.clientY));
    trayDom.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        handleDragStart(idx, e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});
});

// Bắt sự kiện Rê và Thả trên TOÀN BỘ Màn Hình
window.addEventListener('mousemove', (e) => handleDragMove(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
    if(draggedPiece) e.preventDefault(); 
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

window.addEventListener('mouseup', (e) => handleDragEnd(e.clientX, e.clientY));
window.addEventListener('touchend', (e) => {
    if(draggedPiece) handleDragEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
});

drawBoard();