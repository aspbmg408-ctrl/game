const boardDOM = document.getElementById('game-board');
const scoreDOM = document.getElementById('current-score');
const highScoreDOM = document.getElementById('high-score');
const overlay = document.getElementById('game-overlay');
const overlayText = document.getElementById('overlay-text');
const sizeSelector = document.getElementById('grid-size');

let SIZE = 4;
let board = [];
let score = 0;
let highScore = localStorage.getItem('tech2048_hs') || 0;
highScoreDOM.innerText = highScore;

// Ánh xạ Số -> Ngôn ngữ Công nghệ
const TECH_MAP = {
    2: "HTML", 4: "CSS", 8: "JS", 16: "React", 32: "Node", 
    64: "Python", 128: "Docker", 256: "K8s", 512: "AWS", 
    1024: "Git", 2048: "AI", 4096: "AGI", 8192: "SKYNET"
};

// --- m Thanh ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'slide') { // Kéo trượt
        osc.type = 'sine'; osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'merge') { // Gộp thành công khối xịn
        osc.type = 'square'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.setValueAtTime(900, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
}

function changeGridSize() {
    SIZE = parseInt(sizeSelector.value);
    initGame();
}

function initGame() {
    board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
    score = 0; scoreDOM.innerText = score;
    overlay.style.display = 'none';
    
    // Setup Grid CSS động dựa theo Size
    boardDOM.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
    boardDOM.style.gridTemplateRows = `repeat(${SIZE}, 1fr)`;
    
    addRandomTile(); addRandomTile();
    renderBoard();
}

function addRandomTile() {
    let emptyCells = [];
    for (let r=0; r<SIZE; r++) for (let c=0; c<SIZE; c++) if (board[r][c] === 0) emptyCells.push({r, c});
    
    if (emptyCells.length > 0) {
        let pick = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        board[pick.r][pick.c] = Math.random() < 0.9 ? 2 : 4;
        return {r: pick.r, c: pick.c}; // Trả về tọa độ khối mới
    }
    return null;
}

function renderBoard(newTile = null, mergedTiles = []) {
    boardDOM.innerHTML = '';
    
    // Tự động thu nhỏ font chữ nếu bàn cờ quá to
    let fontSize = SIZE <= 4 ? 20 : (SIZE === 5 ? 16 : 12);
    
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            let val = board[r][c];
            let cell = document.createElement('div');
            cell.className = 'cell';
            cell.style.fontSize = fontSize + 'px';
            
            if (val !== 0) {
                cell.innerText = TECH_MAP[val] || val; // Nếu vượt quá 8192 thì hiện số
                cell.classList.add(`tech-${val}`);
                
                if (newTile && newTile.r === r && newTile.c === c) cell.classList.add('new');
                
                // Kiểm tra xem tọa độ này có nằm trong danh sách gộp không
                if (mergedTiles.some(m => m.r === r && m.c === c)) cell.classList.add('merged');
            } else {
                cell.classList.add('empty');
            }
            boardDOM.appendChild(cell);
        }
    }
}

// ==========================================
// CƠ CHẾ KÉO THẢ (DRAG / SWIPE) CỦA CHUỘT
// ==========================================
let startX, startY;
boardDOM.addEventListener('mousedown', (e) => {
    startX = e.clientX; startY = e.clientY;
});
boardDOM.addEventListener('mouseup', (e) => {
    let endX = e.clientX; let endY = e.clientY;
    handleSwipe(startX, startY, endX, endY);
});
// Hỗ trợ cả màn hình cảm ứng điện thoại
boardDOM.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
}, {passive: false});
boardDOM.addEventListener('touchend', (e) => {
    let endX = e.changedTouches[0].clientX; let endY = e.changedTouches[0].clientY;
    handleSwipe(startX, startY, endX, endY);
});

function handleSwipe(sx, sy, ex, ey) {
    let dx = ex - sx; let dy = ey - sy;
    let absDx = Math.abs(dx); let absDy = Math.abs(dy);
    
    // Ngưỡng kéo tối thiểu 30px để không bị nhận diện nhầm khi click
    if (Math.max(absDx, absDy) > 30) {
        if (absDx > absDy) {
            if (dx > 0) moveRight(); else moveLeft();
        } else {
            if (dy > 0) moveDown(); else moveUp();
        }
    }
}

// ==========================================
// THUẬT TOÁN GỘP BLOCK
// ==========================================
function slide(row) {
    let arr = row.filter(val => val); // Lọc bỏ số 0
    let missing = SIZE - arr.length;
    let zeros = Array(missing).fill(0);
    return arr.concat(zeros);
}

function merge(row, rowIdx, isCol = false) {
    let mergedCoords = [];
    for (let i = 0; i < SIZE - 1; i++) {
        if (row[i] !== 0 && row[i] === row[i+1]) {
            row[i] *= 2; row[i+1] = 0;
            score += row[i];
            
            // Tính toán tọa độ thực tế trên bàn cờ để chớp sáng
            if(isCol) mergedCoords.push({r: i, c: rowIdx});
            else mergedCoords.push({r: rowIdx, c: i});
        }
    }
    return { row, mergedCoords };
}

function processMove(isLeft, isRight, isUp, isDown) {
    let oldBoard = JSON.stringify(board);
    let allMerged = [];
    let isMergeHappened = false;
    
    if (isLeft || isRight) {
        for (let r = 0; r < SIZE; r++) {
            let row = board[r];
            if(isRight) row.reverse();
            row = slide(row);
            
            let res = merge(row, r, false);
            if(res.mergedCoords.length > 0) isMergeHappened = true;
            row = res.row;
            row = slide(row);
            
            if(isRight) row.reverse();
            board[r] = row;
            // Map tọa độ lại nếu lật ngược (để chớp sáng cho đúng)
            res.mergedCoords.forEach(m => {
                if(isRight) allMerged.push({r: m.r, c: SIZE - 1 - m.c});
                else allMerged.push(m);
            });
        }
    } else if (isUp || isDown) {
        for (let c = 0; c < SIZE; c++) {
            let col = [board[0][c], board[1][c], board[2][c], board[3][c]];
            if (SIZE > 4) col = Array.from({length: SIZE}, (_, r) => board[r][c]); // Cắt cột ra mảng dọc
            
            if(isDown) col.reverse();
            col = slide(col);
            
            let res = merge(col, c, true);
            if(res.mergedCoords.length > 0) isMergeHappened = true;
            col = res.row;
            col = slide(col);
            
            if(isDown) col.reverse();
            for (let r = 0; r < SIZE; r++) board[r][c] = col[r]; // Dán cột lại
            
            res.mergedCoords.forEach(m => {
                if(isDown) allMerged.push({r: SIZE - 1 - m.r, c: m.c});
                else allMerged.push(m);
            });
        }
    }
    
    if (oldBoard !== JSON.stringify(board)) {
        if(isMergeHappened) playSound('merge'); else playSound('slide');
        
        let newTilePos = addRandomTile();
        scoreDOM.innerText = score;
        renderBoard(newTilePos, allMerged);
        checkGameOver();
    }
}

function moveLeft() { processMove(true, false, false, false); }
function moveRight() { processMove(false, true, false, false); }
function moveUp() { processMove(false, false, true, false); }
function moveDown() { processMove(false, false, false, true); }

function checkGameOver() {
    let over = true;
    for (let r=0; r<SIZE; r++) {
        for (let c=0; c<SIZE; c++) {
            if (board[r][c] === 0) { over = false; break; }
            if (r !== SIZE-1 && board[r][c] === board[r+1][c]) { over = false; break; }
            if (c !== SIZE-1 && board[r][c] === board[r][c+1]) { over = false; break; }
        }
    }
    if (over) {
        if(score > highScore) {
            highScore = score;
            localStorage.setItem('tech2048_hs', highScore);
            highScoreDOM.innerText = highScore;
        }
        overlayText.innerText = "BỘ NHỚ ĐÃ TRÀN (GAME OVER)";
        overlay.style.display = 'flex';
    }
}

// Gắn phím cứng dự phòng cho ai lười kéo chuột
window.addEventListener('keydown', e => {
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.key) > -1) e.preventDefault();
    if(overlay.style.display === 'flex') return;
    switch(e.key) {
        case 'ArrowLeft': case 'a': moveLeft(); break;
        case 'ArrowRight': case 'd': moveRight(); break;
        case 'ArrowUp': case 'w': moveUp(); break;
        case 'ArrowDown': case 's': moveDown(); break;
    }
});

// Chạy game
initGame();