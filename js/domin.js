const ROWS = 9;
const COLS = 9;
const MINES_COUNT = 10;

// Bảng màu môi trường Đất / Cát (Địa hình)
const TERRAIN_COLORS = ['#d4a373', '#e6b88a', '#c89f70', '#e0c097', '#cd9a5b'];

let board = [];
let isGameOver = false;
let isFirstClick = true;
let flagsPlaced = 0;
let revealedCount = 0;

// Biến Kỹ năng
let armorCount = 1;
let scansLeft = 2;
let isScanMode = false;

// DOM
const boardElement = document.getElementById('board');
const uiFlags = document.getElementById('ui-flags');
const uiUnrevealed = document.getElementById('ui-unrevealed');
const uiProb = document.getElementById('ui-prob');
const uiArmor = document.getElementById('ui-armor');
const uiScans = document.getElementById('ui-scans');
const btnScan = document.getElementById('btnScan');
const btnReset = document.getElementById('btnReset');

// Âm thanh Web Audio API
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'flag') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'boom') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'shield') { // Tiếng vỡ khiên
        osc.type = 'square'; osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(150, now + 0.2);
        gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'scan') { // Tiếng radar
        osc.type = 'sine'; osc.frequency.setValueAtTime(900, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    }
}

// Hàm sinh hạt bụi khi đào
function spawnDust(e, color) {
    for(let i = 0; i < 6; i++) {
        let dust = document.createElement('div');
        dust.className = 'dust-particle';
        dust.style.background = color; // Bụi màu đất
        dust.style.left = e.clientX + 'px';
        dust.style.top = e.clientY + 'px';
        dust.style.setProperty('--tx', (Math.random() - 0.5) * 60 + 'px');
        dust.style.setProperty('--ty', (Math.random() - 0.5) * 60 + 'px');
        document.body.appendChild(dust);
        setTimeout(() => dust.remove(), 500);
    }
}

boardElement.addEventListener('contextmenu', e => e.preventDefault());

function initGame() {
    board = []; isGameOver = false; isFirstClick = true; 
    flagsPlaced = 0; revealedCount = 0;
    
    // Reset Kỹ năng
    armorCount = 1; scansLeft = 2; isScanMode = false;
    btnScan.disabled = false;
    boardElement.classList.remove('scan-mode', 'shake-effect');
    
    boardElement.innerHTML = '';
    boardElement.style.gridTemplateColumns = `repeat(${COLS}, 38px)`;

    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            row.push({ r, c, isMine: false, isRevealed: false, isFlagged: false, neighborMines: 0 });
            
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.r = r; cell.dataset.c = c;
            
            // Random màu môi trường (Biome Đất)
            let randomColor = TERRAIN_COLORS[Math.floor(Math.random() * TERRAIN_COLORS.length)];
            cell.style.backgroundColor = randomColor;
            cell.dataset.color = randomColor; // Lưu lại để dùng cho hạt bụi
            
            cell.addEventListener('click', (e) => handleLeftClick(e, r, c));
            cell.addEventListener('contextmenu', (e) => handleRightClick(e, r, c));
            boardElement.appendChild(cell);
        }
        board.push(row);
    }
    updateDashboard();
}

function placeMines(safeRow, safeCol) {
    let allPos = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (r !== safeRow || c !== safeCol) allPos.push({r, c});
        }
    }
    for (let i = allPos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allPos[i], allPos[j]] = [allPos[j], allPos[i]];
    }
    for (let i = 0; i < MINES_COUNT; i++) board[allPos[i].r][allPos[i].c].isMine = true;
    
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c].isMine) continue;
            let count = 0;
            for (let [dr, dc] of dirs) {
                let nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].isMine) count++;
            }
            board[r][c].neighborMines = count;
        }
    }
}

function handleLeftClick(e, r, c) {
    if (isGameOver || board[r][c].isFlagged || board[r][c].isRevealed) return;

    if (isFirstClick) {
        placeMines(r, c);
        isFirstClick = false;
    }

    let cellDOM = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);

    // XỬ LÝ KỸ NĂNG: MÁY DÒ
    if (isScanMode) {
        playSound('scan');
        let scanMines = board[r][c].isMine ? 1 : board[r][c].neighborMines;
        // Chớp số mìn tạm thời trên ô đó
        cellDOM.innerText = "🔍" + scanMines;
        setTimeout(() => { if(!board[r][c].isRevealed) cellDOM.innerText = ''; }, 1500);
        
        isScanMode = false;
        scansLeft--;
        boardElement.classList.remove('scan-mode');
        updateDashboard();
        return; // Dừng lại, không mở ô
    }

    // Tung bụi mù mịt khi đào
    spawnDust(e, cellDOM.dataset.color);

    if (board[r][c].isMine) {
        // XỬ LÝ KỸ NĂNG: KHIÊN
        if (armorCount > 0) {
            playSound('shield');
            armorCount--;
            board[r][c].isRevealed = true;
            board[r][c].isFlagged = true; // Tự động cắm cờ
            flagsPlaced++;
            revealedCount++;
            cellDOM.innerText = '🛡️';
            cellDOM.classList.add('revealed', 'defused');
            updateDashboard();
            checkWin();
            return;
        }

        playSound('boom');
        boardElement.classList.add('shake-effect');
        revealAllMines();
        setTimeout(() => boardElement.classList.remove('shake-effect'), 500);
        isGameOver = true;
    } else {
        playSound('click');
        revealCell(r, c);
        updateDashboard();
        checkWin();
    }
}

function handleRightClick(e, r, c) {
    e.preventDefault();
    if (isGameOver || board[r][c].isRevealed) return;

    let cell = board[r][c];
    let cellDOM = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);

    if (!cell.isFlagged && flagsPlaced < MINES_COUNT) {
        cell.isFlagged = true; cellDOM.innerText = '🚩';
        flagsPlaced++; playSound('flag');
    } else if (cell.isFlagged) {
        cell.isFlagged = false; cellDOM.innerText = '';
        flagsPlaced--; playSound('click');
    }
    updateDashboard();
}

function revealCell(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    let cell = board[r][c];
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true; revealedCount++;
    let cellDOM = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
    cellDOM.classList.add('revealed');
    cellDOM.style.backgroundColor = ''; // Bỏ màu đất đi, hiện lớp đá bên dưới

    if (cell.neighborMines > 0) {
        cellDOM.innerText = cell.neighborMines;
        cellDOM.dataset.mines = cell.neighborMines;
    } else {
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let [dr, dc] of dirs) revealCell(r + dr, c + dc);
    }
}

function updateDashboard() {
    let unrevealedCount = (ROWS * COLS) - revealedCount;
    uiFlags.innerText = `${flagsPlaced} / ${MINES_COUNT}`;
    uiUnrevealed.innerText = unrevealedCount;
    uiArmor.innerText = armorCount;
    uiScans.innerText = scansLeft;

    if(scansLeft === 0) btnScan.disabled = true;

    let safeToClick = unrevealedCount - flagsPlaced;
    let assumedMinesLeft = MINES_COUNT - flagsPlaced;
    let prob = (safeToClick > 0 && assumedMinesLeft > 0) ? (assumedMinesLeft / safeToClick) * 100 : 0;
    uiProb.innerText = prob.toFixed(1) + "%";
}

// Bật tắt chế độ Máy Dò
btnScan.addEventListener('click', () => {
    if (scansLeft > 0 && !isGameOver && !isFirstClick) {
        isScanMode = !isScanMode;
        boardElement.classList.toggle('scan-mode');
    } else if (isFirstClick) {
        alert("Hãy cuốc nhát đầu tiên trước khi dùng máy dò!");
    }
});

function revealAllMines() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c].isMine && !board[r][c].isFlagged) {
                let cellDOM = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
                cellDOM.classList.add('revealed', 'mine');
                cellDOM.innerText = '💣';
            }
        }
    }
}

function checkWin() {
    if (revealedCount === (ROWS * COLS) - MINES_COUNT + (1 - armorCount)) {
        setTimeout(() => alert("CHÚC MỪNG! BẠN ĐÃ ĐÀO HẾT CỔ VẬT! 😎"), 100);
        localStorage.setItem('mine_win', (parseInt(localStorage.getItem('mine_win')) || 0) + 1);
        isGameOver = true;
        localStorage.setItem('mine_lose', (parseInt(localStorage.getItem('mine_lose')) || 0) + 1);
    }
}

btnReset.addEventListener('click', initGame);
initGame();